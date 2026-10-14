// LevelUp service worker — PUSH ONLY (build -213).
// Deliberately has NO fetch handler: it never intercepts or caches requests,
// so deploys keep reaching devices exactly as before (index.html no-cache +
// APP_BUILD cache-busting stay in charge).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'LevelUp', body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'LevelUp';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/favicon-192.png?v=20260729',
    badge: '/favicon-192.png?v=20260729',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/', id: d.id || null }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var url = data.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.location.origin) === 0) {
        // An open LevelUp: bring it forward and let the page open the message.
        if (data.id) c.postMessage({ type: 'coach-open', id: data.id });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
