'use client';

import { Ampliable } from '@/components/VisorImagen';
import { urlImagen } from '@/lib/api';

/**
 * Foto de perfil con respaldo a iniciales (mismo componente en las tres webs
 * del ecosistema): si la persona no ha subido foto, van sus iniciales.
 *
 * `ampliable` la abre en grande al tocarla, como en WhatsApp — el mismo gesto
 * y el mismo visor que Membresías. Va apagado por defecto y se enciende donde
 * la foto es de alguien y se quiere mirar: el saludo del dashboard, la ficha
 * de un miembro, la lista de gente del club.
 *
 * Lo único donde NO se enciende es dentro de un `<a>` o de un `<button>` que
 * ya hace otra cosa: ahí el anidado no es HTML válido.
 *
 * `destacada` es el aro de 2 px en oro pleno de la foto GRANDE —la del propio
 * perfil, que es el retrato de la pantalla y no una miniatura de una lista—.
 * Existe para que esa pantalla no tenga que pintar su propia `<img>`: cuando lo
 * hacía, se saltaba el `urlImagen` de aquí y la foto guardada en el disco
 * (`/media/…`) se pedía al origen del PORTAL en vez de al de la API. No cargaba
 * nunca; solo al ampliarla, porque el visor sí resuelve la ruta. Ese era el
 * fallo de «la foto no se ve hasta que le doy clic».
 */
export function Avatar({
  src,
  nombre,
  size = 40,
  ampliable = false,
  destacada = false,
}: {
  src?: string | null;
  nombre: string;
  size?: number;
  ampliable?: boolean;
  destacada?: boolean;
}) {
  const iniciales = (nombre || '?')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // La ruta se resuelve AQUÍ, y no en cada pantalla que pinta una foto: es el
  // único sitio por el que pasan todas. Ver `urlImagen` en `lib/api.ts`.
  const url = urlImagen(src);

  const aro = destacada
    ? '2px solid var(--gold)'
    : '1.5px solid var(--gold-dim, var(--gold))';

  if (url) {
    const foto = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nombre}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: aro }}
      />
    );
    if (!ampliable) return foto;
    return (
      <Ampliable src={url} alt={nombre}>
        {foto}
      </Ampliable>
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: 'var(--bg-elevated)',
        border: aro,
        color: 'var(--gold)',
      }}
    >
      {iniciales}
    </span>
  );
}
