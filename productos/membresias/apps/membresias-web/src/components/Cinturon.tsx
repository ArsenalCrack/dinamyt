'use client';

import { cinturonPorNombre, fondoCinturon } from '@/lib/cinturones';
import { useI18n } from '@/lib/i18n';

/**
 * El cinturón de un alumno: un punto del color del grado y su nombre.
 *
 * El punto es lo que se lee de un vistazo cuando el maestro recorre el roster
 * con la vista; el nombre está para quien no distingue dos verdes en una
 * pantalla pequeña.
 */
export function Cinturon({
  nombre,
  soloPunto = false,
}: {
  nombre: string | null | undefined;
  soloPunto?: boolean;
}) {
  const { t } = useI18n();
  const c = cinturonPorNombre(nombre);

  if (!c) {
    return soloPunto ? null : (
      <span className="muted" style={{ fontSize: '0.8rem' }}>
        —
      </span>
    );
  }

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      title={`${t('comun.cinturon')}: ${c.nombre}`}
    >
      <span
        aria-hidden="true"
        style={{
          width: '0.85rem',
          height: '0.85rem',
          borderRadius: 999,
          flexShrink: 0,
          background: fondoCinturon(c),
          border: '1px solid var(--border-strong)',
        }}
      />
      {!soloPunto && <span style={{ fontSize: '0.85rem' }}>{c.nombre}</span>}
    </span>
  );
}
