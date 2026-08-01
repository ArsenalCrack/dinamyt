'use client';

import { useState } from 'react';
import { urlFoto } from '@/lib/api';
import { VisorImagen } from './VisorImagen';

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
 *
 * `ampliable` lo abre en grande al tocarlo (ver `VisorImagen`), que es donde se
 * ve si el escudo quedó centrado y si se lee el nombre del club: a 46 píxeles
 * no se distingue. Solo cuando el club tiene el SUYO — ampliar el logo de la
 * aplicación no le enseña nada a nadie.
 */
export function LogoClub({
  src,
  nombre,
  size = 48,
  ampliable = false,
}: {
  src?: string | null;
  nombre: string;
  size?: number;
  ampliable?: boolean;
}) {
  // Se recuerda QUÉ dirección falló: al cambiar el escudo cambia la dirección,
  // y con un booleano se quedaría en el logo de la app para siempre.
  const [roto, setRoto] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const url = urlFoto(src);
  const propio = Boolean(url) && roto !== url;

  const escudo = (
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

  if (!ampliable || !propio) return escudo;
  return (
    <>
      <button
        type="button"
        className="miniatura-ampliable"
        data-logo="true"
        onClick={() => setAbierto(true)}
        aria-label={nombre}
        style={{ flexShrink: 0 }}
      >
        {escudo}
      </button>
      {abierto && (
        <VisorImagen src={url!} alt={nombre} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}
