# Portfolio Tracker

A beautiful, mobile-first portfolio tracker for crypto, stocks, and gold with real-time prices via **CoinStats API** and cross-device sync via GitHub Gist.

## Features

- 📊 **Interactive Charts** - Visual distribution pie chart & enhanced performance line charts
- 📱 **Mobile First Design** - Bottom navigation, dynamic hero section, and touch-optimized charts
- ⚡ **Real-time Prices** - Powered by **CoinStats API** for fast, reliable data
- 📈 **Smart Performance** - Tracks gain/loss from your exact **Purchase Date**
    - **1W View**: Shows timeline starting at $0 if bought recently
    - **1M+ View**: Auto-zooms to active history (skips empty months)
- ⚖️ **Rebalance Calculator** - Calculate exact buy/sell amounts to hit target allocations
- ☁️ **Cloud Sync** - Sync data (and API key) securely across devices via GitHub Gist
- 🔐 **Privacy Focused** - Tokens stored in memory; data stored in your private Gist
- 💾 **Offline Support** - Installable PWA works offline

## Interface Previews

### 📱 Mobile Mode 2.0
- **Dynamic Hero Section**: Shows Total Balance and PnL that updates based on selected timeframe (24H, 1W, 1M...).
- **Bottom Navigation**: Easily switch between Assets list and Charts.
- **Touch Interaction**: Slide finger on charts to see exact values.

### 💻 Desktop Dashboard
- **Split View**: Charts on left, Assets on right.
- **Detailed Stats**: High/Low/Avg stats for the selected period.
- **Legend Interaction**: Click legends to filter tooltip data.

## Setup & Deployment

### 1. Deploy to GitHub Pages
1. Push this code to your GitHub repository.
2. Go to **Settings** → **Pages**.
3. Select **main** branch and Save.
4. Your tracker will be live at `https://YOUR_USERNAME.github.io/portfolio-tracker/`.

### 2. Configure API (First Time)
1. The app works out-of-the-box with free public limits.
2. **(Optional)** For higher limits, get a free key from [CoinStats API](https://coinstats.app/api-pricing).
3. Open **Manage** (Admin) page → Enter Key in "CoinStats API Key" section.

### 3. Usage
1. **Login**: Use a GitHub Personal Access Token (scope: `gist`) to enable Sync.
2. **Add Assets**:
    - Open **Manage** page.
    - Enter **Symbol** (e.g., `BTC`, `ETH`, `AAPL`).
    - Enter **Purchase Date** (Crucial for accurate performance charts!).
    - Enter **Buy Price** (for ROI tracking).
    - Enter **Balance**.
3. **Bulk Update**: Use the "Bulk Update Dates" tool in Admin to set a default purchase date for imported assets.

## Logic & Nuances

### Performance Timeframes
The tracker uses "Smart Logic" for timeframes:
- **24H**: Standard intraday view.
- **1W**: If you bought the asset 3 days ago, the chart shows 0 for the first 4 days, then jumps up. This gives you truthful context.
- **1M / 3M / 1Y**: The chart **auto-zooms** to start from your Purchase Date or the First Available Data point. It hides the empty "zero value" months to show you only the active performance.

### Data Sync
- **Push (Upload)**: Saves your Assets + API Key + Preferences to a private Gist.
- **Pull (Download)**: Restores everything to the current device.

## Supported Assets
- **Crypto**: Any coin on CoinStats (e.g., `BTC`, `SOL`, `PEPE`).
- **Stocks**: Tokenized stock symbols (e.g., `AAPL`, `TSLA`, `NVDA`).
- **Gold**: `PAXG`, `XAUT`.

## Security
- **No Database**: You own your data (in your GitHub Gist).
- **Client-Side Only**: No backend server tracking you.
- **Token Safety**: GitHub Token is never saved to localStorage (only memory).
