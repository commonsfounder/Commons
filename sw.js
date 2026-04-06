// Commons Service Worker
// Cache-first for static shell; network-first for Supabase API

var CACHE = 'commons-v1';
var SHELL = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

// ── Activate: drop old caches ─────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: strategy per request type ─────────────────────────
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Let Supabase API calls go straight to network (never cache auth/data)
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For everything else: cache-first, fall back to network
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache successful GET responses for shell assets
        if (e.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        // Offline fallback: serve index.html for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
