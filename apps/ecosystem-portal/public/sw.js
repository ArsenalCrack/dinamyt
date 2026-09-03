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
// la misma razón.
//
// ── Lo segundo: recibir los avisos del club ──
//
// Esto antes no estaba, y la frase que había aquí decía que no hacía falta
// porque los avisos se leen en la campana del portal. Era verdad a medias: una
// campana solo suena si estás dentro de la casa. Quien lleva un club abre el
// portal cuando se acuerda, y mientras tanto la persona que tecleó el código
// del club se queda esperando días. El aviso existía; lo que no existía era la
// forma de enterarse sin ir a mirar.

// La versión sube al cambiar el shell: el `activate` borra las cachés viejas,
// así que sin subirla los iconos anteriores se seguirían sirviendo de caché.
var CACHE = 'dinamyt-portal-shell-v3';
var SHELL = [
  '/',
  '/dashboard',
  '/login',
  '/manifest.json',
  '/logo.png',
  '/icon-512.png',
  // El icono de la notificacion se guarda como el resto del shell: un aviso
  // que llega con la red a medias no deberia perder su icono.
  '/badge-96.png',
];

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

// ── Los avisos del club, en la pantalla del celular ─────────────────────────
//
// El cuerpo lo escribe el servidor (`common/avisos-org.ts`, `textoDelAviso`) y
// no este archivo: el mismo aviso sale por dos sitios —la campana y el push— y
// tiene que decir lo mismo en los dos.
//
// El `try` no sobra. `event.data.json()` revienta si algún día llega un push
// sin cuerpo o con algo que no es JSON, y una excepción aquí dentro deja al
// navegador enseñando su notificación genérica de «este sitio se actualizó en
// segundo plano», que es peor que no avisar.
//
// ── El icono pequeño de la notificación ────────────────────────────────────
//
// **`badge` no es una imagen: es una PLANTILLA.** Android le quita todo el
// color y se queda solo con el canal alfa, pintando de blanco lo que sea
// opaco. Aquí estaba puesto `/logo.png` —el logo a color, con el oro y el
// trazo oscuro igual de opacos—, así que lo que salía era la forma EXTERIOR
// entera: una mancha blanca dentro de un círculo de color donde apenas se
// adivinaba un trozo de la D y el pie que sobresale. El dibujo de dentro no
// existía, y no había forma de arreglarlo desde el otro lado.
//
// `/badge-96.png` está hecho para esto: el oro es opaco y el trazo oscuro es
// transparente, así que los huecos del dibujo viajan DENTRO de la silueta y la
// D se sigue leyendo con su figura. Las separaciones van ensanchadas a
// propósito —a 24 puntos, las del original desaparecen y todo se funde otra
// vez— y lleva margen, porque Android lo mete dentro de un círculo.
//
// `icon` sigue siendo el logo a color: **ese no se enmascara**, es el que se
// ve grande al lado del texto.
//
// El icono se DERIVA del logo, no se dibuja aparte: `scripts/icono-notificacion.py`
// en el monorepo. El día que cambie el logo, un comando y vuelve a estar al día.
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DINAMYT', {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/badge-96.png',
      data: { url: data.url || '/dashboard' },
    }),
  );
});

// ── Y el toque lleva a donde se hace algo con el aviso ──────────────────────
//
// Antes de abrir una pestaña nueva se busca una del portal que ya esté abierta
// y se la lleva al destino. Sin esto, quien tiene el portal abierto en el
// celular acaba con dos —o cinco— copias de la misma app tras una tarde de
// avisos, cada una tirando de la misma cuenta.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var destino = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (ventanas) {
        for (var i = 0; i < ventanas.length; i++) {
          var v = ventanas[i];
          if (v.url.indexOf(self.location.origin) === 0 && 'focus' in v) {
            if ('navigate' in v) v.navigate(destino);
            return v.focus();
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
