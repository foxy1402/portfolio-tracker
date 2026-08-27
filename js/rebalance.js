
        // Rebalance Calculator Logic
        let portfolioData = null;
        let assetSelections = {}; // { assetId: { selected: bool, targetPercent: number } }

        let rebalanceInitialized = false;

        async function initRebalance() {
            await loadPortfolio();
            renderCategorySections();
            setupEventListeners();
            validateAll();
        }

        async function loadPortfolio() {
            try {
                portfolioData = await PortfolioApp.calculatePortfolio();
                renderCurrentAllocation();
                initializeAssetSelections();
            } catch (error) {
                console.error('Error loading portfolio:', error);
                document.getElementById('currentAllocation').innerHTML = `
                    <div class="no-assets-message">
                        Error loading portfolio. <a href="#/">Go to dashboard</a>
                    </div>
                `;
            }
        }

        function initializeAssetSelections() {
            if (!portfolioData || !portfolioData.assets) return;

            // Group assets by category to calculate default percentages
            const categoryAssets = { crypto: [], stocks: [], gold: [] };
            portfolioData.assets.forEach(asset => {
                if (categoryAssets[asset.category]) {
                    categoryAssets[asset.category].push(asset);
                }
            });

            // Initialize each asset with equal distribution within category
            portfolioData.assets.forEach(asset => {
                if (assetSelections[asset.id]) return;
                const assetsInCategory = categoryAssets[asset.category]?.length || 1;
                const equalPercent = Math.round(100 / assetsInCategory);
                assetSelections[asset.id] = {
                    selected: true,
                    targetPercent: equalPercent
                };
            });

            // Adjust to ensure exactly 100% per category
            ['crypto', 'stocks', 'gold'].forEach(category => {
                adjustCategoryTotal(category);
            });
        }

        function adjustCategoryTotal(category) {
            if (!portfolioData) return;

            const categoryAssets = portfolioData.assets.filter(a => a.category === category);
            const selectedAssets = categoryAssets.filter(a => assetSelections[a.id]?.selected);

            if (selectedAssets.length === 0) return;

            // Calculate current total
            const currentTotal = selectedAssets.reduce((sum, a) => sum + (assetSelections[a.id]?.targetPercent || 0), 0);

            // If not 100%, adjust the last selected asset
            if (currentTotal !== 100 && selectedAssets.length > 0) {
                const lastAsset = selectedAssets[selectedAssets.length - 1];
                assetSelections[lastAsset.id].targetPercent += (100 - currentTotal);
            }
        }

        function renderCurrentAllocation() {
            const container = document.getElementById('currentAllocation');
            const totalEl = document.getElementById('rebalanceTotalValue');

            if (!portfolioData || portfolioData.grandTotal === 0) {
                DOMUtils.showEmptyState(container, 'No assets in your portfolio', {
                    text: 'Add assets first',
                    href: '#/manage'
                });
                // Fix grid layout for empty state
                const emptyState = container.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.style.gridColumn = '1 / -1';
                }

                totalEl.textContent = 'Total Portfolio: $0';
                return;
            }

            const { categories, grandTotal } = portfolioData;

            container.innerHTML = '';

            const cats = ['crypto', 'stocks', 'gold'];
            const labels = { crypto: 'Crypto', stocks: 'Stocks', gold: 'Gold' };

            cats.forEach(cat => {
                const card = DOMUtils.createElement('div', {
                    className: `allocation-card ${cat}`
                });

                const label = DOMUtils.createElement('div', {
                    className: 'allocation-label',
                    text: labels[cat]
                });

                const value = DOMUtils.createElement('div', {
                    className: `allocation-value ${cat}`,
                    text: PortfolioApp.formatCurrency(categories[cat].total)
                });

                const percent = DOMUtils.createElement('div', {
                    className: 'allocation-percent',
                    text: categories[cat].percentage.toFixed(1) + '%'
                });

                card.appendChild(label);
                card.appendChild(value);
                card.appendChild(percent);
                container.appendChild(card);
            });

            totalEl.textContent = `Total Portfolio: ${PortfolioApp.formatCurrency(grandTotal)}`;
        }

        function renderCategorySections() {
            const container = document.getElementById('categorySelections');
            const savedTargets = {};
            ['crypto', 'stocks', 'gold'].forEach((category) => {
                const existing = document.getElementById(`target-${category}`);
                if (existing) savedTargets[category] = existing.value;
            });
            container.replaceChildren();
            if (!portfolioData || !portfolioData.assets) {
                return;
            }

            const categoryConfig = {
                crypto: { emoji: '🪙', name: 'Crypto', defaultTarget: 50 },
                stocks: { emoji: '📈', name: 'Stocks', defaultTarget: 30 },
                gold: { emoji: '🥇', name: 'Gold', defaultTarget: 20 }
            };

            ['crypto', 'stocks', 'gold'].forEach(category => {
                const config = categoryConfig[category];
                const categoryAssets = portfolioData.assets.filter(a => a.category === category);
                const selectedCount = categoryAssets.filter(a => assetSelections[a.id]?.selected).length;
                const totalCount = categoryAssets.length;

                const section = document.createElement('div');
                section.className = `category-section ${category}`;
                section.id = `section-${category}`;

                const header = document.createElement('div');
                header.className = 'category-header';
                header.setAttribute('role', 'button');
                header.tabIndex = 0;
                header.addEventListener('click', () => toggleCategory(category));
                header.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCategory(category);
                    }
                });

                const headerLeft = document.createElement('div');
                headerLeft.className = 'category-header-left';
                const headerInfo = document.createElement('div');
                headerInfo.className = 'category-header-info';
                const title = document.createElement('div');
                title.className = 'category-header-title';
                const emoji = document.createElement('span');
                emoji.textContent = config.emoji;
                const name = document.createElement('span');
                name.textContent = config.name;
                title.appendChild(emoji);
                title.appendChild(name);
                const subtitle = document.createElement('div');
                subtitle.className = 'category-header-subtitle';
                subtitle.textContent = `${selectedCount}/${totalCount} assets selected`;
                headerInfo.appendChild(title);
                headerInfo.appendChild(subtitle);
                headerLeft.appendChild(headerInfo);

                const headerRight = document.createElement('div');
                headerRight.className = 'category-header-right';
                const targetInput = document.createElement('input');
                targetInput.type = 'number';
                targetInput.className = 'category-target-input';
                targetInput.id = `target-${category}`;
                targetInput.value = savedTargets[category] ?? String(config.defaultTarget);
                targetInput.min = '0';
                targetInput.max = '100';
                targetInput.step = '1';
                targetInput.addEventListener('click', (e) => e.stopPropagation());
                targetInput.addEventListener('input', validateAll);
                const pctLabel = document.createElement('span');
                pctLabel.style.color = 'var(--text-muted)';
                pctLabel.textContent = '%';
                const expand = document.createElement('span');
                expand.className = 'expand-icon';
                expand.textContent = '▼';
                headerRight.appendChild(targetInput);
                headerRight.appendChild(pctLabel);
                headerRight.appendChild(expand);

                header.appendChild(headerLeft);
                header.appendChild(headerRight);

                const assetList = document.createElement('div');
                assetList.className = 'asset-list';

                if (categoryAssets.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'asset-item';
                    const em = document.createElement('em');
                    em.style.color = 'var(--text-muted)';
                    em.textContent = 'No assets in this category';
                    empty.appendChild(em);
                    assetList.appendChild(empty);
                } else {
                    categoryAssets.forEach(asset => {
                        const selection = assetSelections[asset.id] || { selected: true, targetPercent: 0 };
                        const item = document.createElement('div');
                        item.className = 'asset-item';
                        item.id = `asset-item-${asset.id}`;

                        const left = document.createElement('div');
                        left.className = 'asset-item-left';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'asset-checkbox';
                        checkbox.id = `check-${asset.id}`;
                        checkbox.checked = !!selection.selected;
                        checkbox.addEventListener('change', () => toggleAsset(asset.id, category));

                        const icon = document.createElement('div');
                        icon.className = `asset-icon ${category}`;
                        if (asset.iconUrl) {
                            const img = document.createElement('img');
                            img.src = asset.iconUrl;
                            img.alt = asset.symbol || asset.name || '';
                            img.addEventListener('error', () => {
                                img.remove();
                                icon.textContent = asset.symbol ? asset.symbol.substring(0, 2) : '??';
                            });
                            icon.appendChild(img);
                        } else {
                            icon.textContent = asset.symbol ? asset.symbol.substring(0, 2) : '??';
                        }

                        const info = document.createElement('div');
                        info.className = 'asset-info';
                        const assetName = document.createElement('div');
                        assetName.className = 'asset-name';
                        assetName.textContent = asset.name || '';
                        const assetValue = document.createElement('div');
                        assetValue.className = 'asset-value';
                        assetValue.textContent = PortfolioApp.formatCurrency(asset.value);
                        info.appendChild(assetName);
                        info.appendChild(assetValue);

                        left.appendChild(checkbox);
                        left.appendChild(icon);
                        left.appendChild(info);

                        const targetGroup = document.createElement('div');
                        targetGroup.className = 'asset-target-group';
                        const assetTarget = document.createElement('input');
                        assetTarget.type = 'number';
                        assetTarget.className = 'asset-target-input';
                        assetTarget.id = `target-asset-${asset.id}`;
                        assetTarget.value = String(selection.targetPercent);
                        assetTarget.min = '0';
                        assetTarget.max = '100';
                        assetTarget.step = '1';
                        assetTarget.disabled = !selection.selected;
                        assetTarget.addEventListener('change', () => updateAssetTarget(asset.id, category));
                        const assetPct = document.createElement('span');
                        assetPct.className = 'asset-target-label';
                        assetPct.textContent = '%';
                        targetGroup.appendChild(assetTarget);
                        targetGroup.appendChild(assetPct);

                        item.appendChild(left);
                        item.appendChild(targetGroup);
                        assetList.appendChild(item);
                    });
                }

                const intraCategoryTotal = categoryAssets.reduce((sum, a) => {
                    if (assetSelections[a.id]?.selected) {
                        return sum + (assetSelections[a.id]?.targetPercent || 0);
                    }
                    return sum;
                }, 0);

                const intra = document.createElement('div');
                intra.className = `intra-category-total ${intraCategoryTotal === 100 ? 'valid' : 'invalid'}`;
                intra.id = `intra-total-${category}`;
                intra.textContent = `Asset allocation: ${intraCategoryTotal}% ${intraCategoryTotal === 100 ? '✓' : '(must be 100%)'}`;
                assetList.appendChild(intra);

                section.appendChild(header);
                section.appendChild(assetList);
                container.appendChild(section);
            });
        }

        function toggleCategory(category) {
            const section = document.getElementById(`section-${category}`);
            section.classList.toggle('expanded');
        }

        function toggleAsset(assetId, category) {
            const checkbox = document.getElementById(`check-${assetId}`);
            const targetInput = document.getElementById(`target-asset-${assetId}`);

            assetSelections[assetId].selected = checkbox.checked;
            targetInput.disabled = !checkbox.checked;

            if (!checkbox.checked) {
                assetSelections[assetId].targetPercent = 0;
                targetInput.value = 0;
            } else {
                // Redistribute percentages among selected assets
                redistributePercentages(category);
            }

            updateIntraCategoryTotal(category);
            updateCategorySubtitle(category);
            validateAll();
        }

        function updateAssetTarget(assetId, category) {
            const input = document.getElementById(`target-asset-${assetId}`);
            const value = parseFloat(input.value) || 0;
            assetSelections[assetId].targetPercent = Math.min(100, Math.max(0, value));
            input.value = assetSelections[assetId].targetPercent;

            updateIntraCategoryTotal(category);
            validateAll();
        }

        function redistributePercentages(category) {
            const categoryAssets = portfolioData.assets.filter(a => a.category === category);
            const selectedAssets = categoryAssets.filter(a => assetSelections[a.id]?.selected);

            if (selectedAssets.length === 0) return;

            const equalPercent = Math.floor(100 / selectedAssets.length);
            const remainder = 100 - (equalPercent * selectedAssets.length);

            selectedAssets.forEach((asset, index) => {
                const extra = index < remainder ? 1 : 0;
                assetSelections[asset.id].targetPercent = equalPercent + extra;
                const input = document.getElementById(`target-asset-${asset.id}`);
                if (input) input.value = assetSelections[asset.id].targetPercent;
            });
        }

        function updateIntraCategoryTotal(category) {
            const categoryAssets = portfolioData.assets.filter(a => a.category === category);
            const total = categoryAssets.reduce((sum, a) => {
                if (assetSelections[a.id]?.selected) {
                    return sum + (assetSelections[a.id]?.targetPercent || 0);
                }
                return sum;
            }, 0);

            const totalEl = document.getElementById(`intra-total-${category}`);
            if (totalEl) {
                totalEl.textContent = `Asset allocation: ${total}% ${total === 100 ? '✓' : '(must be 100%)'}`;
                totalEl.className = `intra-category-total ${total === 100 ? 'valid' : 'invalid'}`;
            }
        }

        function updateCategorySubtitle(category) {
            const categoryAssets = portfolioData.assets.filter(a => a.category === category);
            const selectedCount = categoryAssets.filter(a => assetSelections[a.id]?.selected).length;
            const totalCount = categoryAssets.length;

            const section = document.getElementById(`section-${category}`);
            const subtitle = section?.querySelector('.category-header-subtitle');
            if (subtitle) {
                subtitle.textContent = `${selectedCount}/${totalCount} assets selected`;
            }
        }

        function setupEventListeners() {
            if (setupEventListeners.bound) return;
            setupEventListeners.bound = true;
            document.getElementById('calculateBtn').addEventListener('click', calculateRebalance);
        }

        function validateAll() {
            const crypto = parseFloat(document.getElementById('target-crypto')?.value) || 0;
            const stocks = parseFloat(document.getElementById('target-stocks')?.value) || 0;
            const gold = parseFloat(document.getElementById('target-gold')?.value) || 0;

            const categoryTotal = crypto + stocks + gold;
            const totalEl = document.getElementById('targetTotal');
            const calcBtn = document.getElementById('calculateBtn');

            totalEl.textContent = `Total: ${categoryTotal}%`;

            // Check category totals
            const categoryValid = categoryTotal === 100;

            // Check intra-category totals
            let intraValid = true;
            ['crypto', 'stocks', 'gold'].forEach(category => {
                const categoryAssets = portfolioData?.assets?.filter(a => a.category === category) || [];
                const selectedAssets = categoryAssets.filter(a => assetSelections[a.id]?.selected);
                const target = parseFloat(document.getElementById(`target-${category}`)?.value) || 0;

                if (target > 0 && selectedAssets.length === 0) {
                    intraValid = false;
                }

                if (selectedAssets.length > 0) {
                    const intraTotal = selectedAssets.reduce((sum, a) => sum + (assetSelections[a.id]?.targetPercent || 0), 0);
                    if (intraTotal !== 100) {
                        intraValid = false;
                    }
                }
            });

            const allValid = categoryValid && intraValid;

            if (allValid) {
                totalEl.className = 'target-total valid';
                calcBtn.disabled = false;
            } else {
                totalEl.className = 'target-total invalid';
                calcBtn.disabled = true;
            }

            return allValid;
        }

        function calculateRebalance() {
            if (!validateAll() || !portfolioData || portfolioData.grandTotal === 0) {
                return;
            }

            const targetCrypto = parseFloat(document.getElementById('target-crypto').value) / 100;
            const targetStocks = parseFloat(document.getElementById('target-stocks').value) / 100;
            const targetGold = parseFloat(document.getElementById('target-gold').value) / 100;

            const { categories, grandTotal, assets } = portfolioData;

            // Calculate target values for each category
            const targets = {
                crypto: grandTotal * targetCrypto,
                stocks: grandTotal * targetStocks,
                gold: grandTotal * targetGold
            };

            // Calculate difference (positive = need to buy, negative = need to sell)
            const diffs = {
                crypto: targets.crypto - categories.crypto.total,
                stocks: targets.stocks - categories.stocks.total,
                gold: targets.gold - categories.gold.total
            };

            // Calculate per-asset recommendations using intra-category targets
            const assetRecommendations = calculateAssetRecommendations(assets, targets, diffs);

            // Render results
            renderResults(diffs, assetRecommendations, targets);
        }

        function calculateAssetRecommendations(assets, targets, diffs) {
            const recommendations = [];

            ['crypto', 'stocks', 'gold'].forEach(category => {
                const categoryAssets = assets.filter(a => a.category === category);
                const categoryTarget = targets[category];

                categoryAssets.forEach(asset => {
                    const selection = assetSelections[asset.id];
                    const isSelected = selection?.selected;
                    const targetPercent = (selection?.targetPercent || 0) / 100;

                    if (!isSelected) {
                        // Asset not selected - recommend selling all
                        const usdChange = -asset.value;
                        const amountChange = -asset.balance;
                        recommendations.push({
                            ...asset,
                            usdChange,
                            amountChange,
                            action: asset.value > 1 ? 'sell' : 'hold',
                            excluded: true
                        });
                    } else {
                        // Calculate target value for this asset based on intra-category percentage
                        const assetTargetValue = categoryTarget * targetPercent;
                        const usdChange = assetTargetValue - asset.value;
                        const amountChange = asset.currentPrice > 0 ? usdChange / asset.currentPrice : 0;

                        recommendations.push({
                            ...asset,
                            usdChange,
                            amountChange,
                            targetValue: assetTargetValue,
                            targetPercent: targetPercent * 100,
                            action: usdChange > 1 ? 'buy' : usdChange < -1 ? 'sell' : 'hold'
                        });
                    }
                });
            });

            return recommendations;
        }

        function renderResults(diffs, assetRecommendations, targets) {
            const resultsSection = document.getElementById('resultsSection');
            const resultsContent = document.getElementById('resultsContent');
            const summaryGrid = document.getElementById('summaryGrid');

            const categoryLabels = {
                crypto: { emoji: '🪙', name: 'Crypto' },
                stocks: { emoji: '📈', name: 'Stocks' },
                gold: { emoji: '🥇', name: 'Gold' }
            };

            resultsContent.innerHTML = '';

            ['crypto', 'stocks', 'gold'].forEach(category => {
                const catAssets = assetRecommendations.filter(a => a.category === category);
                const catDiff = diffs[category];
                const { emoji, name } = categoryLabels[category];

                const action = catDiff > 1 ? 'buy' : catDiff < -1 ? 'sell' : 'hold';

                let actionText = 'No change needed';
                if (catDiff > 1) {
                    actionText = `Buy ${PortfolioApp.formatCurrency(Math.abs(catDiff))}`;
                } else if (catDiff < -1) {
                    actionText = `Sell ${PortfolioApp.formatCurrency(Math.abs(catDiff))}`;
                }

                // Create category container
                const categoryDiv = DOMUtils.createElement('div', {
                    className: 'result-category'
                });

                // Header
                const header = DOMUtils.createElement('div', {
                    className: 'result-category-header'
                });

                const title = DOMUtils.createElement('div', {
                    className: 'result-category-title',
                    text: `${emoji} ${name}`
                });

                const actionBadge = DOMUtils.createElement('div', {
                    className: `result-category-action ${action}`,
                    text: actionText
                });

                header.appendChild(title);
                header.appendChild(actionBadge);
                categoryDiv.appendChild(header);

                // Assets
                if (catAssets.length === 0) {
                    const empty = DOMUtils.createElement('div', {
                        className: 'asset-result',
                        html: { safe: true, content: '<em style="color: var(--text-muted);">No assets in this category</em>' }
                    });
                    categoryDiv.appendChild(empty);
                } else {
                    catAssets.forEach(asset => {
                        const item = DOMUtils.createRebalanceResultItem(asset);
                        categoryDiv.appendChild(item);
                    });
                }

                resultsContent.appendChild(categoryDiv);
            });

            // Render summary safely
            const totalToBuy = assetRecommendations.filter(a => a.usdChange > 0).reduce((sum, a) => sum + a.usdChange, 0);
            const totalToSell = Math.abs(assetRecommendations.filter(a => a.usdChange < 0).reduce((sum, a) => sum + a.usdChange, 0));

            // Helper for summary items
            const createSummaryItem = (label, value, valueClass = '') => {
                const item = DOMUtils.createElement('div', { className: 'summary-item' });
                item.appendChild(DOMUtils.createElement('div', { className: 'summary-item-label', text: label }));
                item.appendChild(DOMUtils.createElement('div', {
                    className: `summary-item-value ${valueClass}`,
                    text: value
                }));
                return item;
            };

            summaryGrid.innerHTML = '';
            summaryGrid.appendChild(createSummaryItem('Total to Buy', PortfolioApp.formatCurrency(totalToBuy), 'positive'));
            summaryGrid.appendChild(createSummaryItem('Total to Sell', PortfolioApp.formatCurrency(totalToSell), 'negative'));
            summaryGrid.appendChild(createSummaryItem('Target Crypto', PortfolioApp.formatCurrency(targets.crypto)));
            summaryGrid.appendChild(createSummaryItem('Target Stocks', PortfolioApp.formatCurrency(targets.stocks)));
            summaryGrid.appendChild(createSummaryItem('Target Gold', PortfolioApp.formatCurrency(targets.gold)));
            summaryGrid.appendChild(createSummaryItem('Portfolio Total', PortfolioApp.formatCurrency(portfolioData.grandTotal)));

            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }

        async function showRebalance() {
            if (!rebalanceInitialized) {
                await initRebalance();
                rebalanceInitialized = true;
                return;
            }
            await loadPortfolio();
            renderCategorySections();
            validateAll();
        }

        window.RebalancePage = { onShow: showRebalance, init: initRebalance };
    