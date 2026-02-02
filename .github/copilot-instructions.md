# Portfolio Tracker - Copilot Instructions

This is a client-side Progressive Web App (PWA) for tracking crypto, stocks, and gold portfolios with real-time prices and GitHub Gist sync.

## Architecture

### Core Components

- **3 HTML Pages**: `index.html` (dashboard), `admin.html` (asset management), `rebalance.html` (portfolio rebalancing)
- **3 JavaScript Modules**:
  - `js/app.js`: Main application logic, API integration, data management, sync
  - `js/chart.js`: Canvas-based interactive donut chart with hover tooltips
  - `js/dom-utils.js`: Safe DOM creation utilities (XSS protection)
- **Service Worker**: `service-worker.js` - PWA offline support with smart caching strategies

### Data Flow

1. **Storage Layer**: All data stored in `localStorage` (no backend database)
   - Assets stored in `portfolio_assets` key
   - CoinStats API key (optional) stored base64-encoded in `portfolio_coinstats_api_key`
   - Price cache duration: 5 minutes
   - Backups: Auto-created before destructive operations (max 10 backups)

2. **Price Fetching**: CoinStats API (`https://openapiv1.coinstats.app`)
   - Rate limited to 4 requests/second (CoinStats allows 5, we use 4 for safety)
   - API key is optional (public endpoints work without authentication)
   - Prices cached for 5 minutes
   - Uses `SmartRateLimiter` class for queue-based request throttling

3. **Cloud Sync**: GitHub Gist API
   - User authenticates with Personal Access Token (scope: `gist`)
   - Token stored **in memory only** (never in localStorage for security)
   - Syncs assets + API key + preferences to a private Gist
   - Gist ID stored in `portfolio_gist_id` key

4. **Performance Tracking**:
   - Charts show gain/loss calculated from **Purchase Date** (critical field)
   - Smart logic for timeframes:
     - **1W**: Shows $0 for days before purchase, then actual values
     - **1M/3M/1Y**: Auto-zooms to start from purchase date or first available data
   - Historical snapshots stored in `portfolio_history` with max 365 entries

### Security Conventions

- **XSS Prevention**: ALL user input rendered via `DOMUtils.createElement()` with `textContent` (never `innerHTML` unless marked `.safe = true`)
- **No direct innerHTML**: Search for `innerHTML` usage - should only appear in safe contexts
- **API Key Handling**:
  - CoinStats key: Stored base64-encoded in localStorage (synced to Gist)
  - GitHub token: Stored in memory only during session
- **Rate Limiting**: Always use `apiRateLimiter.execute()` for API calls
- **Error Handling**: Custom `AppError` class with user-friendly messages

### Asset Categories

The app supports 3 categories (auto-detected in `app.js`):
- **crypto**: Bitcoin, Ethereum, Solana, etc.
- **stocks**: AAPL, TSLA, NVDA (tokenized stocks)
- **gold**: PAXG, XAUT

Category detection happens in the price fetching logic - check `fetchCoinStatsPrice()` for implementation.

## Key Conventions

### Data Structures

**Asset Object** (stored in localStorage):
```javascript
{
  id: "unique-id",
  symbol: "BTC",
  balance: 0.5,
  buyPrice: 45000,
  purchaseDate: "2023-06-15", // CRITICAL - determines performance chart behavior
  category: "crypto", // auto-detected
  excluded: false // for rebalancing
}
```

**Chart Data** (passed to `PortfolioChart`):
```javascript
{
  category: "crypto",
  percentage: 60.5,
  value: 12345.67,
  assets: [/* asset objects with categoryPercentage */]
}
```

### Configuration

All configuration lives in `AppConfig` object at top of `app.js`:
- API endpoints
- Rate limits (4 req/sec for CoinStats)
- Cache durations (5 min for prices, 1 hour for exchange rates)
- Storage keys
- UI settings (toast duration, debounce delay)

### Mobile-First Design

- Responsive breakpoints handled in CSS
- Mobile view: Bottom navigation, single-column layout
- Desktop view: Split-screen (charts left, assets right)
- Touch events supported on canvas charts
- Service worker enables PWA installation

### Canvas Chart Implementation

`PortfolioChart` class (`js/chart.js`):
- Uses native Canvas API (no libraries)
- High DPI support via `devicePixelRatio`
- Interactive hover with custom tooltip
- Gradient fills for segments
- Handles resize with debouncing
- **Critical**: Check canvas dimensions before drawing to prevent `IndexSizeError` on hidden/small canvases

### State Management

- No framework - vanilla JavaScript with manual DOM updates
- State stored in localStorage, synced to Gist on demand
- Reactive updates triggered via event handlers
- Theme stored in `portfolio_theme` (defaults to dark mode)

### Error Handling Pattern

```javascript
try {
  // API call
} catch (error) {
  throw new AppError('User-friendly message', 'error_code');
}
```

Errors shown via `Toast.show()` utility.

## Deployment

This app is designed to deploy to **GitHub Pages**:
1. Push to GitHub repository
2. Enable Pages in Settings → Pages → Deploy from `main` branch
3. No build step required (static files only)
4. Service worker handles caching for offline use

## Testing

No automated tests exist. Manual testing workflow:
1. Test on mobile (Chrome DevTools device mode)
2. Test PWA install (Lighthouse → Installable)
3. Test offline mode (DevTools → Network → Offline)
4. Test with/without CoinStats API key
5. Test GitHub sync (create Gist, verify data)

## Common Tasks

### Adding a new asset category
1. Update category detection in `fetchCoinStatsPrice()` in `app.js`
2. Add color scheme in `PortfolioChart.colors` in `chart.js`
3. Update supported assets in README.md

### Modifying API endpoints
1. Change in `AppConfig.API` object in `app.js`
2. Update service worker fetch handler if caching strategy differs
3. Test rate limiting still works

### Changing cache durations
1. Update `AppConfig.CACHE` in `app.js`
2. Update `service-worker.js` constants (`API_CACHE_DURATION`)
3. Increment `CACHE_NAME` version in service worker to force cache refresh

### Adding new storage keys
1. Add to `AppConfig.STORAGE` in `app.js`
2. Document in this file if affects sync behavior
3. Ensure cleared on logout if sensitive
