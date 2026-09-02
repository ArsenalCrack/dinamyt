// Service worker de DINAMYT Membresías.
//
// Hace dos cosas: recibir los avisos Web Push y servir el App Shell cuando no
// hay red, para que el kiosco siga abriendo en un salón con mala señal. NO
// cachea datos: mostrar el estado de un alumno desde caché sería peor que un
// error claro — el maestro cobraría mal.

// La versión sube al cambiar el shell: el `activate` borra las cachés viejas,
// así que sin subirla los iconos anteriores se seguirían sirviendo de caché.
var CACHE = 'membresias-shell-v3';
var SHELL = ['/', '/kiosco', '/mi', '/manifest.json', '/logo.png', '/icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (c) {
        // addAll falla entero si un solo recurso no responde; uno por uno
        // permite instalar aunque una ruta esté caída.
        return Promise.all(
          SHELL.map(function (u) {
            return c.add(u).catch(function () {});
          }),
        );
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (claves) {
        return Promise.all(
          claves.map(function (k) {
            return k === CACHE ? null : caches.delete(k);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

// Solo navegaciones: las llamadas a la API nunca salen de caché.
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request).then(function (r) {
        return r || caches.match('/');
      });
    }),
  );
});

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
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: data.url || '/mi' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var destino = (event.notification.data && event.notification.data.url) || '/mi';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (lista) {
        // Si la app ya está abierta se reutiliza esa pestaña, no se abre otra.
        //
        // Y se la LLEVA al destino, que antes no se hacía: enfocar a secas
        // dejaba a la persona en la pantalla que tuviera puesta. Daba igual
        // mientras todos los avisos iban al mismo sitio; desde que el resumen
        // del club lleva al panel y el del alumno a «Mi estado», enfocar sin
        // navegar deja al maestro mirando su propia mensualidad después de
        // tocar un aviso que hablaba de sus alumnos.
        for (var i = 0; i < lista.length; i++) {
          var v = lista[i];
          if ('focus' in v) {
            if ('navigate' in v) v.navigate(destino);
            return v.focus();
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
