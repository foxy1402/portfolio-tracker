
        // Admin Page Logic - Enhanced
        let selectedCategory = 'crypto';
        let editingId = null;
        let currentUser = null;

        let adminInitialized = false;

        function initAdmin() {
            setupAuth();
            if (localStorage.getItem('portfolio_skip_auth') === '1') {
                hideAuthModal();
            }
            setupCategorySelector();
            setupForm();
            setupApiKeyManagement(); // ✨ NEW
            setupSync();
            setupExport();
            renderAssetsList();
            setupBulkUpdate();
            document.getElementById('checkCacheBtn')?.addEventListener('click', showCacheStats);
            document.getElementById('clearCacheBtn')?.addEventListener('click', clearHistoricalCache);
        }

        // ============ CoinStats API Key Management ============
        function setupApiKeyManagement() {
            const apiKeyInput = document.getElementById('coinstatsApiKey');
            const saveBtn = document.getElementById('saveKeyBtn');
            const testBtn = document.getElementById('testKeyBtn');
            const showBtn = document.getElementById('showKeyBtn');
            const clearBtn = document.getElementById('clearKeyBtn');
            const statusDiv = document.getElementById('apiKeyStatus');
            const setKeyStatus = (ok, message) => {
                statusDiv.style.display = 'block';
                statusDiv.replaceChildren();
                const box = document.createElement('div');
                box.style.cssText = ok
                    ? 'padding:12px;background:var(--profit-bg);border:1px solid var(--profit-border);border-radius:8px;color:var(--profit-text)'
                    : 'padding:12px;background:var(--loss-bg);border:1px solid var(--loss-border);border-radius:8px;color:var(--loss-text)';
                box.textContent = message;
                statusDiv.appendChild(box);
            };

            // Load existing key
            const existingKey = CoinStatsAPIKeyManager.get();
            if (existingKey) {
                apiKeyInput.value = existingKey;
            }

            // Save API key
            saveBtn.addEventListener('click', async () => {
                const apiKey = apiKeyInput.value.trim();

                if (!apiKey) {
                    ToastManager.warning('Please enter an API key');
                    return;
                }

                statusDiv.style.display = 'block';
                statusDiv.textContent = 'Validating...';

                saveBtn.disabled = true;
                try {
                    const validation = await CoinStatsAPIKeyManager.validate(apiKey);

                    if (validation.valid) {
                        CoinStatsAPIKeyManager.set(apiKey);
                        setKeyStatus(true, `API key saved. BTC: $${Number(validation.testPrice).toLocaleString()}`);

                        ToastManager.success('API key saved!');

                        if (PortfolioApp.isAuthenticated()) {
                            try {
                                await PortfolioApp.syncToGist();
                                ToastManager.success('Synced to cloud!');
                            } catch (error) {
                                console.warn('Sync failed:', error);
                            }
                        }
                    } else {
                        setKeyStatus(false, `Invalid: ${validation.error || 'Unknown error'}`);
                        ToastManager.error('Invalid API key');
                    }
                } catch (error) {
                    setKeyStatus(false, error.message || 'Validation failed');
                    ToastManager.error('Validation failed');
                } finally {
                    saveBtn.disabled = false;
                }
            });

            // Test connection
            testBtn.addEventListener('click', async () => {
                const apiKey = apiKeyInput.value.trim();

                statusDiv.style.display = 'block';
                statusDiv.textContent = 'Testing...';
                testBtn.disabled = true;
                const validation = await CoinStatsAPIKeyManager.validate(apiKey);
                testBtn.disabled = false;

                if (validation.valid) {
                    setKeyStatus(true, `Success. BTC: $${Number(validation.testPrice).toLocaleString()}`);
                    ToastManager.success('Connection successful!');
                } else {
                    setKeyStatus(false, `Failed: ${validation.error || 'Unknown error'}`);
                    ToastManager.error('Connection failed');
                }
            });

            // Show/hide key
            showBtn.addEventListener('click', () => {
                const isPassword = apiKeyInput.type === 'password';
                apiKeyInput.type = isPassword ? 'text' : 'password';
                showBtn.textContent = isPassword ? '🙈 Hide' : '👁️ Show';
            });

            // Clear key
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear API key?')) {
                    CoinStatsAPIKeyManager.clear();
                    apiKeyInput.value = '';
                    statusDiv.style.display = 'none';
                    ToastManager.info('Cleared');
                }
            });
        }

        // ============ Bulk Update ============
        function setupBulkUpdate() {
            document.getElementById('bulkUpdateBtn').addEventListener('click', () => {
                const date = document.getElementById('bulkPurchaseDate').value;
                if (!date) {
                    ToastManager.warning('Please select a date');
                    return;
                }

                if (!confirm(`Set purchase date to ${date} for every asset? This overwrites existing dates.`)) {
                    return;
                }

                const assets = PortfolioApp.getAssets();
                let updated = 0;

                assets.forEach(asset => {
                    asset.purchaseDate = date;
                    updated++;
                });

                if (updated > 0) {
                    PortfolioApp.saveAssets(assets);
                    ToastManager.success(`Updated ${updated} assets`);
                    renderAssetsList();
                } else {
                    ToastManager.info('No assets needed updating');
                }
            });
        }

        function addPurchaseDateToExistingAssets() {
            const assets = PortfolioApp.getAssets();
            let updated = 0;

            assets.forEach(asset => {
                if (!asset.purchaseDate) {
                    // Default to 30 days ago if no purchase date
                    const defaultDate = new Date();
                    defaultDate.setDate(defaultDate.getDate() - 30);
                    asset.purchaseDate = defaultDate.toISOString().split('T')[0];
                    updated++;
                }
            });

            if (updated > 0) {
                PortfolioApp.saveAssets(assets);
                ToastManager.success(`Added default purchase dates to ${updated} assets`);
                console.log(`✓ Migrated ${updated} assets with default purchase dates`);
            }
        }

        // ============ Authentication ============
        function setupAuth() {
            const authForm = document.getElementById('authForm');
            const skipBtn = document.getElementById('skipAuthBtn');

            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const token = document.getElementById('authToken').value.trim();
                const errorDiv = document.getElementById('authError');

                errorDiv.style.display = 'none';

                const result = await PortfolioApp.validateToken(token);

                if (result.valid) {
                    PortfolioApp.setSessionToken(token);
                    currentUser = result.username;
                    hideAuthModal();
                    showSyncBar();
                    ToastManager.success(`Welcome, ${currentUser}!`);
                } else {
                    errorDiv.textContent = 'Invalid token. Please check and try again.';
                    errorDiv.style.display = 'block';
                }
            });

            skipBtn.addEventListener('click', () => {
                localStorage.setItem('portfolio_skip_auth', '1');
                hideAuthModal();
                ToastManager.info('Working in local-only mode');
            });
        }

        function hideAuthModal() {
            document.getElementById('authOverlay').style.display = 'none';
        }

        function showSyncBar() {
            document.getElementById('syncBar').style.display = 'flex';
            document.getElementById('username').textContent = currentUser || 'Guest';
        }

        // ============ Sync Functions ============
        function setupSync() {
            document.getElementById('syncUpBtn').addEventListener('click', syncUp);
            document.getElementById('syncDownBtn').addEventListener('click', syncDown);
            document.getElementById('logoutBtn').addEventListener('click', logout);
        }

        async function syncUp() {
            const statusEl = document.getElementById('syncStatus');
            const upBtn = document.getElementById('syncUpBtn');
            const downBtn = document.getElementById('syncDownBtn');
            statusEl.textContent = 'Pushing...';
            statusEl.className = 'sync-status';
            upBtn.disabled = true;
            downBtn.disabled = true;

            try {
                await PortfolioApp.syncToGist();
                statusEl.textContent = 'Pushed successfully!';
                statusEl.className = 'sync-status success';
                ToastManager.success('Data synced to cloud!');
            } catch (error) {
                statusEl.textContent = 'Push failed: ' + error.message;
                statusEl.className = 'sync-status error';
                ToastManager.error('Sync failed: ' + error.message);
            } finally {
                upBtn.disabled = false;
                downBtn.disabled = false;
            }
        }

        async function syncDown() {
            if (!confirm('Download from cloud will replace the assets on this device. Continue?')) {
                return;
            }

            const statusEl = document.getElementById('syncStatus');
            const upBtn = document.getElementById('syncUpBtn');
            const downBtn = document.getElementById('syncDownBtn');
            statusEl.textContent = 'Pulling...';
            statusEl.className = 'sync-status';
            upBtn.disabled = true;
            downBtn.disabled = true;

            try {
                const result = await PortfolioApp.syncFromGist();
                if (result.success) {
                    statusEl.textContent = `Pulled ${result.count} assets!`;
                    statusEl.className = 'sync-status success';
                    renderAssetsList();
                    ToastManager.success(`Loaded ${result.count} assets from cloud!`);
                } else {
                    statusEl.textContent = result.message;
                    statusEl.className = 'sync-status error';
                }
            } catch (error) {
                statusEl.textContent = 'Pull failed: ' + error.message;
                statusEl.className = 'sync-status error';
                ToastManager.error('Pull failed: ' + error.message);
            } finally {
                upBtn.disabled = false;
                downBtn.disabled = false;
            }
        }

        function logout() {
            PortfolioApp.logout();
            currentUser = null;
            document.getElementById('syncBar').style.display = 'none';
            document.getElementById('authOverlay').style.display = 'flex';
            document.getElementById('authToken').value = '';
            ToastManager.info('Logged out');
        }

        // ============ Category Selector ============
        function setupCategorySelector() {
            const buttons = document.querySelectorAll('.category-btn');

            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedCategory = btn.dataset.category;
                });
            });
        }

        // ============ Form Handling ============
        function setupForm() {
            const form = document.getElementById('assetForm');
            const cancelBtn = document.getElementById('cancelBtn');

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                saveAsset();
            });

            cancelBtn.addEventListener('click', () => {
                resetForm();
            });
        }

        function saveAsset() {
            const asset = {
                name: document.getElementById('assetName').value.trim(),
                symbol: document.getElementById('assetSymbol').value.trim().toUpperCase(),
                coinstatsId: document.getElementById('coinstatsId').value.trim() || null,
                manualPrice: document.getElementById('manualPrice').value || null,
                buyPrice: document.getElementById('buyPrice').value || null,
                purchaseDate: document.getElementById('purchaseDate').value || null,
                balance: document.getElementById('assetBalance').value,
                iconUrl: document.getElementById('iconUrl').value.trim() || null,
                notes: document.getElementById('assetNotes').value.trim() || null,
                category: selectedCategory
            };

            const isEdit = !!editingId;
            const oldAsset = isEdit ? PortfolioApp.getAssets().find(a => a.id === editingId) : null;

            if (editingId) {
                PortfolioApp.updateAsset(editingId, asset);
                ToastManager.success(`Updated ${asset.name}`);
            } else {
                PortfolioApp.addAsset(asset);
                ToastManager.success(`Added ${asset.name}`);
            }

            resetForm();
            renderAssetsList();
        }

        function editAsset(id) {
            const assets = PortfolioApp.getAssets();
            const asset = assets.find(a => a.id === id);

            if (!asset) return;

            editingId = id;

            // Fill form
            document.getElementById('assetName').value = asset.name;
            document.getElementById('assetSymbol').value = asset.symbol || '';
            document.getElementById('coinstatsId').value = asset.coinstatsId || '';
            document.getElementById('manualPrice').value = asset.manualPrice || '';
            document.getElementById('buyPrice').value = asset.buyPrice || '';
            document.getElementById('purchaseDate').value = asset.purchaseDate || '';
            document.getElementById('assetBalance').value = asset.balance;
            document.getElementById('iconUrl').value = asset.iconUrl || '';
            document.getElementById('assetNotes').value = asset.notes || '';

            // Select category
            selectedCategory = asset.category;
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === selectedCategory);
            });

            // Update UI
            document.getElementById('formTitle').textContent = 'Edit Asset';
            document.getElementById('cancelBtn').style.display = 'block';

            // Scroll to form
            document.getElementById('assetForm').scrollIntoView({ behavior: 'smooth' });
        }

        function deleteAsset(id) {
            const asset = PortfolioApp.getAssets().find(a => a.id === id);
            if (!asset) return;

            if (confirm(`Are you sure you want to delete ${asset.name}?`)) {
                PortfolioApp.deleteAsset(id);
                renderAssetsList();
                ToastManager.info(`Deleted ${asset.name}`);

                if (editingId === id) {
                    resetForm();
                }
            }
        }

        function resetForm() {
            editingId = null;
            document.getElementById('assetForm').reset();
            document.getElementById('formTitle').textContent = 'Add New Asset';
            document.getElementById('cancelBtn').style.display = 'none';

            // Reset category to crypto
            selectedCategory = 'crypto';
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === 'crypto');
            });
        }

        // ============ Export Functions ============
        function setupExport() {
            document.getElementById('exportCsvBtn').addEventListener('click', exportAssetsCSV);
        }

        function exportAssetsCSV() {
            const assets = PortfolioApp.getAssets();
            if (assets.length === 0) {
                ToastManager.warning('No assets to export');
                return;
            }

            const csvEscape = (value) => {
                const str = String(value ?? '');
                if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
                return str;
            };

            const headers = ['Name', 'Symbol', 'Category', 'Balance', 'Buy Price', 'Purchase Date', 'Notes'];
            const rows = assets.map(a => [
                csvEscape(a.name),
                csvEscape(a.symbol || ''),
                csvEscape(a.category),
                csvEscape(a.balance),
                csvEscape(a.buyPrice || ''),
                csvEscape(a.purchaseDate || ''),
                csvEscape(a.notes || '')
            ]);

            downloadCSV([headers, ...rows], 'portfolio_assets.csv');
            ToastManager.success('Assets exported!');
        }

        function downloadCSV(rows, filename) {
            const csv = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        // ============ Render Assets ============
        function renderAssetsList() {
            const container = document.getElementById('adminAssetsList');
            const assets = PortfolioApp.getAssets();

            if (assets.length === 0) {
                DOMUtils.showEmptyState(container, 'No assets added yet');
                return;
            }

            const grouped = {
                crypto: assets.filter(a => a.category === 'crypto'),
                stocks: assets.filter(a => a.category === 'stocks'),
                gold: assets.filter(a => a.category === 'gold')
            };

            const categoryLabels = {
                crypto: '🪙 Crypto',
                stocks: '📈 USA Stocks',
                gold: '🥇 Gold'
            };

            container.innerHTML = '';

            Object.entries(grouped).forEach(([cat, catAssets]) => {
                if (catAssets.length === 0) return;

                const header = DOMUtils.createElement('h4', {
                    text: categoryLabels[cat],
                    styles: {
                        color: `var(--accent-${cat})`,
                        margin: '1rem 0 0.5rem'
                    }
                });
                container.appendChild(header);

                catAssets.forEach(asset => {
                    const item = DOMUtils.createAdminAssetItem(asset, {
                        onEdit: editAsset,
                        onDelete: deleteAsset
                    });
                    container.appendChild(item);
                });
            });
        }

        // ============ Cache Management ============
        function showCacheStats() {
            if (typeof HistoricalPriceAPI === 'undefined') {
                ToastManager.error('Historical API not loaded');
                return;
            }
            const stats = HistoricalPriceAPI.getCacheStats();
            const container = document.getElementById('cacheStats');
            if (container) {
                container.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Entries:</span>
                        <strong style="color: var(--text-primary);">${stats.entries}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Size:</span>
                        <strong style="color: var(--text-primary);">${stats.sizeKB} KB</strong>
                    </div>
                `;
            }
            ToastManager.info(`Cache has ${stats.entries} entries`);
        }

        function clearHistoricalCache() {
            if (confirm('Clear all historical price cache? (This will trigger new API calls next time)')) {
                if (typeof HistoricalPriceAPI !== 'undefined' && HistoricalPriceAPI.clearCache) {
                    HistoricalPriceAPI.clearCache();
                }
                CacheManager.clear();

                showCacheStats();
                ToastManager.success('Cache cleared!');
            }
        }

        function showAdmin() {
            if (!adminInitialized) {
                initAdmin();
                adminInitialized = true;
                return;
            }
            renderAssetsList();
        }

        window.AdminPage = { onShow: showAdmin, init: initAdmin };
        window.showCacheStats = showCacheStats;
        window.clearHistoricalCache = clearHistoricalCache;
    