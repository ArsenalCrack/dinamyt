// Service worker de DINAMYT Membresías: recibe Web Push y muestra la notificación.
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DINAMYT Membresías', {
      body: data.body || '',
      badge: '/manifest.json',
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
