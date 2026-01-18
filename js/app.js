// Portfolio Tracker - Core Application Logic with GitHub Gist Sync
// Enhanced with Toast, Theme, Currency, Caching, Alerts, and History

// ============ Toast Notification System ============
const ToastManager = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Close">×</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  },

  dismiss(toast) {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 300);
  },

  success(message, duration) { return this.show(message, 'success', duration); },
  error(message, duration) { return this.show(message, 'error', duration); },
  warning(message, duration) { return this.show(message, 'warning', duration); },
  info(message, duration) { return this.show(message, 'info', duration); }
};

// ============ Theme Manager ============
const ThemeManager = {
  STORAGE_KEY: 'portfolio_theme',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'dark'); // Default to dark
    this.apply(theme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.STORAGE_KEY)) {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');

    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'light' ? '#f8fafc' : '#0f172a';
    }
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    this.apply(next);
    localStorage.setItem(this.STORAGE_KEY, next);
    return next;
  },

  get() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
};

// ============ Price Cache Manager ============
const CacheManager = {
  PRICE_CACHE_KEY: 'portfolio_price_cache',
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  getCache() {
    try {
      const data = localStorage.getItem(this.PRICE_CACHE_KEY);
      return data ? JSON.parse(data) : { prices: {}, timestamp: 0 };
    } catch {
      return { prices: {}, timestamp: 0 };
    }
  },

  setCache(prices) {
    const cache = {
      prices,
      timestamp: Date.now()
    };
    localStorage.setItem(this.PRICE_CACHE_KEY, JSON.stringify(cache));
  },

  isValid() {
    const cache = this.getCache();
    return Date.now() - cache.timestamp < this.CACHE_DURATION;
  },

  getPrices() {
    return this.getCache().prices;
  },

  clear() {
    localStorage.removeItem(this.PRICE_CACHE_KEY);
  }
};

// ============ Currency Manager ============
const CurrencyManager = {
  STORAGE_KEY: 'portfolio_currency',
  RATES_KEY: 'portfolio_exchange_rates',

  currencies: {
    USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    VND: { symbol: '₫', name: 'Vietnamese Dong', flag: '🇻🇳' },
    EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
    GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧' },
    JPY: { symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' }
  },

  rates: { USD: 1 }, // Base rates (USD = 1)

  async init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved && this.currencies[saved]) {
      this.current = saved;
    } else {
      this.current = 'USD';
    }
    await this.fetchRates();
  },

  async fetchRates() {
    // Try to load cached rates first
    const cached = localStorage.getItem(this.RATES_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < 3600000) { // 1 hour cache
          this.rates = data.rates;
          return;
        }
      } catch { }
    }

    // Fetch fresh rates from a free API
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (response.ok) {
        const data = await response.json();
        this.rates = data.rates;
        localStorage.setItem(this.RATES_KEY, JSON.stringify({
          rates: this.rates,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.warn('Failed to fetch exchange rates, using defaults');
      // Use fallback rates (approximate)
      this.rates = { USD: 1, VND: 24500, EUR: 0.92, GBP: 0.79, JPY: 149.5 };
    }
  },

  set(currency) {
    if (this.currencies[currency]) {
      this.current = currency;
      localStorage.setItem(this.STORAGE_KEY, currency);
      return true;
    }
    return false;
  },

  async setCurrency(currency) {
    return this.set(currency);
  },

  get() {
    return this.current || 'USD';
  },

  convert(usdAmount) {
    const rate = this.rates[this.current] || 1;
    return usdAmount * rate;
  },

  getSymbol() {
    return this.currencies[this.current]?.symbol || '$';
  },

  format(usdAmount, compact = false) {
    const converted = this.convert(usdAmount);
    const currency = this.current || 'USD';

    if (compact && Math.abs(converted) >= 1000000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(converted);
    }

    if (Math.abs(converted) >= 10000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(converted);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(converted);
  }
};

// ============ Transaction History ============
const TransactionHistory = {
  STORAGE_KEY: 'portfolio_transactions',

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  add(transaction) {
    const transactions = this.getAll();
    const newTx = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...transaction
    };
    transactions.unshift(newTx); // Add to beginning

    // Keep only last 500 transactions
    if (transactions.length > 500) {
      transactions.length = 500;
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(transactions));
    return newTx;
  },

  getByAsset(assetId) {
    return this.getAll().filter(tx => tx.assetId === assetId);
  },

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  export() {
    const transactions = this.getAll();
    const headers = ['Date', 'Type', 'Asset', 'Amount', 'Price', 'Total', 'Notes'];
    const rows = transactions.map(tx => [
      new Date(tx.timestamp).toLocaleString(),
      tx.type,
      tx.assetName,
      tx.amount,
      tx.price,
      tx.total,
      tx.notes || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return csv;
  }
};

// ============ Watchlist Manager ============
const WatchlistManager = {
  STORAGE_KEY: 'portfolio_watchlist',

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  add(item) {
    const list = this.getAll();
    const newItem = {
      id: Date.now().toString(),
      addedAt: new Date().toISOString(),
      ...item
    };
    list.push(newItem);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    return newItem;
  },

  remove(id) {
    const list = this.getAll().filter(item => item.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
  },

  has(coingeckoId) {
    return this.getAll().some(item => item.coingeckoId === coingeckoId);
  }
};

// ============ Price Alerts Manager ============
const PriceAlerts = {
  STORAGE_KEY: 'portfolio_price_alerts',

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  add(alert) {
    const alerts = this.getAll();
    const newAlert = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      triggered: false,
      ...alert
    };
    alerts.push(newAlert);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    return newAlert;
  },

  remove(id) {
    const alerts = this.getAll().filter(a => a.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
  },

  update(id, updates) {
    const alerts = this.getAll();
    const index = alerts.findIndex(a => a.id === id);
    if (index !== -1) {
      alerts[index] = { ...alerts[index], ...updates };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    }
  },

  check(prices) {
    const alerts = this.getAll();
    const triggered = [];

    alerts.forEach(alert => {
      if (alert.triggered) return;

      const currentPrice = prices[alert.coingeckoId]?.usd;
      if (!currentPrice) return;

      let shouldTrigger = false;
      if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
        shouldTrigger = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        this.update(alert.id, { triggered: true, triggeredAt: new Date().toISOString() });
        triggered.push({ ...alert, currentPrice });
      }
    });

    return triggered;
  }
};

// ============ Portfolio History Tracker ============
const HistoryTracker = {
  STORAGE_KEY: 'portfolio_history',
  MAX_ENTRIES: 365, // Keep 1 year of daily data

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  record(totalValue, categoryValues) {
    const history = this.getAll();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if we already have an entry for today
    const existingIndex = history.findIndex(h => h.date === today);

    const entry = {
      date: today,
      timestamp: Date.now(),
      total: totalValue,
      crypto: categoryValues.crypto || 0,
      stocks: categoryValues.stocks || 0,
      gold: categoryValues.gold || 0
    };

    if (existingIndex !== -1) {
      history[existingIndex] = entry; // Update today's entry
    } else {
      history.push(entry);
    }

    // Keep only last MAX_ENTRIES
    if (history.length > this.MAX_ENTRIES) {
      history.splice(0, history.length - this.MAX_ENTRIES);
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    return entry;
  },

  getRange(days = 30) {
    const history = this.getAll();
    if (days === 0) return history;
    return history.slice(-days);
  },

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
};

// Make managers globally available
window.ToastManager = ToastManager;
window.ThemeManager = ThemeManager;
window.CacheManager = CacheManager;
window.CurrencyManager = CurrencyManager;
window.TransactionHistory = TransactionHistory;
window.WatchlistManager = WatchlistManager;
window.PriceAlerts = PriceAlerts;
window.HistoryTracker = HistoryTracker;

const PortfolioApp = {
  // CoinGecko API base URL (free, no API key needed)
  API_BASE: 'https://api.coingecko.com/api/v3',

  // GitHub Gist API
  GIST_API: 'https://api.github.com/gists',

  // Local storage keys
  STORAGE_KEY: 'portfolio_assets',
  GIST_ID_KEY: 'portfolio_gist_id',
  AUTH_TOKEN_KEY: 'portfolio_auth_token',

  // Session auth (cleared on tab close)
  _sessionToken: null,

  // Check if authenticated
  isAuthenticated() {
    return !!this._sessionToken;
  },

  // Set session token (only stored in memory, never in localStorage)
  setSessionToken(token) {
    this._sessionToken = token;
  },

  // Clear session
  logout() {
    this._sessionToken = null;
  },

  // Get Gist ID from localStorage (safe - just an ID, not a secret)
  getGistId() {
    return localStorage.getItem(this.GIST_ID_KEY);
  },

  // Save Gist ID
  setGistId(id) {
    localStorage.setItem(this.GIST_ID_KEY, id);
  },

  // Get all assets from localStorage
  getAssets() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  // Save assets to localStorage
  saveAssets(assets) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(assets));
  },

  // Add a new asset
  addAsset(asset) {
    const assets = this.getAssets();
    asset.id = Date.now().toString();
    assets.push(asset);
    this.saveAssets(assets);
    return asset;
  },

  // Update an existing asset
  updateAsset(id, updates) {
    const assets = this.getAssets();
    const index = assets.findIndex(a => a.id === id);
    if (index !== -1) {
      assets[index] = { ...assets[index], ...updates };
      this.saveAssets(assets);
      return assets[index];
    }
    return null;
  },

  // Delete an asset
  deleteAsset(id) {
    const assets = this.getAssets();
    const filtered = assets.filter(a => a.id !== id);
    this.saveAssets(filtered);
  },

  // ============ GitHub Gist Sync ============

  // Sync assets to GitHub Gist
  async syncToGist() {
    if (!this._sessionToken) {
      throw new Error('Not authenticated');
    }

    const assets = this.getAssets();
    const gistId = this.getGistId();

    const payload = {
      description: 'Portfolio Tracker Data - DO NOT EDIT MANUALLY',
      public: false,
      files: {
        'portfolio_data.json': {
          content: JSON.stringify(assets, null, 2)
        }
      }
    };

    try {
      let response;

      if (gistId) {
        // Update existing gist
        response = await fetch(`${this.GIST_API}/${gistId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this._sessionToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create new gist
        response = await fetch(this.GIST_API, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._sessionToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Sync failed');
      }

      const data = await response.json();
      this.setGistId(data.id);
      return { success: true, gistId: data.id };
    } catch (error) {
      console.error('Sync to Gist failed:', error);
      throw error;
    }
  },

  // Load assets from GitHub Gist
  async syncFromGist() {
    if (!this._sessionToken) {
      throw new Error('Not authenticated');
    }

    let gistId = this.getGistId();

    // If no local Gist ID, search for existing portfolio gist
    if (!gistId) {
      const found = await this.findExistingGist();
      if (found) {
        gistId = found;
        this.setGistId(gistId); // Save for future use
      } else {
        return { success: false, message: 'No portfolio found in your Gists. Push first on another device.' };
      }
    }

    try {
      const response = await fetch(`${this.GIST_API}/${gistId}`, {
        headers: {
          'Authorization': `Bearer ${this._sessionToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Gist');
      }

      const data = await response.json();
      const fileContent = data.files['portfolio_data.json']?.content;

      if (fileContent) {
        const assets = JSON.parse(fileContent);
        this.saveAssets(assets);
        return { success: true, count: assets.length };
      }

      return { success: false, message: 'No data in Gist' };
    } catch (error) {
      console.error('Sync from Gist failed:', error);
      throw error;
    }
  },

  // Search user's gists for existing portfolio data
  async findExistingGist() {
    try {
      const response = await fetch(`${this.GIST_API}`, {
        headers: {
          'Authorization': `Bearer ${this._sessionToken}`
        }
      });

      if (!response.ok) return null;

      const gists = await response.json();

      // Find gist with portfolio_data.json file
      for (const gist of gists) {
        if (gist.files && gist.files['portfolio_data.json']) {
          console.log('Found existing portfolio Gist:', gist.id);
          return gist.id;
        }
      }

      return null;
    } catch (error) {
      console.error('Error searching for Gist:', error);
      return null;
    }
  },

  // Validate token by making a test API call
  async validateToken(token) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const user = await response.json();
        return { valid: true, username: user.login };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  },

  // ============ Price Fetching ============

  // Icon cache to avoid re-fetching
  _iconCache: {},

  // Fetch prices and icons from CoinGecko using markets API
  async fetchMarketData(coinIds) {
    if (coinIds.length === 0) return {};

    try {
      const ids = coinIds.join(',');
      const response = await fetch(
        `${this.API_BASE}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }

      const data = await response.json();
      const result = {};

      data.forEach(coin => {
        result[coin.id] = {
          usd: coin.current_price,
          image: coin.image
        };
        // Cache icons
        this._iconCache[coin.id] = coin.image;
      });

      return result;
    } catch (error) {
      console.error('Error fetching market data:', error);
      return {};
    }
  },

  // Get cached icon for a coin
  getCachedIcon(coingeckoId) {
    return this._iconCache[coingeckoId] || null;
  },

  // Get assets grouped by category
  getAssetsByCategory() {
    const assets = this.getAssets();
    return {
      crypto: assets.filter(a => a.category === 'crypto'),
      stocks: assets.filter(a => a.category === 'stocks'),
      gold: assets.filter(a => a.category === 'gold')
    };
  },

  // Calculate portfolio values with prices and ROI
  async calculatePortfolio() {
    const assets = this.getAssets();

    // Get unique CoinGecko IDs that need price fetching
    const coinIds = [...new Set(
      assets
        .filter(a => a.coingeckoId && !a.manualPrice)
        .map(a => a.coingeckoId)
    )];

    // Fetch prices and icons from API
    const marketData = await this.fetchMarketData(coinIds);

    // Calculate values for each asset including ROI
    const assetsWithValues = assets.map(asset => {
      let currentPrice = 0;
      let iconUrl = asset.iconUrl || null; // Use manual icon URL if provided

      if (asset.manualPrice) {
        currentPrice = parseFloat(asset.manualPrice);
      } else if (asset.coingeckoId && marketData[asset.coingeckoId]) {
        currentPrice = marketData[asset.coingeckoId].usd;
        // Use fetched icon if no manual icon set
        if (!iconUrl && marketData[asset.coingeckoId].image) {
          iconUrl = marketData[asset.coingeckoId].image;
        }
      }

      const balance = parseFloat(asset.balance || 0);
      const value = currentPrice * balance;
      const buyPrice = parseFloat(asset.buyPrice || 0);
      const costBasis = buyPrice * balance;

      // Calculate profit/loss
      const profitLoss = buyPrice > 0 ? value - costBasis : 0;
      const profitLossPercent = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : 0;

      return {
        ...asset,
        currentPrice,
        value,
        costBasis,
        profitLoss,
        profitLossPercent,
        iconUrl
      };
    });

    // Group by category and calculate totals
    const categories = {
      crypto: { assets: [], total: 0, costBasis: 0, profitLoss: 0 },
      stocks: { assets: [], total: 0, costBasis: 0, profitLoss: 0 },
      gold: { assets: [], total: 0, costBasis: 0, profitLoss: 0 }
    };

    let grandTotal = 0;
    let totalCostBasis = 0;
    let totalProfitLoss = 0;

    assetsWithValues.forEach(asset => {
      if (categories[asset.category]) {
        categories[asset.category].assets.push(asset);
        categories[asset.category].total += asset.value;
        categories[asset.category].costBasis += asset.costBasis;
        categories[asset.category].profitLoss += asset.profitLoss;
        grandTotal += asset.value;
        totalCostBasis += asset.costBasis;
        totalProfitLoss += asset.profitLoss;
      }
    });

    // Calculate percentages
    Object.keys(categories).forEach(cat => {
      categories[cat].percentage = grandTotal > 0
        ? (categories[cat].total / grandTotal * 100)
        : 0;

      categories[cat].profitLossPercent = categories[cat].costBasis > 0
        ? ((categories[cat].total - categories[cat].costBasis) / categories[cat].costBasis) * 100
        : 0;

      categories[cat].assets.forEach(asset => {
        asset.categoryPercentage = categories[cat].total > 0
          ? (asset.value / categories[cat].total * 100)
          : 0;
        asset.portfolioPercentage = grandTotal > 0
          ? (asset.value / grandTotal * 100)
          : 0;
      });
    });

    const totalProfitLossPercent = totalCostBasis > 0
      ? ((grandTotal - totalCostBasis) / totalCostBasis) * 100
      : 0;

    return {
      categories,
      grandTotal,
      totalCostBasis,
      totalProfitLoss,
      totalProfitLossPercent,
      assets: assetsWithValues
    };
  },

  // Format currency - with conversion support
  formatCurrency(value, compact = false) {
    // Use CurrencyManager if initialized
    if (typeof CurrencyManager !== 'undefined' && CurrencyManager.current) {
      return CurrencyManager.format(value, compact);
    }

    // Fallback to USD
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  },

  // Format currency for chart center (always compact for large)
  formatCurrencyCompact(value) {
    // Use CurrencyManager if initialized
    if (typeof CurrencyManager !== 'undefined' && CurrencyManager.current) {
      return CurrencyManager.format(value, true);
    }

    // Fallback to USD
    if (Math.abs(value) >= 1000000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2
      }).format(value);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  },

  // Format percentage
  formatPercent(value) {
    return value.toFixed(1) + '%';
  },

  // Format profit/loss with color indicator
  formatProfitLoss(value) {
    const sign = value >= 0 ? '+' : '';
    return sign + this.formatCurrency(value);
  }
};

// Make it globally available
window.PortfolioApp = PortfolioApp;
