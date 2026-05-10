/* ============================================================
   KEVAL MOBILE ZONE | MASTER SERVICE WORKER
   Version: 5.0 (Final Production Engine)
   Developed By: Jigar
   ============================================================ */

/**
 * 1. VERSIONING & CACHE NAMES
 * ------------------------------------------------------------
 * Changing the VERSION string will force all users' phones to
 * download the new update next time they open the app.
 */
const CACHE_VERSION = 'keval-mobile-v4.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

/**
 * 2. ASSET DIRECTORY
 * ------------------------------------------------------------
 * Every file listed here is downloaded and locked into the 
 * phone's permanent storage during the first visit.
 */
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './logo-192.png',
    './logo-512.png',
    // External CDNs are cached to ensure the app UI remains intact offline
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

/**
 * 3. INSTALLATION EVENT
 * ------------------------------------------------------------
 * Fires when the user first visits or when a new version is detected.
 * It builds the cache "vault" and stores the files.
 */
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Status: Installing Final Production Assets...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => {
            return self.skipWaiting(); // Forces the new service worker to become active immediately
        })
    );
});

/**
 * 4. ACTIVATION EVENT
 * ------------------------------------------------------------
 * Cleans up old, outdated caches from previous versions. 
 * This keeps the user's phone storage clean and fast.
 */
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Status: System Active & Optimized.');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete any cache that doesn't match the current version
                    if (cacheName !== STATIC_CACHE && cacheName !== IMAGE_CACHE) {
                        console.log('[Service Worker] Cleaning Old Cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // Take control of all open tabs immediately
        })
    );
});

/**
 * 5. FETCH STRATEGY: STALE-WHILE-REVALIDATE
 * ------------------------------------------------------------
 * This is the "Secret Sauce" for speed. 
 * 1. It serves the UI from the cache instantly (0.1 seconds).
 * 2. It checks for updates in the background.
 * 3. It updates the cache for the next time the app is opened.
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Strategy for Application Files (HTML, CSS, JS)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Return from cache if found, otherwise fetch from network
            const fetchPromise = fetch(request).then((networkResponse) => {
                // If it's a valid response, update the cache in the background
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(STATIC_CACHE).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Offline Fallback for critical pages
                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });

            return cachedResponse || fetchPromise;
        })
    );
});

/**
 * 6. PUSH NOTIFICATION PLACEHOLDER
 * ------------------------------------------------------------
 * Logic for future updates like "New Phone Launched" notifications.
 */
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'Keval Mobile Zone', body: 'New Stock Alert!' };
    
    const options = {
        body: data.body,
        icon: 'logo-192.png',
        badge: 'logo-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

console.log('Keval Mobile Zone: Service Worker Finalized.');
