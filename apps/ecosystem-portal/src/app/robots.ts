import type { MetadataRoute } from 'next';

/**
 * Qué puede mirar un buscador, y qué no.
 *
 * ── Por qué DINAMYT no salía en Google ──
 *
 * Porque no había nada de esto. Ni `robots.txt`, ni `sitemap.xml`, ni
 * `metadataBase`: el sitio estaba en línea desde el 20 de agosto de 2026 y
 * ningún buscador tenía forma de saber qué páginas existen ni cuál es la
 * dirección buena de cada una.
 *
 * ⚠️ **Y esto solo es la mitad.** Publicar el `robots.txt` no mete a nadie en
 * Google: lo que lo mete es darse de alta en Google Search Console, demostrar
 * que el dominio es tuyo y pedir la indexación. Los pasos están en OPERAR.md
 * §3.6, y hay que hacerlos a mano una vez.
 *
 * ── Lo que se deja fuera, y por qué ──
 *
 * Todo lo que está detrás de una sesión. No es que Google no deba verlo —no
 * puede, no tiene contraseña—: es que sin esto igualmente se gasta el
 * presupuesto de rastreo pidiendo `/dashboard` cuarenta veces para recibir
 * siempre la misma pantalla de login, y esa pantalla acaba siendo lo que
 * indexa. Un club que busque «DINAMYT» tiene que encontrar la portada, no un
 * formulario de entrar.
 *
 * `/salir` y `/verificar` además TIENEN efectos: son enlaces que hacen algo. Un
 * rastreador que los siga cierra sesiones y quema códigos de un solo uso.
 */
const PORTAL = (
  process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://dinamyt.org'
).replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/perfil',
        '/admin',
        '/mi-club',
        '/mi-organizacion',
        '/login',
        '/registro',
        '/recuperar',
        '/verificar',
        '/poner-contrasena',
        '/salir',
        // Los archivos del almacén de imágenes: son fotos de personas y
        // escudos de clubes. No hay nada que buscar ahí, y sí gente que
        // preferiría no aparecer en Google Imágenes.
        '/media/',
      ],
    },
    sitemap: `${PORTAL}/sitemap.xml`,
  };
}
