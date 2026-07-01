/**
 * Identidad visual de DINAMYT: rayo dorado (energía / impacto marcial) sobre
 * placa oscura. `LogoMark` es solo el símbolo; `Logo` añade el wordmark.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#1c1c2a" />
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        stroke="#f0b800"
        strokeWidth="2"
      />
      <path
        d="M27 5 L13 27 h9 L19 43 L35 20 h-9 L31 5 Z"
        fill="#f0b800"
        stroke="#c99a00"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
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
