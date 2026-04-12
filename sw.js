/* sw.js — Service worker for offline caching */
'use strict';

const CACHE_NAME = '2048-v10';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/game.js',
  '/confetti.js',
  '/solver.js',
  '/supabase.js',
  '/auth.js',
  '/achievements.js',
  '/leaderboard.js',
  '/stats.js',
  '/logo.svg',
  '/manifest.json',
  '/admin.html',
  '/admin.css',
  '/autosave.js',
  '/win-animation.js',
  '/admin.js',
];

// ─── Install: pre-cache all static assets ────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Activate immediately rather than waiting for old tabs to close
  self.skipWaiting();
});

// ─── Activate: delete old caches ─────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ─── Fetch: cache-first for static, network-only for API ─────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Let Supabase, CDN, and font requests go straight to the network
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  // Cache-first for everything else (our own static files)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Only cache valid same-origin responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // If both cache and network fail for a navigation, serve index.html
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
