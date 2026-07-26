'use client';

/**
 * Foto de perfil con respaldo a iniciales (mismo componente que en las demás
 * webs del ecosistema): si la persona no ha subido foto, van sus iniciales.
 */
export function Avatar({
  src,
  nombre,
  size = 40,
}: {
  src?: string | null;
  nombre: string;
  size?: number;
}) {
  const iniciales = (nombre || '?')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={nombre}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1.5px solid var(--gold-dim)',
          flexShrink: 0,
        }}
      />
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
