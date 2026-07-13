'use client';

/**
 * Foto de perfil con respaldo a iniciales (mismo componente en las tres webs
 * del ecosistema): si la persona no ha subido foto, van sus iniciales.
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
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: '1.5px solid var(--gold-dim, var(--gold))' }}
      />
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
        border: '1.5px solid var(--gold-dim, var(--gold))',
        color: 'var(--gold)',
      }}
    >
      {iniciales}
    </span>
  );
}
