/* eslint-disable @next/next/no-img-element */
/**
 * Identidad visual de DINAMYT: el logo oficial (la "D" dorada con el
 * pateador) es el mismo de DINAMYT-COMBAT (public/logo.png).
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="DINAMYT"
      width={size}
      height={size}
      style={{ display: 'inline-block', objectFit: 'contain' }}
    />
  );
}

export function Logo({
  size = 36,
  subtitle = 'Campeonatos',
}: {
  size?: number;
  subtitle?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span
          className="block text-lg font-extrabold tracking-wide"
          style={{ color: 'var(--gold)' }}
        >
          DINAMYT
        </span>
        {subtitle && (
          <span
            className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
