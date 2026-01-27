// Portfolio Tracker - Core Application Logic (FIXED & IMPROVED)
// Security: XSS protection, rate limiting, backup system
// Performance: Caching, debouncing, optimized storage

// ============ Configuration ============
const AppConfig = {
  API: {
    COINGECKO_BASE: 'https://api.coingecko.com/api/v3',
    GITHUB_BASE: 'https://api.github.com/gists',
    EXCHANGE_RATE: 'https://api.exchangerate-api.com/v4/latest/USD',
    RATE_LIMIT: {
      MAX_REQUESTS: 10,
      PER_MINUTE: 60000
    }
  },
  CACHE: {
    PRICE_DURATION: 5 * 60 * 1000,
    EXCHANGE_DURATION: 60 * 60 * 1000
  },
  STORAGE: {
    ASSETS_KEY: 'portfolio_assets',
    GIST_ID_KEY: 'portfolio_gist_id',
    BACKUPS_KEY: 'portfolio_backups',
    MAX_BACKUPS: 10
  },
  HISTORY: {
    MAX_ENTRIES: 365
  },
  UI: {
    TOAST_DURATION: 3000,
    DEBOUNCE_DELAY: 300
  }
};

// ============ Utility Functions ============
const Utils = {
  /**
   * Escape HTML to prevent XSS
   * @param {string} unsafe - Unsafe string
   * @returns {string} Safe HTML string
   */
  escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

// ============ Error Handling ============
class AppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

const ErrorHandler = {
  handle(error, context = '') {
    console.error(`[${context}]`, error);

    let userMessage = 'Something went wrong. Please try again.';

    if (error.code === 'NETWORK_ERROR') {
      userMessage = 'Network error. Please check your connection.';
    } else if (error.code === 'API_RATE_LIMIT') {
      userMessage = 'Too many requests. Please wait a moment.';
    } else if (error.code === 'GIST_ERROR') {
      userMessage = 'Failed to sync with cloud. Your data is safe locally.';
    } else if (error.code === 'VALIDATION_ERROR') {
      userMessage = error.message;
    }

    ToastManager.error(userMessage);
    return null;
  }
};

// ============ Rate Limiter ============
class RateLimiter {
  constructor(maxRequests = 10, perMinute = 60000) {
    this.maxRequests = maxRequests;
    this.perMinute = perMinute;
    this.queue = [];
    this.processing = false;
    this.lastBatchTime = 0;
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLastBatch = now - this.lastBatchTime;

    if (timeSinceLastBatch < this.perMinute && this.lastBatchTime > 0) {
      const waitTime = this.perMinute - timeSinceLastBatch;
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    this.processing = true;
    this.lastBatchTime = now;

    const batch = this.queue.splice(0, this.maxRequests);

    try {
      const results = await Promise.all(
        batch.map(({ fn }) => fn())
      );
      batch.forEach(({ resolve }, i) => resolve(results[i]));
    } catch (error) {
      batch.forEach(({ reject }) => reject(error));
    }

    this.processing = false;

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }
}

const apiRateLimiter = new RateLimiter(
  AppConfig.API.RATE_LIMIT.MAX_REQUESTS,
  AppConfig.API.RATE_LIMIT.PER_MINUTE
);

// ============ Backup Manager ============
const BackupManager = {
  BACKUP_KEY: AppConfig.STORAGE.BACKUPS_KEY,
  MAX_BACKUPS: AppConfig.STORAGE.MAX_BACKUPS,

  createBackup(label = 'auto') {
    try {
      const backups = this.getBackups();
      const assets = PortfolioApp.getAssets();

      backups.unshift({
        timestamp: Date.now(),
        label,
        data: assets,
        version: '1.0',
        count: assets.length
      });

      if (backups.length > this.MAX_BACKUPS) {
        backups.length = this.MAX_BACKUPS;
      }

      localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Backup creation failed:', error);
      return false;
    }
  },

  getBackups() {
    try {
      const data = localStorage.getItem(this.BACKUP_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  restore(index = 0) {
    try {
      const backups = this.getBackups();
      if (backups[index]) {
        PortfolioApp.saveAssets(backups[index].data);
        ToastManager.success('Backup restored successfully!');
        return true;
      }
      return false;
    } catch (error) {
      ErrorHandler.handle(error, 'BackupManager.restore');
      return false;
    }
  },

  list() {
    return this.getBackups().map((backup, index) => ({
      index,
      timestamp: new Date(backup.timestamp).toLocaleString(),
      label: backup.label,
      count: backup.count
    }));
  },

  clear() {
    localStorage.removeItem(this.BACKUP_KEY);
  }
};

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

  show(message, type = 'info', duration = AppConfig.UI.TOAST_DURATION) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[type] || icons.info;

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message; // Safe - using textContent

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    toast.appendChild(icon);
    toast.appendChild(msg);
    toast.appendChild(closeBtn);

    this.container.appendChild(toast);

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
    const theme = saved || (prefersDark ? 'dark' : 'dark');
    this.apply(theme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.STORAGE_KEY)) {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');

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

// ============ Cache Manager (Improved) ============
const CacheManager = {
  PRICE_CACHE_KEY: 'portfolio_price_cache',
  CACHE_DURATION: AppConfig.CACHE.PRICE_DURATION,

  getCache() {
    try {
      const data = localStorage.getItem(this.PRICE_CACHE_KEY);
      return data ? JSON.parse(data) : { prices: {}, timestamp: 0 };
    } catch {
      return { prices: {}, timestamp: 0 };
    }
  },

  setCache(prices) {
    try {
      const cache = {
        prices,
        timestamp: Date.now()
      };
      localStorage.setItem(this.PRICE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Cache storage failed:', error);
    }
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

  rates: { USD: 1 },
  current: 'USD',

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
    const cached = localStorage.getItem(this.RATES_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < AppConfig.CACHE.EXCHANGE_DURATION) {
          this.rates = data.rates;
          return;
        }
      } catch { }
    }

    try {
      const response = await fetch(AppConfig.API.EXCHANGE_RATE);
      if (response.ok) {
        const data = await response.json();
        this.rates = data.rates;
        localStorage.setItem(this.RATES_KEY, JSON.stringify({
          rates: this.rates,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.warn('Exchange rate fetch failed, using fallback rates');
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
    try {
      const transactions = this.getAll();
      const newTx = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...transaction
      };
      transactions.unshift(newTx);

      if (transactions.length > 500) {
        transactions.length = 500;
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(transactions));
      return newTx;
    } catch (error) {
      console.error('Failed to add transaction:', error);
      return null;
    }
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

// ============ Portfolio History Tracker ============
const HistoryTracker = {
  STORAGE_KEY: 'portfolio_history',
  MAX_ENTRIES: AppConfig.HISTORY.MAX_ENTRIES,

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  record(totalValue, categoryValues) {
    try {
      const history = this.getAll();
      const today = new Date().toISOString().split('T')[0];

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
        history[existingIndex] = entry;
      } else {
        history.push(entry);
      }

      if (history.length > this.MAX_ENTRIES) {
        history.splice(0, history.length - this.MAX_ENTRIES);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
      return entry;
    } catch (error) {
      console.error('Failed to record history:', error);
      return null;
    }
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

// ============ CoinGecko Historical Price API ============
const HistoricalPriceAPI = {
  CACHE_KEY: 'portfolio_historical_cache',
  CACHE_DURATION: 60 * 60 * 1000, // 1 hour

  getCache() {
    try {
      const data = localStorage.getItem(this.CACHE_KEY);
      if (!data) return {};
      const parsed = JSON.parse(data);
      // Return only non-expired caches
      const now = Date.now();
      const valid = {};
      Object.keys(parsed).forEach(key => {
        if (parsed[key].timestamp && (now - parsed[key].timestamp < this.CACHE_DURATION)) {
          valid[key] = parsed[key];
        }
      });
      return valid;
    } catch {
      return {};
    }
  },

  setCache(key, data) {
    try {
      const cache = this.getCache();
      cache[key] = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Cache storage failed:', error);
    }
  },

  async fetchHistoricalPrices(coingeckoId, days) {
    const cacheKey = `${coingeckoId}_${days}`;
    const cache = this.getCache();

    // Return cached data if available
    if (cache[cacheKey]) {
      console.log(`Using cached data for ${coingeckoId} (${days} days)`);
      return cache[cacheKey].data;
    }

    try {
      console.log(`Fetching historical data for ${coingeckoId} (${days} days)...`);

      const response = await apiRateLimiter.execute(() =>
        fetch(`${AppConfig.API.COINGECKO_BASE.replace('/api/v3', '')}/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`)
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      // Transform data
      const transformed = data.prices.map(([timestamp, price]) => ({
        date: new Date(timestamp).toISOString().split('T')[0],
        timestamp,
        price
      }));

      // Cache the result
      this.setCache(cacheKey, transformed);

      return transformed;
    } catch (error) {
      console.error(`Failed to fetch historical data for ${coingeckoId}:`, error);
      return null;
    }
  },

  async calculatePortfolioHistory(days = 30) {
    const assets = PortfolioApp.getAssets();

    // Filter assets with CoinGecko IDs
    const trackedAssets = assets.filter(a => a.coingeckoId);

    if (trackedAssets.length === 0) {
      console.warn('No assets with CoinGecko IDs found');
      return null;
    }

    console.log(`Calculating portfolio history for ${trackedAssets.length} assets over ${days} days`);

    // Fetch historical prices for all assets (rate-limited)
    const promises = trackedAssets.map(asset =>
      this.fetchHistoricalPrices(asset.coingeckoId, days)
        .then(priceHistory => ({ asset, priceHistory }))
    );

    const results = await Promise.all(promises);

    // Build date-indexed portfolio values
    const portfolioByDate = {};

    results.forEach(({ asset, priceHistory }) => {
      if (!priceHistory) return;

      const balance = parseFloat(asset.balance || 0);

      priceHistory.forEach(({ date, timestamp, price }) => {
        if (!portfolioByDate[date]) {
          portfolioByDate[date] = {
            date,
            timestamp,
            total: 0,
            crypto: 0,
            stocks: 0,
            gold: 0,
            breakdown: {}
          };
        }

        const value = price * balance;
        portfolioByDate[date].total += value;
        portfolioByDate[date][asset.category] += value;
        portfolioByDate[date].breakdown[asset.id] = value;
      });
    });

    // Convert to sorted array
    const history = Object.values(portfolioByDate).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    console.log(`Portfolio history calculated: ${history.length} data points`);

    return history;
  },

  async calculatePerformance(days = 30) {
    const history = await this.calculatePortfolioHistory(days);

    if (!history || history.length < 2) {
      return null;
    }

    const oldest = history[0].total;
    const newest = history[history.length - 1].total;
    const change = newest - oldest;
    const changePercent = oldest > 0 ? (change / oldest) * 100 : 0;

    const values = history.map(h => h.total);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      oldest,
      newest,
      change,
      changePercent,
      high,
      low,
      avg,
      dataPoints: history.length,
      history
    };
  }
};

window.HistoricalPriceAPI = HistoricalPriceAPI;

// Make managers globally available
window.ToastManager = ToastManager;
window.ThemeManager = ThemeManager;
window.CacheManager = CacheManager;
window.CurrencyManager = CurrencyManager;
window.TransactionHistory = TransactionHistory;
window.HistoryTracker = HistoryTracker;
window.BackupManager = BackupManager;
window.Utils = Utils;

// ============ Main Portfolio Application (Improved) ============
const PortfolioApp = {
  API_BASE: AppConfig.API.COINGECKO_BASE,
  GIST_API: AppConfig.API.GITHUB_BASE,

  STORAGE_KEY: AppConfig.STORAGE.ASSETS_KEY,
  GIST_ID_KEY: AppConfig.STORAGE.GIST_ID_KEY,

  _sessionToken: null,
  _assetsCache: null,
  _cacheInvalidated: false,
  _iconCache: {},

  // ============ Authentication ============
  isAuthenticated() {
    return !!this._sessionToken;
  },

  setSessionToken(token) {
    this._sessionToken = token;
  },

  logout() {
    this._sessionToken = null;
  },

  getGistId() {
    return localStorage.getItem(this.GIST_ID_KEY);
  },

  setGistId(id) {
    localStorage.setItem(this.GIST_ID_KEY, id);
  },

  // ============ Asset Management (Cached) ============
  getAssets() {
    if (this._assetsCache && !this._cacheInvalidated) {
      return Utils.deepClone(this._assetsCache);
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      this._assetsCache = data ? JSON.parse(data) : [];
      this._cacheInvalidated = false;
      return Utils.deepClone(this._assetsCache);
    } catch (error) {
      console.error('Failed to load assets:', error);
      return [];
    }
  },

  saveAssets(assets) {
    try {
      // Validate assets before saving
      if (!Array.isArray(assets)) {
        throw new AppError('Invalid assets data', 'VALIDATION_ERROR');
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(assets));
      this._assetsCache = assets;
      this._cacheInvalidated = false;
    } catch (error) {
      ErrorHandler.handle(
        new AppError('Failed to save assets', 'STORAGE_ERROR'),
        'PortfolioApp.saveAssets'
      );
    }
  },

  invalidateCache() {
    this._cacheInvalidated = true;
  },

  addAsset(asset) {
    try {
      // Validate asset
      if (!asset.name || !asset.category) {
        throw new AppError('Asset name and category are required', 'VALIDATION_ERROR');
      }

      BackupManager.createBackup('before_add');

      const assets = this.getAssets();
      asset.id = Date.now().toString();
      assets.push(asset);
      this.saveAssets(assets);

      return asset;
    } catch (error) {
      return ErrorHandler.handle(error, 'PortfolioApp.addAsset');
    }
  },

  updateAsset(id, updates) {
    try {
      BackupManager.createBackup('before_update');

      const assets = this.getAssets();
      const index = assets.findIndex(a => a.id === id);

      if (index === -1) {
        throw new AppError('Asset not found', 'NOT_FOUND');
      }

      assets[index] = { ...assets[index], ...updates };
      this.saveAssets(assets);
      return assets[index];
    } catch (error) {
      return ErrorHandler.handle(error, 'PortfolioApp.updateAsset');
    }
  },

  deleteAsset(id) {
    try {
      BackupManager.createBackup('before_delete');

      const assets = this.getAssets();
      const filtered = assets.filter(a => a.id !== id);
      this.saveAssets(filtered);
    } catch (error) {
      ErrorHandler.handle(error, 'PortfolioApp.deleteAsset');
    }
  },

  // ============ GitHub Gist Sync ============
  async syncToGist() {
    if (!this._sessionToken) {
      throw new AppError('Not authenticated', 'AUTH_ERROR');
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
        response = await fetch(`${this.GIST_API}/${gistId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this._sessionToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
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
        throw new AppError(error.message || 'Sync failed', 'GIST_ERROR');
      }

      const data = await response.json();
      this.setGistId(data.id);
      return { success: true, gistId: data.id };
    } catch (error) {
      throw new AppError(error.message, 'GIST_ERROR');
    }
  },

  async syncFromGist() {
    if (!this._sessionToken) {
      throw new AppError('Not authenticated', 'AUTH_ERROR');
    }

    let gistId = this.getGistId();

    if (!gistId) {
      const found = await this.findExistingGist();
      if (found) {
        gistId = found;
        this.setGistId(gistId);
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
        throw new AppError('Failed to fetch Gist', 'GIST_ERROR');
      }

      const data = await response.json();
      const fileContent = data.files['portfolio_data.json']?.content;

      if (fileContent) {
        BackupManager.createBackup('before_sync');
        const assets = JSON.parse(fileContent);
        this.saveAssets(assets);
        return { success: true, count: assets.length };
      }

      return { success: false, message: 'No data in Gist' };
    } catch (error) {
      throw new AppError(error.message, 'GIST_ERROR');
    }
  },

  async findExistingGist() {
    try {
      const response = await fetch(this.GIST_API, {
        headers: {
          'Authorization': `Bearer ${this._sessionToken}`
        }
      });

      if (!response.ok) return null;

      const gists = await response.json();

      for (const gist of gists) {
        if (gist.files && gist.files['portfolio_data.json']) {
          return gist.id;
        }
      }

      return null;
    } catch (error) {
      console.error('Error searching for Gist:', error);
      return null;
    }
  },

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

  // ============ Price Fetching (Rate Limited) ============
  async fetchMarketData(coinIds) {
    if (coinIds.length === 0) return {};

    try {
      const ids = coinIds.join(',');

      const response = await apiRateLimiter.execute(() =>
        fetch(`${this.API_BASE}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`)
      );

      if (!response.ok) {
        throw new AppError('Failed to fetch market data', 'API_ERROR');
      }

      const data = await response.json();
      const result = {};

      data.forEach(coin => {
        result[coin.id] = {
          usd: coin.current_price,
          image: coin.image
        };
        this._iconCache[coin.id] = coin.image;
      });

      return result;
    } catch (error) {
      console.error('Market data fetch error:', error);
      return {};
    }
  },

  getCachedIcon(coingeckoId) {
    return this._iconCache[coingeckoId] || null;
  },

  getAssetsByCategory() {
    const assets = this.getAssets();
    return {
      crypto: assets.filter(a => a.category === 'crypto'),
      stocks: assets.filter(a => a.category === 'stocks'),
      gold: assets.filter(a => a.category === 'gold')
    };
  },

  // ============ Portfolio Calculation ============
  async calculatePortfolio() {
    const assets = this.getAssets();

    const coinIds = [...new Set(
      assets
        .filter(a => a.coingeckoId && !a.manualPrice)
        .map(a => a.coingeckoId)
    )];

    const marketData = await this.fetchMarketData(coinIds);

    const assetsWithValues = assets.map(asset => {
      let currentPrice = 0;
      let iconUrl = asset.iconUrl || null;

      if (asset.manualPrice) {
        currentPrice = parseFloat(asset.manualPrice);
      } else if (asset.coingeckoId && marketData[asset.coingeckoId]) {
        currentPrice = marketData[asset.coingeckoId].usd;
        if (!iconUrl && marketData[asset.coingeckoId].image) {
          iconUrl = marketData[asset.coingeckoId].image;
        }
      }

      const balance = parseFloat(asset.balance || 0);
      const value = currentPrice * balance;
      const buyPrice = parseFloat(asset.buyPrice || 0);
      const costBasis = buyPrice * balance;

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

    // Record history
    HistoryTracker.record(grandTotal, {
      crypto: categories.crypto.total,
      stocks: categories.stocks.total,
      gold: categories.gold.total
    });

    return {
      categories,
      grandTotal,
      totalCostBasis,
      totalProfitLoss,
      totalProfitLossPercent,
      assets: assetsWithValues
    };
  },

  // ============ Formatting Functions ============
  formatCurrency(value, compact = false) {
    if (typeof CurrencyManager !== 'undefined' && CurrencyManager.current) {
      return CurrencyManager.format(value, compact);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  },

  formatCurrencyCompact(value) {
    if (typeof CurrencyManager !== 'undefined' && CurrencyManager.current) {
      return CurrencyManager.format(value, true);
    }

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

  formatPercent(value) {
    return value.toFixed(1) + '%';
  },

  formatProfitLoss(value) {
    const sign = value >= 0 ? '+' : '';
    return sign + this.formatCurrency(value);
  }
};

window.PortfolioApp = PortfolioApp;