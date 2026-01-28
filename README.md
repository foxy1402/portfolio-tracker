# Portfolio Tracker

A beautiful portfolio tracker for crypto, tokenized US stocks, and tokenized gold with real-time prices via CoinGecko API and cross-device sync via GitHub Gist.

## Features

- 📊 **Interactive Pie Chart** - Visual distribution by category with hover details
- ⚖️ **Rebalance Calculator** - Calculate exact buy/sell amounts to hit target %
- 🎯 **Smart Allocation** - Set target % per category AND per asset
- 📱 **Installable App (PWA)** - Install on Android/iOS with offline support
- 📳 **Mobile Mode** - Toggle optimized layout for phone screens
- 💰 **ROI Tracking** - Track profit/loss vs your buy price
- 🔄 **Real-time Prices** - CoinGecko API for live pricing
- ☁️ **Cloud Sync** - Sync data across devices via GitHub Gist
- 🔐 **Secure Auth** - Token stored in memory only (never saved)
- 💾 **Offline Support** - Works offline with localStorage

## Deploy to GitHub Pages

1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/portfolio-tracker.git
   git push -u origin main
   ```
2. Go to **Settings** → **Pages** → Select **main** branch → Save
3. Access at `https://YOUR_USERNAME.github.io/portfolio-tracker/`
4. **Install App:** Open link on mobile → Tap "Add to Home Screen" or "Install App"

## New Features

### ⚖️ Rebalance Calculator
A powerful tool to help you maintain your desired portfolio structure.
- **Category Targets:** Set how much % you want in Crypto vs Stocks vs Gold.
- **Deep Dive:** Expand categories to select/deselect specific assets.
- **Precise Control:** Set individual target allocation for each asset within its category.
- **Action Plan:** Get a clear "Buy" or "Sell" list with exact dollar amounts.

### 📱 Mobile Mode
Click the **📱** icon in the header to switch to a phone-optimized layout.
- Moves the Pie Chart to the top.
- Stacks category summaries below it.
- Moves the asset list to the bottom for better one-handed usage.
- Remembers your preference forever on that device.

### 📅 Purchase Date Tracking
Accurate historical performance calculation based on **when you bought** the asset.
- **Accurate History**: Chart starts tracking performance from your specific purchase date.
- **Data Badges**:
    - `✓ Accurate`: Using your purchase date data.
    - `⚠ Estimated`: Using hypothetical data (add purchase dates to fix).
    - `✓ Real Data`: Using recorded daily snapshots.
- **Bulk Update**: Set purchase dates for all assets at once in the Admin panel.

## Usage

### Adding Assets
1. Open Admin page → Login with GitHub token (or skip for local-only)
2. Select category (Crypto/Stocks/Gold)
3. Enter:
   - **Name & Symbol**
   - **CoinGecko ID** (for auto pricing) OR **Manual Price**
   - **Buy Price** (your average cost for ROI tracking)
   - **Purchase Date** (for accurate historical charts)
   - **Balance** (amount held)

### Syncing Data
1. Login with GitHub Personal Access Token
2. **Push** → Upload local data to Gist (cloud)
3. **Pull** → Download from Gist to local

### Creating a GitHub Token
1. Go to [GitHub Token Settings](https://github.com/settings/tokens/new?scopes=gist&description=Portfolio%20Tracker)
2. Select `gist` scope
3. Generate and copy the token
4. Enter token when prompted in Admin page

## Security

- ✅ Token only stored in **browser memory** (cleared when tab closes)
- ✅ No credentials in source code
- ✅ Data stored in **private** GitHub Gist
- ✅ Safe to host on public GitHub Pages

## CoinGecko IDs

| Asset | ID |
|-------|-----|
| Bitcoin | `bitcoin` |
| Ethereum | `ethereum` |
| PAX Gold | `pax-gold` |
| Tether Gold | `tether-gold` |

Find more at [coingecko.com](https://www.coingecko.com) (look at URL: `/coins/bitcoin` → ID is `bitcoin`)
