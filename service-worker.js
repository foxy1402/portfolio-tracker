const CACHE_NAME = 'portfolio-v1';
const ASSETS = [
    './',
    './index.html',
    './admin.html',
    './rebalance.html',
    './css/style.css',
    './js/app.js',
    './js/chart.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    // Network first for API calls (prices), Cache first for static assets
    if (e.request.url.includes('api.coingecko.com') || e.request.url.includes('finnhub.io')) {
        e.respondWith(
            fetch(e.request)
                .catch(() => caches.match(e.request))
        );
    } else {
        e.respondWith(
            caches.match(e.request).then((response) => response || fetch(e.request))
        );
    }
});
