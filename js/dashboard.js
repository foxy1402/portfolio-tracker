
    // Dashboard Logic
    let chart;
    let chartData = [];
    let chartCanvas = null;
    let chartCtx = null;
    let currentPeriodDays = 7;
    let isRefreshing = false;
    let isTouching = false;
    let legendBound = false;
    let hoverRaf = null;
    let pendingHover = null;

    let isLoadingChart = false;
    let currentChartController = null;

    const DRAW_THROTTLE = 16;

    async function initDashboard() {
      if (!chart) {
        chart = new PortfolioChart('portfolioChart', 'chartTooltip');
        window.portfolioChart = chart;
      }

      if (!legendBound) {
        legendBound = true;
        document.querySelectorAll('.legend-item').forEach(item => {
          item.addEventListener('click', () => {
            const category = item.dataset.category;
            chart.showTooltipForCategory(category);
          });
        });
      }

      await refreshData();
    }

    async function refreshData() {
      if (isRefreshing) return;

      const refreshBtn = document.getElementById('refreshBtn');
      const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
      isRefreshing = true;
      refreshBtn?.classList.add('spinning');
      mobileRefreshBtn?.classList.add('spinning');

      try {
        const data = await PortfolioApp.calculatePortfolio();
        window.lastPortfolioData = data; // Cache for UI restoration
        updateUI(data);
        chart.update(data);
        if (typeof updateHistoryChart === 'function') {
          updateHistoryChart(currentPeriodDays);
        }
      } catch (error) {
        console.error('Error refreshing data:', error);
        ToastManager.error('Could not refresh portfolio. Check your connection.');
      } finally {
        isRefreshing = false;
        refreshBtn?.classList.remove('spinning');
        mobileRefreshBtn?.classList.remove('spinning');
      }
    }

    function updateUI(data) {
      // Update total value - use compact format for large numbers
      const formattedTotal = PortfolioApp.formatCurrencyCompact(data.grandTotal);
      document.getElementById('totalValue').textContent = formattedTotal;

      // Update Hero Section (Mobile)
      document.getElementById('heroTotalValue').textContent = PortfolioApp.formatCurrency(data.grandTotal);

      // Update plain value next to "Your Assets" - full number format
      const plainValueEl = document.getElementById('portfolioPlainValue');
      if (plainValueEl) {
        plainValueEl.textContent = PortfolioApp.formatCurrency(data.grandTotal);
      }
      try {
        localStorage.setItem('portfolio_last_ui', JSON.stringify({
          grandTotal: data.grandTotal,
          totalProfitLoss: data.totalProfitLoss,
          totalProfitLossPercent: data.totalProfitLossPercent,
          totalCostBasis: data.totalCostBasis
        }));
      } catch (_) { /* ignore quota */ }

      // Update category stats (Desktop)
      const categories = ['crypto', 'stocks', 'gold'];
      categories.forEach(cat => {
        const catData = data.categories[cat];
        document.getElementById(`${cat}Value`).textContent =
          PortfolioApp.formatCurrency(catData.total);
        document.getElementById(`${cat}Percent`).textContent =
          PortfolioApp.formatPercent(catData.percentage);

        // Show profit/loss per category
        const profitEl = document.getElementById(`${cat}Profit`);
        if (catData.costBasis > 0) {
          const isPositive = catData.profitLoss >= 0;
          const sign = isPositive ? '+' : '';
          profitEl.innerHTML = `
            <span class="profit-badge ${isPositive ? 'positive' : 'negative'}">
              ${sign}${PortfolioApp.formatPercent(catData.profitLossPercent)}
            </span>
          `;
        } else {
          profitEl.innerHTML = '';
        }

        // Update mobile category pills
        const pillValue = document.getElementById(`pill${cat.charAt(0).toUpperCase() + cat.slice(1)}Value`);
        if (pillValue) {
          pillValue.textContent = PortfolioApp.formatCurrencyCompact(catData.total);
        }
      });

      // Update total profit/loss (Desktop)
      const profitContainer = document.getElementById('totalProfitContainer');
      const profitValue = document.getElementById('totalProfitValue');

      // Mobile Hero PnL elements
      const heroPnlContainer = document.getElementById('heroPnlContainer');
      const heroPnlBadge = document.getElementById('heroPnlBadge');
      const heroPnlAmount = document.getElementById('heroPnlAmount');
      const heroPnlPercent = document.getElementById('heroPnlPercent');

      if (data.totalCostBasis > 0) {
        const isPositive = data.totalProfitLoss >= 0;
        const sign = isPositive ? '+' : '';

        // Desktop
        if (profitContainer) {
          profitContainer.style.display = 'block';
          profitValue.className = `total-profit-value ${isPositive ? 'profit' : 'loss'}`;
          profitValue.textContent = `${sign}${PortfolioApp.formatCurrency(data.totalProfitLoss)} (${sign}${PortfolioApp.formatPercent(data.totalProfitLossPercent)})`;
        }

        // Mobile Hero
        if (heroPnlContainer) {
          heroPnlContainer.style.display = 'flex';
          heroPnlBadge.className = `mobile-pnl-badge ${isPositive ? 'positive' : 'negative'}`;
          heroPnlPercent.textContent = `${isPositive ? '↑' : '↓'} ${sign}${PortfolioApp.formatPercent(data.totalProfitLossPercent)}`;
          heroPnlAmount.textContent = `${sign}${PortfolioApp.formatCurrency(data.totalProfitLoss)}`;
          heroPnlAmount.className = `mobile-pnl-amount ${isPositive ? 'positive' : 'negative'}`;
        }
      } else {
        if (profitContainer) profitContainer.style.display = 'none';
        if (heroPnlContainer) heroPnlContainer.style.display = 'none';
      }

      // Update performance chart header (Desktop)
      const perfCurrentValue = document.getElementById('perfCurrentValue');
      if (perfCurrentValue) {
        perfCurrentValue.textContent = PortfolioApp.formatCurrency(data.grandTotal);
      }

      // Update assets list - Sort by Value Descending Globally
      const sortedAssets = [...data.assets].sort((a, b) => b.value - a.value);
      updateAssetsList(sortedAssets);
    }

    function updateAssetsList(assets) {
      const container = document.getElementById('assetsList');

      if (assets.length === 0) {
        DOMUtils.showEmptyState(container, 'No assets yet', {
          text: 'Add your first asset',
          href: '#/manage'
        });
        return;
      }

      // Clear and render using safe DOM utils
      container.innerHTML = '';
      assets.forEach(asset => {
        const item = DOMUtils.createAssetItem(asset, {
          showValue: true,
          showPnL: true
        });
        container.appendChild(item);
      });
    }

    function getCategoryLabel(category) {
      const labels = {
        crypto: 'Crypto',
        stocks: 'Stocks',
        gold: 'Gold'
      };
      return labels[category] || category;
    }

    // Mobile Mode Toggle
    function initMobileMode() {
      const checkbox = document.getElementById('mobileMode');
      const saved = localStorage.getItem('portfolioMobileMode');
      const mobileQuery = window.matchMedia('(max-width: 768px)');

      const applyMobileMode = (isMobile) => {
        if (isMobile) {
          document.body.classList.add('mobile-mode');
          switchMobileView('assets');
        } else {
          document.body.classList.remove('mobile-mode');
          document.getElementById('chartSection').style.display = '';
          document.getElementById('assetsSection').style.display = '';
        }

        cleanupAllCharts();

        setTimeout(() => {
          if (typeof chartData !== 'undefined' && chartData.length > 0) {
            drawMiniChart(chartData, 'heroMiniChart');
            drawEnhancedLineChart(chartData, 'historyChart');
          }
          if (window.portfolioChart) {
            window.portfolioChart.setupCanvas();
            window.portfolioChart.draw();
          }
        }, 50);
      };

      const autoMobile = () => mobileQuery.matches;

      if (saved === 'true' || saved === 'force-mobile') {
        checkbox.checked = true;
        applyMobileMode(true);
      } else if (saved === 'false' || saved === 'force-desktop') {
        checkbox.checked = false;
        applyMobileMode(false);
      } else {
        checkbox.checked = autoMobile();
        applyMobileMode(checkbox.checked);
      }

      checkbox.addEventListener('change', function () {
        applyMobileMode(this.checked);
        localStorage.setItem('portfolioMobileMode', this.checked ? 'force-mobile' : 'force-desktop');
      });

      const onViewportChange = () => {
        const preference = localStorage.getItem('portfolioMobileMode');
        if (preference === 'force-mobile' || preference === 'force-desktop' || preference === 'true' || preference === 'false') {
          return;
        }
        checkbox.checked = autoMobile();
        applyMobileMode(checkbox.checked);
      };
      if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener('change', onViewportChange);
      } else if (mobileQuery.addListener) {
        mobileQuery.addListener(onViewportChange);
      }
    }

    // ✅ NEW: Cleanup function for all charts
    function cleanupAllCharts() {
      // Clean up history chart
      const historyCanvas = document.getElementById('historyChart');
      if (historyCanvas && historyCanvas._chartCleanup) {
        historyCanvas._chartCleanup();
      }

      // Clean up hero mini chart
      const heroCanvas = document.getElementById('heroMiniChart');
      if (heroCanvas && heroCanvas._chartCleanup) {
        heroCanvas._chartCleanup();
      }

      // Hide all tooltips
      const tooltip = document.getElementById('chartTooltipFloating');
      if (tooltip) {
        tooltip.classList.remove('visible');
      }

      resetHeroStats();
      resetDesktopStats();
    }

    let lastDashboardSubview = 'assets';
    let dashboardInitialized = false;

    // Mobile View Switching (Bottom Nav)
    function switchMobileView(view) {
      lastDashboardSubview = view || lastDashboardSubview;
      if (!document.body.classList.contains('mobile-mode')) return;

      // Update bottom nav buttons
      document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });

      // Hide all sections
      const chartSection = document.getElementById('chartSection');
      const assetsSection = document.getElementById('assetsSection');
      const performanceSection = document.getElementById('performanceSection');
      const mobileAssetsHeader = document.getElementById('mobileAssetsHeader');

      chartSection.classList.remove('active-tab');
      assetsSection.style.display = 'none';
      if (mobileAssetsHeader) mobileAssetsHeader.style.display = 'none';

      // Show selected view
      switch (view) {
        case 'assets':
          assetsSection.style.display = 'block';
          chartSection.style.display = 'none'; // Explicitly hide chart
          if (mobileAssetsHeader) mobileAssetsHeader.style.display = 'flex';
          break;
        case 'chart':
          chartSection.classList.add('active-tab');
          chartSection.style.display = 'block';
          // Hide performance section in chart view
          if (performanceSection) performanceSection.style.display = 'none';

          // Trigger chart resize after display/visible
          setTimeout(() => {
            if (window.portfolioChart) {
              window.portfolioChart.setupCanvas();
              window.portfolioChart.draw();
            }
          }, 50);
          break;

      }
    }

    // Initialize Bottom Navigation
    function initBottomNav() {
      document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const route = btn.dataset.route || 'dashboard';
          const sub = btn.dataset.view;
          if (route !== 'dashboard') {
            window.Router.showView(route);
            return;
          }
          const activate = () => {
            if (sub) switchMobileView(sub);
            document.querySelectorAll('.bottom-nav-item').forEach((n) => n.classList.remove('active'));
            btn.classList.add('active');
          };
          if (window.Router.parseRoute() !== 'dashboard') {
            window.Router.showView('dashboard');
            requestAnimationFrame(activate);
          } else {
            activate();
          }
        });
      });
    }



    // Event listeners


    // Mobile header buttons

    document.getElementById('mobileThemeBtn')?.addEventListener('click', () => {
      const newTheme = ThemeManager.toggle();
      document.getElementById('mobileThemeBtn').textContent = newTheme === 'dark' ? '🌙' : '☀️';
      document.getElementById('themeIcon').textContent = newTheme === 'dark' ? '🌙' : '☀️';
    });

    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      const newTheme = ThemeManager.toggle();
      document.getElementById('themeIcon').textContent = newTheme === 'dark' ? '🌙' : '☀️';
      document.getElementById('mobileThemeBtn').textContent = newTheme === 'dark' ? '🌙' : '☀️';
      ToastManager.success(`Switched to ${newTheme} theme`);
    });

    // Currency Selector
    document.getElementById('currencySelect').addEventListener('change', async (e) => {
      await CurrencyManager.setCurrency(e.target.value);
      ToastManager.info(`Currency changed to ${e.target.value}`);
      refreshData();
    });

    // Pull to Refresh Logic
    function initPullToRefresh() {
      const loader = document.getElementById('refreshLoader');
      const spinner = document.getElementById('refreshSpinner');
      const main = document.querySelector('main');

      let startY = 0;
      let currentY = 0;
      let isPulling = false;
      let isRefreshing = false;

      const THRESHOLD = 80; // Pull distance to trigger refresh
      const MAX_PULL = 120; // Max visual pull distance

      document.body.addEventListener('touchstart', (e) => {
        // Only active in mobile mode, on dashboard, and at top of page
        if (document.body.dataset.route && document.body.dataset.route !== 'dashboard') return;
        if (!document.body.classList.contains('mobile-mode') || window.scrollY > 0) return;

        // Prevent if touching a chart (to avoid conflict with scrubbing)
        if (e.target.tagName === 'CANVAS') return;

        startY = e.touches[0].clientY;
        isPulling = true;
        loader.style.transition = 'none'; // distinct types
      }, { passive: true });

      document.body.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing) return;

        const y = e.touches[0].clientY;
        const delta = y - startY;

        // Only handle pull down when at top
        if (delta > 0 && window.scrollY <= 0) {
          // Add resistance
          currentY = Math.min(delta * 0.5, MAX_PULL);

          loader.style.transform = `translateY(${currentY}px)`;
          main.style.transform = `translateY(${currentY}px)`; // Pull content too

          // Visual feedback
          if (currentY > 60) {
            loader.classList.add('visible');
            const rotation = (currentY - 60) * 10;
            spinner.style.transform = `scale(1) rotate(${rotation}deg)`;
          } else {
            loader.classList.remove('visible');
            spinner.style.transform = `scale(${currentY / 60})`;
          }

          // Prevent default scrolling if we are pulling specifically
          if (e.cancelable && delta > 10) {
            e.preventDefault();
          }
        } else {
          // Restore if scrolling back up
          resetPosition();
        }
      }, { passive: false });

      document.body.addEventListener('touchend', async () => {
        if (!isPulling || isRefreshing) return;

        isPulling = false;
        loader.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        main.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';

        if (currentY >= THRESHOLD) {
          // Trigger Refresh
          isRefreshing = true;
          currentY = 60; // Snap to loading position

          loader.style.transform = `translateY(${currentY}px)`;
          main.style.transform = `translateY(${currentY}px)`;
          spinner.classList.add('spinning');

          // Haptic feedback if available
          if (navigator.vibrate) navigator.vibrate(50);

          try {
            // ✅ Clear price cache to force fresh API call
            CacheManager.clear();

            // ✅ Fetch fresh data with new prices
            await refreshData();

            ToastManager.success('Prices updated!');
          } catch (err) {
            console.error('Pull to refresh error:', err);
            ToastManager.error('Update failed');
          } finally {
            setTimeout(() => {
              isRefreshing = false;
              spinner.classList.remove('spinning');
              resetPosition();
            }, 500); // Min delay suitable for UX
          }

        } else {
          resetPosition();
        }
      });

      function resetPosition() {
        currentY = 0;
        loader.style.transform = '';
        main.style.transform = '';
        setTimeout(() => {
          loader.style.transition = '';
          main.style.transition = '';
        }, 300);
      }
    }

    // Auto-refresh on app visibility change (desktop & mobile)
    function initAutoRefreshOnOpen() {
      let lastRefreshTime = 0; // Start at 0 to allow immediate first refresh
      const MIN_REFRESH_INTERVAL = 3000; // Prevent refresh spam (3 seconds)

      async function doRefresh(source, { silent = true, bustCache = false } = {}) {
        const now = Date.now();
        if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
          console.log(`Skipping refresh (${source}) - too soon since last refresh`);
          return;
        }

        lastRefreshTime = now;
        if (bustCache) CacheManager.clear();
        console.log(`${source} - refreshing prices...`);
        await refreshData();
        if (!silent) ToastManager.success('Prices updated!');
      }

      // Refresh when app becomes visible again (user returns to app/tab)
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
          await doRefresh('Visibility change');
        }
      });

      // PWA-specific: Refresh when app is launched from home screen
      // Check if running as PWA (standalone mode)
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                    window.navigator.standalone === true;
      
      if (isPWA) {
        console.log('Running as PWA - enhanced refresh enabled');
        
        // Force immediate refresh on PWA launch
        setTimeout(() => doRefresh('PWA launch', { silent: true }), 100);
        
        // pageshow event fires every time the page is displayed (including from cache)
        window.addEventListener('pageshow', async (event) => {
          // Refresh if page was restored from bfcache
          if (event.persisted) {
            await doRefresh('PWA pageshow (from cache)');
          }
        });

        // Also listen for focus events (when user returns to PWA)
        window.addEventListener('focus', async () => {
          await doRefresh('PWA focus');
        });
      }
    }

    // History Chart Functions
    // chartData is reused

    async function updateHistoryChart(days) {
      if (isLoadingChart) {
        console.log('⏳ Chart update already in progress...');
      }
      // Cancel any in-flight fetch
      if (currentChartController) {
        currentChartController.abort();
      }
      currentChartController = new AbortController();
      isLoadingChart = true;

      currentPeriodDays = days;

      // Update active buttons
      document.querySelectorAll('.period-btn, .timeframe-btn').forEach(btn => {
        btn.classList.remove('active');
      });

      document.querySelectorAll('.period-btn').forEach(btn => {
        if (parseInt(btn.dataset.days) === days) btn.classList.add('active');
      });

      document.querySelectorAll('.timeframe-btn').forEach(btn => {
        const btnText = btn.textContent;
        const btnDays = {
          '24H': 1, '1W': 7, '1M': 30, '3M': 90,
          '6M': 180, '1Y': 365, 'ALL': 0
        }[btnText];
        if (btnDays === days) btn.classList.add('active');
      });

      // ✅ Show loading on BOTH desktop and mobile
      const historyEmpty = document.getElementById('historyEmpty');
      const chartStats = document.getElementById('chartStats');
      const mobileLoading = document.getElementById('mobileChartLoading');
      
      // Show queue status if requests are pending
      const queueStatus = apiRateLimiter.getStatus();
      if (queueStatus.queueLength > 0) {
        console.log(`📊 API Queue: ${queueStatus.queueLength} pending, ${queueStatus.currentRPS}/${queueStatus.maxRPS} RPS`);
      }

      if (historyEmpty) {
        historyEmpty.innerHTML = `
            <div class="skeleton-chart-container">
                <div class="skeleton-spinner"></div>
                <div style="font-size: 0.9rem; color: var(--text-muted);">Loading data...</div>
            </div>
        `;
        historyEmpty.style.display = 'block';
      }
      if (chartStats) chartStats.style.display = 'none';

      // ✅ Show mobile loading indicator
      if (mobileLoading) {
        mobileLoading.style.display = 'flex';
        mobileLoading.querySelector('.loading-dots').textContent = 'Loading';
      }

      const apiDays = days === 0 ? 'max' : days;

      try {
        // Fetch performance data with signal and high priority (user-initiated)
        const performance = await HistoricalPriceAPI.calculatePerformance(apiDays, {
          signal: currentChartController.signal,
          priority: 9 // High priority for visible chart
        });

        // ✅ Hide mobile loading on success
        if (mobileLoading) {
          mobileLoading.style.display = 'none';
        }

        // CACHE for Desktop Reset
        if (performance) {
          window.currentViewStats = performance;
        }

        if (!performance || !performance.history || performance.history.length < 2) {
          if (historyEmpty) {
            historyEmpty.innerHTML = `
              <div style="text-align: center; padding: 40px;">
                <div style="font-size: 2rem; margin-bottom: 8px;">📊</div>
                <div>Not enough data yet</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                  ${performance ? 'Only ' + performance.dataPoints + ' data point(s)' : 'Add purchase dates to your assets in the Manage page!'}
                </div>
              </div>
            `;
            historyEmpty.style.display = 'block';
          }
          return;
        }

        if (historyEmpty) historyEmpty.style.display = 'none';
        if (chartStats) chartStats.style.display = 'flex';

        chartData = performance.history;

        // Update data quality badge
        const dataBadge = document.getElementById('chartDataBadge');
        if (dataBadge) {
          dataBadge.style.display = 'inline-block';

          if (performance.incomplete) {
            dataBadge.className = 'chart-data-badge estimated';
            dataBadge.textContent = '⚠ Partial Data';
            dataBadge.title = 'Some assets failed to load due to API limits';
          } else if (performance.isAccurate) {
            dataBadge.className = 'chart-data-badge real';
            dataBadge.textContent = '✓ Accurate';
            dataBadge.title = 'Based on your actual purchase dates';
          } else if (performance.isHypothetical) {
            dataBadge.className = 'chart-data-badge estimated';
            dataBadge.textContent = '⚠ Estimated';
            dataBadge.title = 'Add purchase dates for accurate tracking';
          } else {
            dataBadge.className = 'chart-data-badge real';
            dataBadge.textContent = '✓ Real Data';
            dataBadge.title = 'Daily snapshot history';
          }
        }

        // Update stats
        document.getElementById('statHigh').textContent = PortfolioApp.formatCurrencyCompact(performance.high);
        document.getElementById('statLow').textContent = PortfolioApp.formatCurrencyCompact(performance.low);
        document.getElementById('statAvg').textContent = PortfolioApp.formatCurrencyCompact(performance.avg);

        const isPositive = performance.change >= 0;
        const pct = Number.isFinite(performance.changePercent) ? performance.changePercent.toFixed(1) : '0.0';
        const statChangeEl = document.getElementById('statChange');
        statChangeEl.textContent = `${isPositive ? '+' : ''}${pct}%`;
        statChangeEl.style.color = isPositive ? 'var(--profit-text)' : 'var(--loss-text)';

        // Update performance header
        const perfChange = document.getElementById('perfChange');
        const perfChangeIcon = document.getElementById('perfChangeIcon');
        const perfChangeValue = document.getElementById('perfChangeValue');

        if (perfChange) {
          perfChange.className = `performance-change ${isPositive ? 'positive' : 'negative'}`;
          perfChangeIcon.textContent = isPositive ? '↑' : '↓';
          perfChangeValue.textContent = `${isPositive ? '+' : ''}${pct}%`;
        }

        // NOTE: Mobile Hero PnL now shows TOTAL P/L (from cost basis) not timeframe-based
        // It's updated in updateUI() function to match desktop totalProfitValue behavior

        // Draw charts
        drawEnhancedLineChart(performance.history, 'historyChart');
        drawMiniChart(performance.history, 'heroMiniChart');

      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('⏹️ Chart update cancelled');
          return;
        }
        console.error('Error loading historical data:', error);

        if (mobileLoading) {
          mobileLoading.style.display = 'none';
        }

        if (historyEmpty) {
          historyEmpty.replaceChildren();
          const wrap = document.createElement('div');
          wrap.style.cssText = 'text-align:center;padding:40px';
          const title = document.createElement('div');
          title.textContent = 'Failed to load data';
          const msg = document.createElement('div');
          msg.style.cssText = 'font-size:0.8rem;margin-top:4px';
          msg.textContent = error.message || 'Unknown error';
          wrap.appendChild(title);
          wrap.appendChild(msg);
          historyEmpty.appendChild(wrap);
          historyEmpty.style.display = 'block';
        }
      } finally {
        isLoadingChart = false;
        if (currentChartController && currentChartController.signal.aborted) {
          // keep controller until the replacement run owns it
        } else {
          currentChartController = null;
        }
      }
    }


    function sizeOverlayCanvas(baseCanvas) {
      const overlay = document.getElementById(baseCanvas.id + 'Overlay');
      if (!overlay || !baseCanvas.parentElement) return null;
      const dpr = window.devicePixelRatio || 1;
      overlay.width = baseCanvas.width;
      overlay.height = baseCanvas.height;
      overlay.style.width = baseCanvas.style.width;
      overlay.style.height = baseCanvas.style.height;
      const ctx = overlay.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlay._ctx = ctx;
      return overlay;
    }

    function clearChartOverlay(canvas) {
      const overlay = document.getElementById(canvas.id + 'Overlay');
      if (!overlay?._ctx) return;
      overlay._ctx.clearRect(0, 0, overlay.width, overlay.height);
    }

    function attachChartInteraction(canvas, points) {
      if (canvas._chartCleanup) canvas._chartCleanup();

      let touchTimeout;
      const handlers = {
        mousemove: (e) => handleChartHover(e, canvas, points),
        mouseleave: () => hideChartTooltip(canvas),
        touchstart: (e) => {
          if (e.target === canvas) e.preventDefault();
        },
        touchmove: (e) => {
          if (e.target === canvas) e.preventDefault();
          const touch = e.touches[0];
          isTouching = true;
          clearTimeout(touchTimeout);
          handleChartHover({ clientX: touch.clientX, clientY: touch.clientY }, canvas, points);
        },
        touchend: () => {
          isTouching = false;
          clearTimeout(touchTimeout);
          touchTimeout = setTimeout(() => hideChartTooltip(canvas), 800);
        },
        touchcancel: () => {
          clearTimeout(touchTimeout);
          hideChartTooltip(canvas);
        }
      };

      Object.entries(handlers).forEach(([event, handler]) => {
        canvas.addEventListener(event, handler, { passive: false });
      });

      canvas._chartCleanup = () => {
        Object.entries(handlers).forEach(([event, handler]) => {
          canvas.removeEventListener(event, handler);
        });
        clearTimeout(touchTimeout);
        clearChartOverlay(canvas);
        delete canvas._chartPoints;
      };
    }

    function drawEnhancedLineChart(data, canvasId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

      const ctx = canvas.getContext('2d');
      chartCanvas = canvas;
      chartCtx = ctx;
      const rect = canvas.parentElement.getBoundingClientRect();

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const padding = { top: 20, right: 15, bottom: 25, left: 15 };

      const values = data.map(d => d.total);
      let minVal = Math.min(...values) * 0.995;
      let maxVal = Math.max(...values) * 1.005;
      if (maxVal === minVal) {
        maxVal = minVal + 1;
      }

      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i / 4) * (height - padding.top - padding.bottom);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      const denom = Math.max(data.length - 1, 1);
      const range = maxVal - minVal || 1;
      const points = data.map((d, i) => ({
        x: padding.left + (i / denom) * (width - padding.left - padding.right),
        y: padding.top + (1 - (d.total - minVal) / range) * (height - padding.top - padding.bottom),
        data: d
      }));

      ctx.beginPath();
      ctx.moveTo(points[0].x, height - padding.bottom);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, 'rgba(138, 43, 226, 0.15)');
      gradient.addColorStop(1, 'rgba(138, 43, 226, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
      lineGradient.addColorStop(0, '#ff9a9e');
      lineGradient.addColorStop(1, '#8a2be2');

      ctx.beginPath();
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      canvas._chartPoints = points;
      canvas._chartPadding = padding;
      sizeOverlayCanvas(canvas);
      attachChartInteraction(canvas, points);
    }

    function handleChartHover(e, canvas, points) {
      if (!canvas || !points?.length) return;
      pendingHover = { e, canvas, points };
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = null;
        const job = pendingHover;
        pendingHover = null;
        if (job) drawChartCrosshair(job.e, job.canvas, job.points);
      });
    }

    function drawChartCrosshair(e, canvas, points) {
      const overlay = sizeOverlayCanvas(canvas) || document.getElementById(canvas.id + 'Overlay');
      const ctx = overlay?._ctx;
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let closest = points[0];
      let minDist = Math.abs(x - points[0].x);
      points.forEach(p => {
        const dist = Math.abs(x - p.x);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      });

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const bottom = (canvas.style.height ? parseFloat(canvas.style.height) : rect.height) - 25;

      ctx.beginPath();
      ctx.moveTo(closest.x, 20);
      ctx.lineTo(closest.x, bottom);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(closest.x, closest.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(138, 43, 226, 0.2)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(closest.x, closest.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#8a2be2';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (canvas.id === 'heroMiniChart') {
        updateHeroStats(closest.data, points[0].data);
      } else if (canvas.id === 'historyChart') {
        updateDesktopStats(closest.data, points[0].data);
        showChartTooltip(e.clientX, e.clientY, closest, canvas);
      } else {
        showChartTooltip(e.clientX, e.clientY, closest, canvas);
      }
    }

    // New function to update hero stats on mobile scrub
    function updateHeroStats(data, baseData) {
      const balanceEl = document.getElementById('heroTotalValue');
      const pnlContainer = document.getElementById('heroPnlContainer');
      const dateEl = document.getElementById('heroScrubDate');
      const pnlAmountEl = document.getElementById('heroPnlAmount');
      const pnlPercentEl = document.getElementById('heroPnlPercent');
      const pnlBadge = document.getElementById('heroPnlBadge');

      if (balanceEl) balanceEl.textContent = PortfolioApp.formatCurrency(data.total);

      // Calculate PnL relative to the start of the chart (timeframe)
      let change = 0;
      let percent = 0;

      if (baseData && baseData.total > 0) {
        change = data.total - baseData.total;
        percent = (change / baseData.total) * 100;
      }

      const isPositive = change >= 0;
      const sign = isPositive ? '+' : '';
      const color = isPositive ? 'var(--profit-text)' : 'var(--loss-text)';

      if (pnlAmountEl) {
        pnlAmountEl.textContent = `${sign}${PortfolioApp.formatCurrency(change)}`;
        pnlAmountEl.style.color = color;
        pnlAmountEl.style.display = '';
      }

      if (pnlPercentEl) {
        pnlPercentEl.textContent = `(${sign}${percent.toFixed(2)}%)`;
        pnlPercentEl.style.color = color;
        pnlPercentEl.style.display = '';
      }

      if (pnlBadge) {
        pnlBadge.className = `mobile-pnl-badge ${isPositive ? 'positive' : 'negative'}`;
      }

      // Show PnL container
      if (pnlContainer) pnlContainer.style.display = 'flex';

      // Show Date
      if (dateEl) {
        const date = new Date(data.timestampOriginal || data.timestamp || data.date);
        dateEl.textContent = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        dateEl.style.display = 'block';
      }
    }

    // Reset Mobile Stats
    function resetHeroStats() {
      const balanceEl = document.getElementById('heroTotalValue');
      const pnlContainer = document.getElementById('heroPnlContainer');
      const dateEl = document.getElementById('heroScrubDate');
      const pnlAmountEl = document.getElementById('heroPnlAmount');
      const pnlPercentEl = document.getElementById('heroPnlPercent');
      const pnlBadge = document.getElementById('heroPnlBadge');

      if (dateEl) dateEl.style.display = 'none';

      if (window.lastPortfolioData) {
        const data = window.lastPortfolioData;
        if (balanceEl) balanceEl.textContent = PortfolioApp.formatCurrency(data.grandTotal);

        if (data.totalCostBasis > 0) {
          const isPositive = data.totalProfitLoss >= 0;
          const sign = isPositive ? '+' : '';
          if (pnlBadge) pnlBadge.className = `mobile-pnl-badge ${isPositive ? 'positive' : 'negative'}`;
          if (pnlAmountEl) {
            pnlAmountEl.textContent = `${sign}${PortfolioApp.formatCurrency(data.totalProfitLoss)}`;
            pnlAmountEl.className = `mobile-pnl-amount ${isPositive ? 'positive' : 'negative'}`;
            pnlAmountEl.style.color = '';
          }
          if (pnlPercentEl) {
            pnlPercentEl.textContent = `${isPositive ? '↑' : '↓'} ${sign}${PortfolioApp.formatPercent(data.totalProfitLossPercent)}`;
            pnlPercentEl.style.color = '';
          }
          if (pnlContainer) pnlContainer.style.display = 'flex';
        } else if (pnlContainer) {
          pnlContainer.style.display = 'none';
        }
        return;
      }
    }

    // Update Desktop Stats on Hover
    function updateDesktopStats(data, baseData) {
      const valueEl = document.getElementById('perfCurrentValue');
      const changeEl = document.getElementById('perfChange');
      const changeValueEl = document.getElementById('perfChangeValue');
      const changeIconEl = document.getElementById('perfChangeIcon');
      const badgeEl = document.getElementById('chartDataBadge');
      const dateEl = document.getElementById('perfScrubDate'); // Added date element

      if (valueEl) valueEl.textContent = PortfolioApp.formatCurrency(data.total);

      // Hide accuracy badge while scrubbing
      if (badgeEl) badgeEl.style.opacity = '0.5';

      // Update Date
      if (dateEl) {
        const date = new Date(data.timestampOriginal || data.timestamp || data.date);
        dateEl.textContent = date.toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        dateEl.style.display = 'block';
      }

      // Calculate Change relative to start of chart
      let change = 0;
      let percent = 0;
      if (baseData && baseData.total > 0) {
        change = data.total - baseData.total;
        percent = (change / baseData.total) * 100;
      }

      const isPositive = change >= 0;
      if (changeEl) {
        changeEl.className = `performance-change ${isPositive ? 'positive' : 'negative'}`;
      }
      if (changeValueEl) {
        changeValueEl.textContent = `${isPositive ? '+' : ''}${percent.toFixed(2)}%`;
      }
      if (changeIconEl) {
        changeIconEl.textContent = isPositive ? '↑' : '↓';
      }
    }

    // Reset Desktop Stats on Mouse Leave
    function resetDesktopStats() {
      const valueEl = document.getElementById('perfCurrentValue');
      const changeEl = document.getElementById('perfChange');
      const changeValueEl = document.getElementById('perfChangeValue');
      const changeIconEl = document.getElementById('perfChangeIcon');
      const badgeEl = document.getElementById('chartDataBadge');
      const dateEl = document.getElementById('perfScrubDate');

      if (badgeEl) badgeEl.style.opacity = '1';
      if (dateEl) dateEl.style.display = 'none';

      if (window.currentViewStats) {
        if (window.lastPortfolioData && valueEl) {
          valueEl.textContent = PortfolioApp.formatCurrency(window.lastPortfolioData.grandTotal);
        } else if (valueEl) {
          valueEl.textContent = PortfolioApp.formatCurrency(window.currentViewStats.newest);
        }

        const isPositive = window.currentViewStats.change >= 0;
        const pct = Number.isFinite(window.currentViewStats.changePercent)
          ? window.currentViewStats.changePercent.toFixed(2)
          : '0.00';
        if (changeEl) changeEl.className = `performance-change ${isPositive ? 'positive' : 'negative'}`;
        if (changeValueEl) changeValueEl.textContent = `${isPositive ? '+' : ''}${pct}%`;
        if (changeIconEl) changeIconEl.textContent = isPositive ? '↑' : '↓';
      }
    }



    function showChartTooltip(mouseX, mouseY, point, canvas) {
      const tooltip = document.getElementById('chartTooltipFloating');
      if (!tooltip) return;

      const dateEl = tooltip.querySelector('.chart-tooltip-date');
      const valueEl = tooltip.querySelector('.chart-tooltip-value');

      const date = new Date(point.data.timestampOriginal || point.data.timestamp || point.data.date);
      dateEl.textContent = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      valueEl.textContent = PortfolioApp.formatCurrency(point.data.total);

      // Position tooltip
      const rect = canvas.parentElement.getBoundingClientRect();

      // Calculate position relative to viewport, but anchored to point
      let left = rect.left + point.x;
      let top = rect.top + point.y - 50;

      // Ensure tooltip doesn't go off screen
      const tooltipRect = tooltip.getBoundingClientRect();

      // Horizontal bounds
      if (left - tooltipRect.width / 2 < 10) left = 10 + tooltipRect.width / 2;
      if (left + tooltipRect.width / 2 > window.innerWidth - 10) left = window.innerWidth - 10 - tooltipRect.width / 2;

      // Vertical bounds (if too high, show below point)
      if (top < 10) top = rect.top + point.y + 20;

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.style.transform = 'translate(-50%, 0)'; // Center horizontally
      tooltip.classList.add('visible');
    }

    function hideChartTooltip(canvas) {
      const tooltip = document.getElementById('chartTooltipFloating');
      if (tooltip) tooltip.classList.remove('visible');

      if (canvas && canvas.id === 'heroMiniChart') {
        resetHeroStats();
      }

      if (canvas && canvas.id === 'historyChart') {
        resetDesktopStats();
      }

      if (canvas) clearChartOverlay(canvas);
    }




    function drawMiniChart(data, canvasId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      // Preventdrawing on hidden/zero-sized canvas
      // Prevent drawing on hidden/zero-sized canvas (Fixes IndexSizeError)
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

      // CLEANUP OLD LISTENERS
      if (canvas._chartCleanup) {
        canvas._chartCleanup();
      }

      const ctx = canvas.getContext('2d');
      const rect = canvas.parentElement.getBoundingClientRect();

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const padding = { top: 5, right: 5, bottom: 5, left: 5 };

      const values = data.map(d => d.total);
      let minVal = Math.min(...values) * 0.99;
      let maxVal = Math.max(...values) * 1.01;

      // Handle flat line case (prevent division by zero)
      if (maxVal === minVal) {
        maxVal = minVal + 1; // Arbitrary range
        if (minVal === 0) {
          maxVal = 1; // Handle all zeros
        }
      }

      ctx.clearRect(0, 0, width, height);

      const isPositive = values[values.length - 1] >= values[0];

      // Draw line
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
      lineGradient.addColorStop(0, '#ff9a9e'); // Salmon
      lineGradient.addColorStop(1, '#8a2be2'); // Violet

      ctx.beginPath();
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const points = []; // Store points for interaction

      const denom = Math.max(data.length - 1, 1);
      data.forEach((d, i) => {
        const x = padding.left + (i / denom) * (width - padding.left - padding.right);
        const y = padding.top + (1 - (d.total - minVal) / (maxVal - minVal)) * (height - padding.top - padding.bottom);

        points.push({ x, y, data: d }); // Save point

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Add gradient fill
      const lastX = padding.left + (1) * (width - padding.left - padding.right);
      ctx.lineTo(lastX, height - padding.bottom);
      ctx.lineTo(padding.left, height - padding.bottom);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      // Neutral Violet Fill
      gradient.addColorStop(0, 'rgba(138, 43, 226, 0.1)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fill();

      // INTERACTION SETUP
      canvas._chartPoints = points;
      sizeOverlayCanvas(canvas);
      attachChartInteraction(canvas, points);
    }

    // Offline Detection
    const offlineIndicator = document.getElementById('offlineIndicator');

    let wasOffline = !navigator.onLine;
    function updateOnlineStatus() {
      if (navigator.onLine) {
        offlineIndicator.classList.remove('visible');
        if (wasOffline) ToastManager.success('Back online!');
        wasOffline = false;
      } else {
        wasOffline = true;
        offlineIndicator.classList.add('visible');
        ToastManager.warning('You are offline');
      }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial check
    if (!navigator.onLine) updateOnlineStatus();

    function redrawDashboardCharts() {
      if (chartData && chartData.length > 0) {
        drawMiniChart(chartData, 'heroMiniChart');
        drawEnhancedLineChart(chartData, 'historyChart');
      }
      if (window.portfolioChart) {
        window.portfolioChart.setupCanvas();
        window.portfolioChart.draw();
      }
    }

    function bootDashboardChrome() {
      if (bootDashboardChrome.done) return;
      bootDashboardChrome.done = true;

      ThemeManager.init();
      CurrencyManager.init();

      try {
        const snap = JSON.parse(localStorage.getItem('portfolio_last_ui') || 'null');
        if (snap && typeof snap.grandTotal === 'number') {
          const hero = document.getElementById('heroTotalValue');
          const total = document.getElementById('totalValue');
          if (hero) hero.textContent = PortfolioApp.formatCurrency(snap.grandTotal);
          if (total) total.textContent = PortfolioApp.formatCurrencyCompact(snap.grandTotal);
        }
      } catch (_) { /* ignore */ }

      const theme = ThemeManager.get();
      const themeIcon = document.getElementById('themeIcon');
      if (themeIcon) themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
      const mobileThemeBtn = document.getElementById('mobileThemeBtn');
      if (mobileThemeBtn) mobileThemeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';

      const currencySelect = document.getElementById('currencySelect');
      if (currencySelect) currencySelect.value = CurrencyManager.current;

      initMobileMode();
      initBottomNav();
      initPullToRefresh();
      initAutoRefreshOnOpen();

      let chartDrawTimer = null;
      function debouncedChartDraw(data) {
        clearTimeout(chartDrawTimer);
        chartDrawTimer = setTimeout(() => redrawDashboardCharts(), 100);
      }

      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (document.body.dataset.route === 'dashboard') {
            debouncedChartDraw(chartData);
          }
        }, 150);
      });

      if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
        navigator.serviceWorker.register('./service-worker.js')
          .then(() => console.log('SW registered'))
          .catch(err => console.log('SW registration failed', err));
      }
    }

    async function showDashboard() {
      if (document.body.classList.contains('mobile-mode')) {
        switchMobileView(lastDashboardSubview);
      }

      if (!dashboardInitialized) {
        await initDashboard();
        dashboardInitialized = true;
        requestAnimationFrame(redrawDashboardCharts);
        return;
      }

      if (CacheManager.isValid()) {
        try {
          const data = await PortfolioApp.calculatePortfolio();
          window.lastPortfolioData = data;
          updateUI(data);
          if (chart) chart.update(data);
        } catch (_) { /* keep last paint */ }
        requestAnimationFrame(redrawDashboardCharts);
        return;
      }

      await refreshData();
    }

    window.Dashboard = {
      bootChrome: bootDashboardChrome,
      onShow: showDashboard,
      switchMobileView,
      get lastSubview() { return lastDashboardSubview; }
    };
    window.updateHistoryChart = updateHistoryChart;
  