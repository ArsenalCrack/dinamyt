import type { MetadataRoute } from 'next';

/**
 * El mapa del sitio: las páginas PÚBLICAS, las que tiene sentido encontrar.
 *
 * Son cuatro, y no es poco: son todas las que existen sin sesión. El resto del
 * portal es la aplicación, y una aplicación no se indexa.
 *
 * ⚠️ `/planes` sigue enseñando precios de relleno (§6.1). Está aquí porque la
 * página existe y se enlaza desde el pie —dejarla fuera del mapa no la
 * escondería—, pero **antes de pedir la indexación en Search Console hay que
 * poner los precios de verdad**: lo que Google guarde el primer día es lo que
 * enseñará durante semanas, y un precio inventado en un resultado de búsqueda
 * es peor que no aparecer.
 *
 * `changeFrequency` y `priority` son pistas, no órdenes: Google hace tiempo que
 * decide por su cuenta. Se ponen porque cuestan una línea y otros buscadores
 * —Bing, DuckDuckGo— sí las miran.
 */
const PORTAL = (
  process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://dinamyt.org'
).replace(/\/+$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  // La fecha del despliegue, que es lo más cerca de «cuándo cambió» que se
  // puede saber sin llevar un registro por página. Sale del build (ver
  // `next.config.ts`); en local no hay, y entonces vale hoy.
  const fecha = process.env.NEXT_PUBLIC_VERSION_FECHA;
  const modificado = fecha ? new Date(fecha.replace(/\./g, '-')) : new Date();

  return [
    {
      url: `${PORTAL}/`,
      lastModified: modificado,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${PORTAL}/planes`,
      lastModified: modificado,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${PORTAL}/privacidad`,
      lastModified: modificado,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
