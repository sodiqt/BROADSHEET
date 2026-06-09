// ── LASUBEB Broadsheet Service Worker ────────────────────────
// Version — bump this to force cache refresh on update
const CACHE_VERSION = 'lasubeb-v1.2';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/privacy.html',
  '/contact.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap'
];

// ── INSTALL: cache all static assets ─────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing LASUBEB Broadsheet v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      console.log('[SW] Caching static assets');
      // Cache one by one so a single failure doesn't break install
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function() {
      // Take over immediately without waiting for old SW to finish
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating LASUBEB Broadsheet v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_VERSION; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Take control of all open pages immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH: serve from cache, fall back to network ────────────
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests we don't control (ads, analytics etc.)
  var url = new URL(request.url);
  var isOurSite = url.origin === self.location.origin;
  var isGoogleFonts = url.hostname.includes('fonts.googleapis.com') ||
                      url.hostname.includes('fonts.gstatic.com');

  if (!isOurSite && !isGoogleFonts) return;

  event.respondWith(
    caches.match(request).then(function(cachedResponse) {
      if (cachedResponse) {
        // Serve from cache and update cache in background (stale-while-revalidate)
        var fetchPromise = fetch(request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then(function(cache) {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(function() { /* network failed, already served from cache */ });

        return cachedResponse;
      }

      // Not in cache — fetch from network and cache it
      return fetch(request).then(function(networkResponse) {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        var responseClone = networkResponse.clone();
        caches.open(CACHE_VERSION).then(function(cache) {
          cache.put(request, responseClone);
        });
        return networkResponse;
      }).catch(function() {
        // Offline and not cached — return offline page
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline — please check your connection', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// ── BACKGROUND SYNC: save pending data when back online ──────
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-broadsheet') {
    console.log('[SW] Background sync triggered');
  }
});

// ── PUSH NOTIFICATIONS (future use) ──────────────────────────
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || 'LASUBEB Broadsheet';
  var options = {
    body: data.body || 'You have a new notification.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
