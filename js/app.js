// Portfolio Tracker - Core Application Logic with GitHub Gist Sync

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

    const gistId = this.getGistId();
    if (!gistId) {
      return { success: false, message: 'No Gist ID saved. Sync up first.' };
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

  // Format currency - compact for large numbers
  formatCurrency(value, compact = false) {
    if (compact && Math.abs(value) >= 1000000) {
      // 7+ figures: use compact notation
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(value);
    }

    if (Math.abs(value) >= 10000) {
      // 5+ figures: no decimals
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  },

  // Format currency for chart center (always compact for large)
  formatCurrencyCompact(value) {
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
