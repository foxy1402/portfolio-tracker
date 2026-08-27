// Portfolio Tracker - Core Application Logic (FIXED & IMPROVED)
// Security: XSS protection, rate limiting, backup system
// Performance: Caching, debouncing, optimized storage

// ============ Configuration ============
const AppConfig = {
  API: {
    // NEW - Add CoinStats
    COINSTATS_BASE: 'https://openapiv1.coinstats.app',
    COINSTATS_API_KEY: null, // Optional, for authenticated requests

    GITHUB_BASE: 'https://api.github.com/gists',
    EXCHANGE_RATE: 'https://api.exchangerate-api.com/v4/latest/USD',
    RATE_LIMIT: {
      MAX_REQUESTS: 3, // Safe limit (3 req/sec) to avoid 429s (max 5)
      PER_MINUTE: 1000 // 1s sliding window
    }
  },
  CACHE: {
    PRICE_DURATION: 5 * 60 * 1000,
    EXCHANGE_DURATION: 60 * 60 * 1000
  },
  STORAGE: {
    ASSETS_KEY: 'portfolio_assets',
    GIST_ID_KEY: 'portfolio_gist_id',
    API_KEY: 'portfolio_coinstats_api_key',
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

// ============ API Key Manager (Synced via Gist) ============
// ============ CoinStats API Key Manager ============
const CoinStatsAPIKeyManager = {
  STORAGE_KEY: AppConfig.STORAGE.API_KEY,

  // Get API key (optional for CoinStats). Stored locally, obfuscated with base64 — not encryption.
  get() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      try {
        return atob(stored);
      } catch {
        return stored;
      }
    } catch {
      return null;
    }
  },

  set(apiKey) {
    if (!apiKey) {
      localStorage.removeItem(this.STORAGE_KEY);
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, btoa(apiKey));
  },

  // Check if configured
  isConfigured() {
    return !!this.get();
  },

  // Clear API key
  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  // Validate API key (test with BTC price)
  async validate(apiKey) {
    try {
      const headers = {
        'Accept': 'application/json'
      };

      // Add API key if provided
      if (apiKey) {
        headers['X-API-KEY'] = apiKey;
      }

      const response = await fetch(
        `${AppConfig.API.COINSTATS_BASE}/coins?currency=USD&limit=1`,
        { headers }
      );

      if (!response.ok) {
        return { valid: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();

      if (data.result && data.result.length > 0) {
        return {
          valid: true,
          testPrice: data.result[0].price
        };
      }

      return { valid: false, error: 'Unexpected response' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
};

// Export globally
window.CoinStatsAPIKeyManager = CoinStatsAPIKeyManager;

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

  parseLocalDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
      return Number.isNaN(dateStr.getTime()) ? null : dateStr;
    }
    const datePart = String(dateStr).split('T')[0];
    const parts = datePart.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      const fallback = new Date(dateStr);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  },

  localDateKey(date = new Date()) {
    const d = date instanceof Date ? date : this.parseLocalDate(date);
    if (!d || Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

// ============ Smart Rate Limiter with Priority Queue ============
class SmartRateLimiter {
  constructor(maxRPS = 5) {
    this.maxRPS = maxRPS; // Max requests per second
    this.requestTimestamps = []; // Track request times
    this.queue = []; // Priority queue: { fn, resolve, reject, priority }
    this.processing = false;
  }

  /**
   * Execute function with priority (higher = more important)
   * @param {Function} fn - Async function to execute
   * @param {number} priority - Priority level (0-10, default 5)
   */
  async execute(fn, priority = 5) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority });
      // Sort queue by priority (higher first)
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      // Clean up old timestamps (older than 1 second)
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => now - timestamp < 1000
      );

      // Check if we can make more requests
      if (this.requestTimestamps.length >= this.maxRPS) {
        // Wait until the oldest request is 1 second old
        const oldestRequest = Math.min(...this.requestTimestamps);
        const waitTime = 1000 - (now - oldestRequest) + 50; // Add 50ms buffer
        
        console.log(`⏳ Rate limit: waiting ${waitTime}ms (${this.requestTimestamps.length}/${this.maxRPS} RPS)`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Process next request
      const { fn, resolve, reject } = this.queue.shift();
      this.requestTimestamps.push(Date.now());

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Small delay between requests to avoid bursting
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 220)); // ~4.5 RPS safe rate
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      currentRPS: this.requestTimestamps.length,
      maxRPS: this.maxRPS
    };
  }
}

const apiRateLimiter = new SmartRateLimiter(4); // Conservative 4 RPS (CoinStats allows 5)

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
    const theme = saved || (prefersDark ? 'dark' : 'light');
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
      const today = Utils.localDateKey();

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

// ============ Historical Price API (CoinStats) ============
const HistoricalPriceAPI = {
  CACHE_KEY: 'portfolio_historical_cache_v10', // Invalidate old cache for aggregation fix
  CACHE_DURATION: 24 * 60 * 60 * 1000,

  // Rate limiting handled globally by apiRateLimiter

  getCache() {
    try {
      const data = localStorage.getItem(this.CACHE_KEY);
      if (!data) return {};

      const parsed = JSON.parse(data);
      const now = Date.now();
      const valid = {};

      Object.keys(parsed).forEach(key => {
        const entry = parsed[key];
        if (!entry.timestamp) return;
        
        // Different cache durations based on period
        // Extract period from cache key (format: "coinid_days")
        const parts = key.split('_');
        const days = parts[parts.length - 1];
        
        let maxAge;
        if (days === '1' || days === '24h') {
          maxAge = 5 * 60 * 1000; // 5 minutes for 24H view
        } else if (days === '7' || days === '1w') {
          maxAge = 30 * 60 * 1000; // 30 minutes for 1W view
        } else {
          maxAge = this.CACHE_DURATION; // 24 hours for longer periods
        }
        
        if (now - entry.timestamp < maxAge) {
          valid[key] = entry;
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
        timestamp: Date.now(),
        permanent: true
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Cache storage failed:', error);
    }
  },

  /**
   * Downsample history data to match desired chart granularity
   * AND normalize timestamps to align multiple assets
   */
  downsampleHistory(history, period) {
    if (!history || history.length < 2) return history;

    let step = 1;
    let intervalMs = 0;

    if (period === '24h') {
      // 5 min -> 1 hour (factor 12)
      step = 12;
      intervalMs = 3600 * 1000; // 1 hour
    } else if (period === '1w') {
      // 1 hour -> 6 hours (factor 6)
      step = 6;
      intervalMs = 6 * 3600 * 1000; // 6 hours
    } else {
      // For 1M+, enforce 1 point per day (Closing Price)
      // This prevents aggregating multiple intraday points into a single "Date" key
      const uniqueDays = {};
      history.forEach(p => {
        uniqueDays[p.date] = p; // Overwrite, keeping the latest point for the day
      });
      return Object.values(uniqueDays).sort((a, b) => a.timestamp - b.timestamp);
    }

    console.log(`📉 Downsampling ${period}: ${history.length} points -> ~${Math.ceil(history.length / step)} points (Step ${step})`);

    const filtered = history.filter((_, index) => index % step === 0);

    // Normalize timestamps to grid to ensure assets align during aggregation
    if (intervalMs > 0) {
      filtered.forEach(point => {
        // Snap to nearest interval (floor)
        const snapped = Math.floor(point.timestamp / intervalMs) * intervalMs;

        point.timestampSnapped = snapped;
        point.timestampOriginal = point.timestamp;

        point.timestamp = snapped;

        // Keep date string consistent? Guide says: DON'T modify point.date
        // But point.date is YYYY-MM-DD. 
        // If we want tooltips to show time, we should rely on timestampOriginal.
      });
    }

    // Make sure we keep the very last point
    const lastPoint = history[history.length - 1];
    // Snap last point too if relevant?
    // If we snapped everything else, last point might not match grid.
    // Ideally we push the exact last point for accuracy.
    if (filtered[filtered.length - 1] !== lastPoint) {
      // Check if lastPoint is already covered by the snapping bucket of the last filtered item?
      // No, just push it. Aggregation handles timestamp keys.
      filtered.push(lastPoint);
    }

    return filtered;
  },

  /**
   * Fetch historical prices from CoinStats
   * @param {string} coinId - CoinStats coin ID (e.g., "bitcoin")
   * @param {number|string} days - Number of days (1, 7, 30, 90, 180, 365, "max")
   */
  async fetchHistoricalPrices(coinId, days, options = {}) {
    return this.fetchHistoricalPrices_impl(coinId, days, options);
  },

  // Helper to allow cleaner reading (dummy wrapper, actual logic below)
  async fetchHistoricalPrices_impl(coinId, days, options = {}) {
    const { signal, priority = 5 } = options; // Default priority 5
    const cacheKey = `${coinId}_${days}`;
    const cache = this.getCache();

    if (cache[cacheKey]) {
      console.log(`✓ Cache hit: ${coinId} (${days} days) | Points: ${cache[cacheKey].data.length}`);
      return cache[cacheKey].data;
    }

    console.log(`⚠ Cache miss: ${coinId} (${days} days) - fetching with priority ${priority}...`);

    try {
      // Use centralized rate limiter with priority
      return apiRateLimiter.execute(async () => {
        // ... (headers prep)
        const apiKey = CoinStatsAPIKeyManager.get();
        const headers = {
          'Accept': 'application/json'
        };

        if (apiKey) {
          headers['X-API-KEY'] = apiKey;
        }

        // Map days to period
        const period = days === 'max' || days === 0 ? 'all' :
          days <= 1 ? '24h' :
            days <= 7 ? '1w' :
              days <= 30 ? '1m' :
                days <= 90 ? '3m' :
                  days <= 180 ? '6m' :
                    days <= 365 ? '1y' : 'all';

        console.log(`🔄 Fetching ${coinId} for ${days} days (Period: ${period})`);
        // ...

        // CoinStats charts endpoint
        const response = await fetch(
          `${AppConfig.API.COINSTATS_BASE}/coins/${coinId}/charts?period=${period}`,
          { headers, signal }
        );

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('Rate limit exceeded');
          }
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();

        // Transform to our format
        const transformed = data.map(point => {
          const timestampMs = point[0] * 1000;
          return {
            date: Utils.localDateKey(new Date(timestampMs)),
            timestamp: timestampMs,
            price: point[1]
          };
        });

        // Downsample if needed (24h -> 1h gap, 1w -> 6h gap)
        const finalHistory = this.downsampleHistory(transformed, period);

        // Cache the result
        this.setCache(cacheKey, finalHistory);

        return finalHistory;
      }, priority); // Pass priority to rate limiter
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) {
        throw error;
      }
      console.error(`Failed to fetch ${coinId}:`, error);
      return [];
    }
  },

  /**
   * Batch fetch with smart queue management
   */
  async batchFetchHistoricalPrices(assets, days, options = {}) {
    const { signal, priority = 5 } = options;
    const cache = this.getCache();
    const results = {};
    const toFetch = [];

    // Separate cached vs uncached
    assets.forEach(asset => {
      const identifier = PortfolioApp.resolveCoinId(asset);
      const cacheKey = `${identifier}_${days}`;

      if (cache[cacheKey]) {
        results[asset.id] = {
          asset,
          priceHistory: cache[cacheKey].data,
          fromCache: true
        };
      } else {
        toFetch.push(asset);
      }
    });

    console.log(`📊 Cache: ${Object.keys(results).length} hits, ${toFetch.length} misses (priority ${priority})`);

    // Fetch missing data with priority (queued by SmartRateLimiter)
    await Promise.all(toFetch.map(async (asset) => {
      const identifier = PortfolioApp.resolveCoinId(asset);

      try {
        const priceHistory = await this.fetchHistoricalPrices(identifier, days, { signal, priority });

        results[asset.id] = {
          asset,
          priceHistory,
          fromCache: false
        };
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) {
          throw error;
        }
        console.error(`Failed to fetch ${asset.name}:`, error);
        results[asset.id] = {
          asset,
          priceHistory: [],
          fromCache: false
        };
      }
    }));

    return results;
  },

  /**
   * Calculate portfolio history
   */
  async calculatePortfolioHistory(days = 30) {
    const assets = PortfolioApp.getAssets();
    const trackedAssets = assets.filter(a => a.symbol);

    if (trackedAssets.length === 0) {
      console.warn('No assets with symbols found');
      return null;
    }

    console.log(`📈 Calculating history for ${trackedAssets.length} assets (${days} days)`);

    const results = await this.batchFetchHistoricalPrices(trackedAssets, days);
    const portfolioByDate = {};

    Object.values(results).forEach(({ asset, priceHistory }) => {
      if (!priceHistory || priceHistory.length === 0) {
        console.warn(`⚠ No price history for ${asset.name}`);
        return;
      }

      const balance = parseFloat(asset.balance || 0);
      const lastByDate = {};
      priceHistory.forEach((point) => {
        lastByDate[point.date] = point;
      });

      Object.values(lastByDate).forEach(({ date, timestamp, price }) => {
        if (!portfolioByDate[date]) {
          portfolioByDate[date] = {
            date,
            timestamp,
            total: 0,
            crypto: 0,
            stocks: 0,
            gold: 0,
            breakdown: {},
            isAccurate: false
          };
        }

        const existing = portfolioByDate[date].breakdown[asset.id];
        if (existing) {
          portfolioByDate[date].total -= existing.value;
          if (portfolioByDate[date][asset.category] != null) {
            portfolioByDate[date][asset.category] -= existing.value;
          }
        }

        const value = price * balance;
        portfolioByDate[date].total += value;
        if (portfolioByDate[date][asset.category] != null) {
          portfolioByDate[date][asset.category] += value;
        }
        portfolioByDate[date].breakdown[asset.id] = {
          value,
          price,
          balance,
          name: asset.name
        };
      });
    });

    const history = Object.values(portfolioByDate).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    const successCount = Object.values(results).filter(r => r.priceHistory?.length > 0).length;
    console.log(`✓ History: ${history.length} points from ${successCount}/${trackedAssets.length} assets`);

    return history;
  },

  /**
   * Calculate performance stats
   */
  async calculatePerformance(days = 30, options = {}) {
    // Try purchase date performance first
    const { signal, priority = 8 } = options;
    try {
      const accuratePerf = await PurchaseDatePerformance.calculateStats(days, { signal, priority });
      if (accuratePerf && accuratePerf.dataPoints >= 2) {
        return accuratePerf;
      }
    } catch (error) {
      if (signal?.aborted) throw error; // Re-throw abort
      console.warn('Purchase date performance failed:', error);
    }

    // Fallback to local history
    const localHistory = HistoryTracker.getRange(
      days === 'max' || days === 0 ? 0 : days
    );

    if (localHistory.length >= 2) {
      const newest = localHistory[localHistory.length - 1].total;
      const firstActive = localHistory.find((h) => h.total > 0) || localHistory[0];
      const baseline = firstActive.total > 0 ? firstActive.total : localHistory[0].total;
      const values = localHistory.map(h => h.total);
      return {
        oldest: localHistory[0].total,
        newest,
        change: newest - baseline,
        changePercent: baseline > 0 ? ((newest - baseline) / baseline * 100) : 0,
        high: Math.max(...values),
        low: Math.min(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        dataPoints: localHistory.length,
        history: localHistory,
        isAccurate: false,
        isHypothetical: false
      };
    }

    // API-based calculation
    const history = await this.calculatePortfolioHistory(days);

    if (!history || history.length < 2) {
      return null;
    }

    const oldest = history[0].total;
    const newest = history[history.length - 1].total;
    const firstActive = history.find((h) => h.total > 0) || history[0];
    const baseline = firstActive.total > 0 ? firstActive.total : oldest;
    const values = history.map(h => h.total);

    return {
      oldest,
      newest,
      change: newest - baseline,
      changePercent: baseline > 0 ? ((newest - baseline) / baseline * 100) : 0,
      high: Math.max(...values),
      low: Math.min(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      dataPoints: history.length,
      history,
      isAccurate: false,
      isHypothetical: true
    };
  },

  clearCache() {
    localStorage.removeItem(this.CACHE_KEY);
  },

  getCacheStats() {
    const cache = this.getCache();
    const entries = Object.keys(cache).length;
    const size = new Blob([JSON.stringify(cache)]).size;

    return {
      entries,
      sizeKB: (size / 1024).toFixed(2),
      sizeMB: (size / 1024 / 1024).toFixed(2)
    };
  },

  async prewarmCache() {
    const assets = PortfolioApp.getAssets();
    const trackedAssets = assets.filter(a => a.symbol);

    if (trackedAssets.length === 0) return;

    console.log('🔥 Pre-warming cache in background (low priority)...');
    
    // Only prewarm most commonly used timeframes
    const periods = [7, 30]; // 1W and 1M are most used
    
    // Use low priority (0) for background pre-warming
    for (const days of periods) {
      // Fetch sequentially to avoid overwhelming the queue
      await this.batchFetchHistoricalPrices(trackedAssets, days, { priority: 0 })
        .catch(err => console.warn(`Pre-warm failed for ${days}d:`, err));
      
      // Delay between periods to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('✓ Cache pre-warming completed');
  }
};



// ============ Purchase Date Based Performance Calculator ============
// ============ Enhanced Purchase Date Performance with Batch Loading ============
const PurchaseDatePerformance = {
  /**
   * Calculate accurate performance with batch loading
   */
  async calculateAccuratePerformance(days = 30, options = {}) {
    const { signal, priority = 8 } = options; // User-initiated requests get high priority
    const assets = PortfolioApp.getAssets();

    const trackedAssets = assets.filter(a =>
      a.symbol && a.purchaseDate
    );

    if (trackedAssets.length === 0) {
      console.warn('No assets with purchase dates and symbols');
      return null;
    }

    console.log(`📊 Calculating accurate performance for ${trackedAssets.length} assets`);

    // Determine date range
    const endDate = new Date();
    const startDate = new Date();

    if (days === 'max' || days === 0) {
      const earliestPurchase = trackedAssets.reduce((earliest, asset) => {
        const purchaseDate = Utils.parseLocalDate(asset.purchaseDate) || new Date();
        return purchaseDate < earliest ? purchaseDate : earliest;
      }, new Date());
      startDate.setTime(earliestPurchase.getTime());
    } else {
      startDate.setDate(startDate.getDate() - days);
    }

    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    // Use batch fetch from HistoricalPriceAPI with high priority
    const priceResults = await HistoricalPriceAPI.batchFetchHistoricalPrices(
      trackedAssets,
      totalDays,
      { signal, priority } // Pass priority through
    );

    // Process each asset
    const results = trackedAssets.map(asset => {
      const result = priceResults[asset.id];

      if (!result || !result.priceHistory) {
        console.warn(`⚠ No price data for ${asset.name}`);
        return { asset, priceHistory: [], balance: 0, purchaseDate: asset.purchaseDate };
      }

      const purchaseDate = Utils.parseLocalDate(asset.purchaseDate) || new Date();
      const balance = parseFloat(asset.balance || 0);

      // Filter logic:
      // - For short timeframes (<= 7 days): Keep pre-purchase dates to show 0 -> Buy value transition
      // - For long timeframes (> 7 days): Filter pre-purchase dates to zoom in on active history
      const isLongTerm = days > 7 || days === 'max' || days === 0;

      const relevantPrices = result.priceHistory.filter(point => {
        const pointDate = Utils.parseLocalDate(point.date) || new Date(point.timestamp);
        const now = new Date();

        if (pointDate > now) return false;
        if (pointDate < startDate) return false;

        if (isLongTerm) {
          return pointDate >= purchaseDate;
        }
        return true;
      });

      const purchaseDateStr = Utils.localDateKey(purchaseDate);
      const hasPurchasePoint = relevantPrices.some(p => p.date === purchaseDateStr);

      const isWithinWindow = (days === 'max' || days === 0) || (purchaseDate >= startDate);

      if (!hasPurchasePoint && asset.buyPrice && isWithinWindow) {
        relevantPrices.unshift({
          date: purchaseDateStr,
          timestamp: purchaseDate.getTime(),
          price: parseFloat(asset.buyPrice)
        });
      }

      return {
        asset,
        priceHistory: relevantPrices,
        balance,
        purchaseDate: purchaseDateStr
      };
    });

    // Aggregate
    const portfolioByDate = this.aggregatePortfolioHistory(results, startDate, totalDays);

    const history = Object.values(portfolioByDate).sort((a, b) =>
      a.timestamp - b.timestamp
    );

    const successCount = results.filter(r => r.priceHistory.length > 0).length;
    console.log(`✓ Accurate performance: ${history.length} points from ${successCount}/${trackedAssets.length} assets`);

    return history;
  },

  /**
   * Aggregate portfolio history (unchanged)
   */
  /**
   * Aggregate portfolio history (improved for intraday)
   */
  aggregatePortfolioHistory(results, startDate, days) {
    const portfolioByDate = {};

    // Determine bucketing strategy
    const useHourlyBuckets = days <= 1;  // 24H view
    const use6HourBuckets = days > 1 && days <= 7;  // 1W view
    const useDailyBuckets = days > 7;  // 1M+ views

    results.forEach(({ asset, priceHistory, balance, purchaseDate }) => {
      if (!priceHistory || priceHistory.length === 0) return;

      priceHistory.forEach(({ date, timestamp, price }) => {
        // Calculate bucket timestamp
        let bucketTimestamp;

        if (useHourlyBuckets) {
          // 1-hour buckets for 24H
          bucketTimestamp = Math.floor(timestamp / (3600 * 1000)) * 3600 * 1000;
        } else if (use6HourBuckets) {
          // 6-hour buckets for 1W
          bucketTimestamp = Math.floor(timestamp / (6 * 3600 * 1000)) * (6 * 3600 * 1000);
        } else {
          // Daily buckets for 1M+
          const d = new Date(timestamp);
          d.setHours(0, 0, 0, 0);
          bucketTimestamp = d.getTime();
        }

        // ✅ ALWAYS use timestamp as key (consistent format)
        const effectiveKey = bucketTimestamp.toString();

        if (!portfolioByDate[effectiveKey]) {
          portfolioByDate[effectiveKey] = {
            date: Utils.localDateKey(new Date(bucketTimestamp)),
            timestamp: bucketTimestamp,
            total: 0,
            crypto: 0,
            stocks: 0,
            gold: 0,
            breakdown: {},
            isAccurate: true
          };
        }

        // Zero-fill if before purchase date
        const isPrePurchase = date < purchaseDate;
        const value = isPrePurchase ? 0 : (price * balance);

        // Handle overwrites for same asset (avoid double counting)
        const existingAssetData = portfolioByDate[effectiveKey].breakdown[asset.id];
        if (existingAssetData) {
          portfolioByDate[effectiveKey].total -= existingAssetData.value;
          portfolioByDate[effectiveKey][asset.category] -= existingAssetData.value;
        }

        // Add/update asset data
        portfolioByDate[effectiveKey].total += value;
        portfolioByDate[effectiveKey][asset.category] += value;
        portfolioByDate[effectiveKey].breakdown[asset.id] = {
          value,
          price,
          balance,
          name: asset.name,
          purchaseDate
        };
      });
    });

    return portfolioByDate;
  },

  /**
   * Calculate stats (unchanged)
   */
  async calculateStats(days = 30, options = {}) {
    const history = await this.calculateAccuratePerformance(days, options);

    if (!history || history.length < 2) {
      return null;
    }

    const newest = history[history.length - 1].total;
    const firstActive = history.find((h) => h.total > 0) || history[0];
    const baseline = firstActive.total > 0 ? firstActive.total : history[0].total;
    const oldest = history[0].total;
    const change = newest - baseline;
    const changePercent = baseline > 0 ? (change / baseline) * 100 : 0;

    const values = history.map(h => h.total);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const highPoint = history.find(h => h.total === high);
    const lowPoint = history.find(h => h.total === low);

    return {
      oldest,
      newest,
      change,
      changePercent,
      high,
      low,
      avg,
      highDate: highPoint?.date,
      lowDate: lowPoint?.date,
      dataPoints: history.length,
      history,
      isAccurate: true,
      isHypothetical: false,
      incomplete: history.some((h) => !h.isAccurate)
    };
  }
};

window.PurchaseDatePerformance = PurchaseDatePerformance;

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
  API_BASE: AppConfig.API.COINSTATS_BASE,
  GIST_API: AppConfig.API.GITHUB_BASE,

  STORAGE_KEY: AppConfig.STORAGE.ASSETS_KEY,
  GIST_ID_KEY: AppConfig.STORAGE.GIST_ID_KEY,

  _sessionToken: null,
  _assetsCache: null,
  _cacheInvalidated: false,
  _iconCache: {},
  _coinIdCache: {},
  _lastMarketFetchOk: true,

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
      asset.id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    const apiKey = CoinStatsAPIKeyManager.get(); // Changed

    const payload = {
      description: 'Portfolio Tracker Data - DO NOT EDIT MANUALLY',
      public: false,
      files: {
        'portfolio_data.json': {
          content: JSON.stringify(assets, null, 2)
        },
        'portfolio_config.json': {
          content: JSON.stringify({
            apiKey: apiKey || null,
            provider: 'coinstats', // Changed
            version: '3.0',
            lastSync: new Date().toISOString()
          }, null, 2)
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
      const assetsContent = data.files['portfolio_data.json']?.content;
      const configContent = data.files['portfolio_config.json']?.content;

      if (assetsContent) {
        BackupManager.createBackup('before_sync');
        const assets = JSON.parse(assetsContent);
        this.saveAssets(assets);

        // Sync API key from Gist
        if (configContent) {
          try {
            const config = JSON.parse(configContent);
            if (config.apiKey) {
              CoinStatsAPIKeyManager.set(config.apiKey); // Changed
              console.log('✓ API key synced from Gist');
            }
          } catch (e) {
            console.warn('Failed to sync API key:', e);
          }
        }

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

  // ============ CoinStats Price Fetching (OPTIMIZED - BUNDLE REQUESTS) ============
  _coinstatsHeaders() {
    const headers = { 'Accept': 'application/json' };
    const apiKey = CoinStatsAPIKeyManager.get();
    if (apiKey) headers['X-API-KEY'] = apiKey;
    return headers;
  },

  _ingestCoins(result, coins) {
    if (!Array.isArray(coins)) return;
    coins.forEach((coin) => {
      if (!coin) return;
      const symbol = (coin.symbol || '').toUpperCase();
      if (!symbol && !coin.id) return;
      const priceData = {
        usd: coin.price,
        image: coin.icon,
        id: coin.id,
        rank: coin.rank,
        change1h: coin.priceChange1h,
        change1d: coin.priceChange1d,
        change1w: coin.priceChange1w,
        volume: coin.volume,
        marketCap: coin.marketCap
      };
      result[symbol || coin.id] = priceData;
      if (coin.id) result[coin.id] = priceData;
      if (symbol) {
        this._iconCache[symbol] = coin.icon;
        if (coin.id) this._coinIdCache[symbol] = coin.id;
      }
    });
  },

  resolveCoinId(asset) {
    if (asset?.coinstatsId) return asset.coinstatsId;
    const symbol = asset?.symbol?.toUpperCase();
    if (symbol && this._coinIdCache[symbol]) return this._coinIdCache[symbol];
    return asset?.symbol ? asset.symbol.toLowerCase() : '';
  },

  async fetchMarketData(assets) {
    if (!assets || assets.length === 0) return {};

    this._lastMarketFetchOk = true;

    if (CacheManager.isValid()) {
      const cached = CacheManager.getPrices();
      if (cached && Object.keys(cached).length > 0) {
        Object.entries(cached).forEach(([key, priceData]) => {
          if (priceData?.id && key === key.toUpperCase()) {
            this._coinIdCache[key] = priceData.id;
            if (priceData.image) this._iconCache[key] = priceData.image;
          }
        });
        return cached;
      }
    }

    const headers = this._coinstatsHeaders();
    const result = {};

    const ingest = async (url) => {
      const response = await apiRateLimiter.execute(() => fetch(url, { headers }), 10);
      if (!response.ok) throw new Error(`CoinStats API error: ${response.status}`);
      const data = await response.json();
      this._ingestCoins(result, data.result);
    };

    try {
      const coinIds = [...new Set(assets.filter((a) => a.coinstatsId).map((a) => a.coinstatsId))];
      const needsSymbolLookup = assets.some((a) => !a.manualPrice && !a.coinstatsId && a.symbol);

      if (coinIds.length > 0) {
        await ingest(`${AppConfig.API.COINSTATS_BASE}/coins?currency=USD&coinIds=${encodeURIComponent(coinIds.join(','))}`);
      }

      if (needsSymbolLookup || coinIds.length === 0) {
        await ingest(`${AppConfig.API.COINSTATS_BASE}/coins?currency=USD&limit=100`);
      }

      const missing = assets.filter((asset) => {
        if (asset.manualPrice) return false;
        if (asset.coinstatsId && result[asset.coinstatsId]) return false;
        if (asset.symbol && result[asset.symbol.toUpperCase()]) return false;
        return !!(asset.coinstatsId || asset.symbol);
      });

      for (const asset of missing) {
        const id = asset.coinstatsId || asset.symbol.toLowerCase();
        try {
          const response = await apiRateLimiter.execute(
            () => fetch(`${AppConfig.API.COINSTATS_BASE}/coins/${encodeURIComponent(id)}`, { headers }),
            8
          );
          if (!response.ok) continue;
          const payload = await response.json();
          const coins = Array.isArray(payload?.result) ? payload.result : [payload];
          this._ingestCoins(result, coins);
        } catch (err) {
          console.warn(`Price lookup failed for ${asset.symbol || asset.name}:`, err);
        }
      }

      CacheManager.setCache(result);
      return result;
    } catch (error) {
      console.error('Market data fetch error:', error);
      this._lastMarketFetchOk = false;
      const cached = CacheManager.getPrices();
      if (cached && Object.keys(cached).length > 0) {
        ToastManager.warning('Failed to fetch prices. Using cached data.');
        return cached;
      }
      ToastManager.error('Failed to fetch prices.');
      return {};
    }
  },

  getCachedIcon(symbol) {
    return this._iconCache[symbol?.toUpperCase()] || null;
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
    const marketData = await this.fetchMarketData(assets);

    const assetsWithValues = assets.map(asset => {
      let currentPrice = 0;
      let iconUrl = asset.iconUrl || null;

      if (asset.manualPrice) {
        currentPrice = parseFloat(asset.manualPrice);
      } else {
        // Determine which key to use for lookup
        let priceData = null;

        // Priority 1: CoinStats ID (Best)
        if (asset.coinstatsId && marketData[asset.coinstatsId]) {
          priceData = marketData[asset.coinstatsId];
        }
        // Priority 2: Symbol (Fallback)
        else if (asset.symbol && marketData[asset.symbol.toUpperCase()]) {
          priceData = marketData[asset.symbol.toUpperCase()];
        }

        if (priceData) {
          currentPrice = priceData.usd;
          if (priceData.id && asset.symbol) {
            this._coinIdCache[asset.symbol.toUpperCase()] = priceData.id;
          }
          if (!iconUrl && priceData.image) {
            iconUrl = priceData.image;
          }
        } else if (!asset.manualPrice) {
          const id = asset.coinstatsId || asset.symbol;
          console.warn(`⚠️ No price data found for ${asset.name} (${id})`);
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
        iconUrl,
        priceMissing: !asset.manualPrice && !(currentPrice > 0)
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

    if (this._lastMarketFetchOk) {
      HistoryTracker.record(grandTotal, {
        crypto: categories.crypto.total,
        stocks: categories.stocks.total,
        gold: categories.gold.total
      });
    }

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
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.0%';
    return n.toFixed(1) + '%';
  },

  formatProfitLoss(value) {
    const sign = value >= 0 ? '+' : '';
    return sign + this.formatCurrency(value);
  }
};

window.PortfolioApp = PortfolioApp;

setTimeout(() => {
  if (PortfolioApp.getAssets().length > 0) {
    HistoricalPriceAPI.prewarmCache().catch(err =>
      console.warn('Cache pre-warming failed:', err)
    );
  }
}, 8000);

console.log('✓ Optimized Historical API loaded');
