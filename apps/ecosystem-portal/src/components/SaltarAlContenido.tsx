'use client';

import { useI18n } from '@/lib/i18n';

/**
 * «Saltar al contenido»: el primer enlace de la página, invisible hasta que el
 * tabulador llega a él. Lleva a `#contenido`, el envoltorio de cada pantalla
 * en el `layout`. La clase `.saltar` vive en `packages/shared/estilos.css`
 * para que las otras tres webs lo pongan igual.
 */
export function SaltarAlContenido() {
  const { t } = useI18n();
  return (
    <a href="#contenido" className="saltar">
      {t('comun.saltarAlContenido')}
    </a>
  );
}
