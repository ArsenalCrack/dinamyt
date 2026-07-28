'use client';

import { useState } from 'react';
import { urlFoto } from '@/lib/api';

/**
 * El escudo del club.
 *
 * Sin escudo propio va el de la app: el panel del alumno y el carnet tienen que
 * enseñar algo, y un hueco vacío se lee como un error de carga. El maestro nota
 * que aún no ha puesto el suyo por el botón («Poner logo», no «Cambiar logo»),
 * no por un agujero en la pantalla.
 *
 * `contain` y no `cover`: un escudo con el nombre del club escrito alrededor,
 * recortado para llenar el cuadro, pierde justamente el nombre.
 */
export function LogoClub({
  src,
  nombre,
  size = 48,
}: {
  src?: string | null;
  nombre: string;
  size?: number;
}) {
  // Se recuerda QUÉ dirección falló: al cambiar el escudo cambia la dirección,
  // y con un booleano se quedaría en el logo de la app para siempre.
  const [roto, setRoto] = useState<string | null>(null);
  const url = urlFoto(src);
  const propio = Boolean(url) && roto !== url;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={propio ? url! : '/logo.png'}
      alt={nombre}
      width={size}
      height={size}
      onError={() => setRoto(url)}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        borderRadius: propio ? '0.6rem' : 0,
        border: propio ? '1px solid var(--border)' : 0,
        background: propio ? 'var(--bg-elevated)' : 'transparent',
        padding: propio ? '0.25rem' : 0,
        flexShrink: 0,
      }}
    />
  );
}
