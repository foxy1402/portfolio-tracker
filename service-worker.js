// Portfolio Tracker - Enhanced Service Worker
const CACHE_NAME = 'portfolio-v2';
const API_CACHE_NAME = 'portfolio-api-v1';
const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const STATIC_ASSETS = [
    './',
    './index.html',
    './admin.html',
    './rebalance.html',
    './css/style.css',
    './js/app.js',
    './js/chart.js',
    './manifest.json',
    './images/icon-192.png',
    './images/icon-512.png'
];

const FONT_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME && name !== API_CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API requests: Network first with cache fallback
    if (url.hostname.includes('api.coingecko.com') ||
        url.hostname.includes('api.exchangerate-api.com') ||
        url.hostname.includes('api.github.com')) {
        event.respondWith(networkFirstWithCache(event.request));
        return;
    }

    // Google Fonts: Cache first
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Static assets: Stale while revalidate
    event.respondWith(staleWhileRevalidate(event.request));
});

// Network first with cache fallback (for APIs)
async function networkFirstWithCache(request) {
    try {
        // Always try network first for API calls to ensure fresh data
        const networkResponse = await fetch(request, {
            cache: 'no-cache' // Force network request, bypass browser cache
        });

        if (networkResponse.ok) {
            const cache = await caches.open(API_CACHE_NAME);
            // Clone response before caching
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Using cached API response (offline):', request.url);
            return cachedResponse;
        }
        throw error;
    }
}

// Cache first (for fonts and CDN assets)
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        throw error;
    }
}

// Stale while revalidate (for static assets)
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => cachedResponse);

    return cachedResponse || fetchPromise;
}

// Background sync for pending changes
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-portfolio') {
        event.waitUntil(syncPendingChanges());
    }
});

async function syncPendingChanges() {
    // This would sync any pending changes when back online
    // Currently handled client-side, but ready for future use
    console.log('Background sync triggered');
}

// Push notifications for price alerts
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body,
        icon: './images/icon-192.png',
        badge: './images/icon-192.png',
        vibrate: [200, 100, 200],
        data: data.url
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});
