'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * La etiqueta de un campo, diciendo si hace falta o no.
 *
 * Los formularios no lo decían: todos los campos se veían iguales y el maestro
 * descubría cuál era obligatorio al pulsar «Crear» y recibir un error. Ahora lo
 * obligatorio lleva su asterisco y lo demás dice «(opcional)» — las dos cosas,
 * porque marcar solo una mitad deja la otra a interpretación.
 *
 * El asterisco va en un `<abbr>` con su título: para quien usa lector de
 * pantalla, un `*` suelto no es más que un símbolo de puntuación.
 */
export function Etiqueta({
  children,
  obligatorio = false,
}: {
  children: ReactNode;
  /** Marca `*`. Sin esto se marca «(opcional)». */
  obligatorio?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span className="muted" style={{ fontSize: '0.78rem' }}>
      {children}{' '}
      {obligatorio ? (
        <abbr
          title={t('comun.obligatorio')}
          style={{ color: 'var(--danger)', textDecoration: 'none', fontWeight: 700 }}
        >
          *
        </abbr>
      ) : (
        <span style={{ opacity: 0.7 }}>({t('comun.opcional')})</span>
      )}
    </span>
  );
}

/** «Los campos con * son obligatorios», al pie del formulario. */
export function LeyendaObligatorios() {
  const { t } = useI18n();
  return (
    <p className="muted" style={{ fontSize: '0.72rem', marginBottom: '0.8rem' }}>
      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span>{' '}
      {t('comun.obligatoriosLeyenda')}
    </p>
  );
}
