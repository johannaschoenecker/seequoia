// Se(e)quoia service worker: caches the app shell so the page opens with no
// signal. Map tiles, Firebase and photos go straight to the network.
//
// Bump VERSION whenever a JS or CSS file changes. Installed apps pick the
// new version up on their second launch after a deploy.

const VERSION = 'sequoia-v2';

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'js/cloud.js',
  'js/map.js',
  'js/legacy.js',
  'js/outbox.js',
  'js/photo.js',
  'js/review.js',
  'js/stats.js',
  'js/info.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/markercluster/leaflet.markercluster.js',
  'vendor/markercluster/MarkerCluster.css',
  'vendor/markercluster/MarkerCluster.Default.css',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/sequoia-marker.png',
  'icons/sequoia-marker-grey.png',
  'images/sequoia-seki.jpg',
  'images/sequoia-cone-seki.jpg',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // Add individually so one missing file cannot brick the install, and
      // bypass the HTTP cache so a new worker never fills up with stale copies.
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then(res => {
          if (res && res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
