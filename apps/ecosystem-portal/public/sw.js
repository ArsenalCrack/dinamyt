// Service worker del portal DINAMYT.
//
// ── Qué hace, y sobre todo qué NO hace ──
//
// Hace una sola cosa: servir el App Shell cuando no hay red, para que abrir la
// aplicación desde el icono no acabe en el dinosaurio del navegador. Eso, y
// existir — porque sin un service worker activo el navegador **no ofrece
// «Añadir a la pantalla de inicio»**, y sin eso DINAMYT no se puede instalar.
//
// **No cachea datos, y es deliberado.** Aquí dentro se ve quién pertenece a un
// club, quién pidió entrar y qué suscripción está activa. Servir eso de caché
// tendría dos consecuencias inaceptables: se leerían decisiones viejas como si
// fueran de ahora —a alguien ya aceptado se le seguiría viendo esperando—, y
// la caché del navegador guardaría datos personales de terceros en el disco de
// quien abrió la app. Toda petición a la API va a la red o falla, que es lo
// honesto.
//
// Es el mismo criterio que el service worker de Membresías, escrito allí por
// la misma razón. Lo que aquí no hay es push: los avisos del club se leen en
// la campana del portal (ver `components/CampanaOrg.tsx`).

// La versión sube al cambiar el shell: el `activate` borra las cachés viejas,
// así que sin subirla los iconos anteriores se seguirían sirviendo de caché.
var CACHE = 'dinamyt-portal-shell-v1';
var SHELL = ['/', '/dashboard', '/login', '/manifest.json', '/logo.png', '/icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (c) {
        // `addAll` falla entero si un solo recurso no responde; uno por uno
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

// Solo navegaciones, y solo como último recurso: primero la red siempre, y la
// caché únicamente cuando la red no contesta. Al revés —caché primero— la
// aplicación enseñaría la pantalla de anteayer a quien sí tiene señal.
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
