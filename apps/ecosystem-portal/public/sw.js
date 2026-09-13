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
var CACHE = 'dinamyt-portal-shell-v4';
var SHELL = [
  '/',
  '/dashboard',
  '/login',
  '/manifest.json',
  '/logo.png',
  '/icon-512.png',
  // El badge ya no va aquí: viaja incrustado en este archivo (ver `BADGE`).
  // Guardarlo en caché nunca sirvió para la notificación: Chrome lo descarga
  // por su cuenta y esa descarga no pasa por este service worker.
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
// ── Y viaja INCRUSTADO, que es lo que faltaba ───────────────────────────────
//
// Con `badge: '/badge-96.png'` Chrome tenía que DESCARGAR el icono en el
// momento de enseñar el aviso: con el teléfono recién despertado por el push,
// la red a medio levantar y Cloudflare de por medio. Si esa descarga falla, el
// bitmap llega vacío y Android pone su icono de reserva. Y la reserva no es la
// misma en las dos apps, que es por lo que parecía un fallo de una sola:
//
//   · Instalada como app (WebAPK) → el icono de la app. El fallo no se ve.
//   · Publicada por Chrome        → el logo de Chrome. El fallo se ve.
//
// (Chromium: `NotificationPlatformBridge.prepareNotificationBuilder` pone
// `ic_chrome` y encima el badge solo si llegó; `WebApkServiceClient` cae al
// icono de la WebAPK.) Así los avisos del portal salían con el logo de Chrome
// y los de Membresías con el de la app, con el mismo código y el mismo PNG.
//
// Incrustado no hay nada que descargar y no hay caída posible. NO se toca a
// mano: lo escribe `scripts/icono-notificacion.py` del monorepo, junto al PNG.
var BADGE = 'data:image/png;base64,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';

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
      badge: BADGE,
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
