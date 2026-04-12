/* sw.js — Service worker for offline caching (network-first) */
'use strict';

const CACHE_NAME = '2048-v12';

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

// ─── Skip waiting on demand from the page ────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Install: pre-cache all static assets ────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
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
  self.clients.claim();
});

// ─── Fetch: network-first for own assets, network-only for external ──
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

  // Network-first: always try the network; fall back to cache only when offline
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('/index.html');
        })
      )
  );
});
