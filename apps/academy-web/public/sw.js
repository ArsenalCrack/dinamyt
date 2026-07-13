/* Service Worker de DINAMYT Academy (PWA).
 * Estrategia liviana y segura para una app con datos vivos:
 *  - Precachea el "cascarón" (logo, manifest) al instalar.
 *  - Estáticos (imágenes/fuentes/JS del build): cache-first.
 *  - Navegación y API: SIEMPRE red (nada de notas viejas); si no hay red,
 *    responde el último tablero visitado o una página de aviso.
 */
const CACHE = 'academy-v1';
const SHELL = ['/', '/logo.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Estáticos del build y assets: cache-first (rápido e instalable).
  if (url.pathname.startsWith('/_next/static/') || /\.(png|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
            return res;
          }),
      ),
    );
    return;
  }

  // Navegación: red primero; sin conexión → última copia o aviso simple.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(e.request);
          return (
            hit ||
            new Response(
              '<meta charset="utf-8"><body style="background:#0e0e15;color:#f3f1e8;font-family:sans-serif;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h1>Sin conexión</h1><p>DINAMYT Academy necesita internet para tus notas y entregas.<br>El material ya visitado sigue disponible al volver.</p></div>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            )
          );
        }),
    );
  }
});
