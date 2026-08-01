'use client';

import { useState } from 'react';
import { urlFoto } from '@/lib/api';
import { VisorImagen } from './VisorImagen';

/**
 * Foto de perfil con respaldo a iniciales: si la persona no ha subido foto —o
 * si la que hay no carga— van sus iniciales sobre el fondo de la app.
 *
 * `src` es lo que devuelve la API, que NO es la imagen sino su dirección (ver
 * `urlFoto`). El respaldo por error importa más de lo que parece: la foto la
 * sirve una ruta con sesión, y si la sesión caducó el `<img>` se queda roto y
 * el roster se llena de iconos partidos.
 *
 * `ampliable` la abre en grande al tocarla, como en WhatsApp (ver
 * `VisorImagen`). Va apagado por defecto y se enciende donde la foto es el
 * asunto —el panel propio, la ficha, el botón de cambiarla— y no donde es un
 * adorno de una fila que ya lleva su enlace: dentro de un `<a>`, un botón que
 * hace otra cosa es una trampa.
 */
export function Avatar({
  src,
  nombre,
  size = 40,
  ampliable = false,
}: {
  src?: string | null;
  nombre: string;
  size?: number;
  ampliable?: boolean;
}) {
  // Se recuerda QUÉ dirección falló, no un simple «falló»: al cambiar la foto
  // la dirección cambia, y con un booleano el avatar se quedaría en iniciales
  // para siempre.
  const [roto, setRoto] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  const url = urlFoto(src);

  const iniciales = (nombre || '?')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (url && roto !== url) {
    const foto = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nombre}
        width={size}
        height={size}
        onError={() => setRoto(url)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1.5px solid var(--gold-dim)',
          flexShrink: 0,
          background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
        }}
      />
    );

    if (!ampliable) return foto;
    return (
      <>
        <button
          type="button"
          className="miniatura-ampliable"
          onClick={() => setAbierta(true)}
          aria-label={nombre}
          style={{ flexShrink: 0 }}
        >
          {foto}
        </button>
        {abierta && (
          <VisorImagen src={url} alt={nombre} onCerrar={() => setAbierta(false)} />
        )}
      </>
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size * 0.38,
        background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
        border: '1.5px solid var(--gold-dim)',
        color: 'var(--gold)',
        flexShrink: 0,
      }}
    >
      {iniciales}
    </span>
  );
}
