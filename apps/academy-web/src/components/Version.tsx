'use client';

import { versionDeLaApp } from '@dinamyt/shared';

/**
 * La versión que está corriendo, en pequeño y donde no estorbe.
 *
 * ── Para qué sirve de verdad ──
 *
 * Para la conversación que se repite: alguien escribe «me sigue pasando» y no
 * hay forma de saber si está viendo el arreglo o la pantalla de antes. Con la
 * fecha a la vista, la respuesta es un vistazo — y si no coincide, ya se sabe
 * que lo que falta es recargar la app instalada, no volver a depurar.
 *
 * ── El formato ──
 *
 * `2026.09.05` en pantalla, y `2026.09.05+8cacddf` en el `title`, que es lo que
 * sale al dejar el cursor encima y lo que hay que pegar en un reporte. El
 * porqué de CalVer, y qué cuenta como una actualización, está escrito en
 * `packages/shared/src/version.ts`.
 *
 * En local dice `dev`, a propósito: ahí el código cambia al guardar y una
 * versión fija sería mentira.
 */
export function Version({ className }: { className?: string }) {
  const v = versionDeLaApp({
    fecha: process.env.NEXT_PUBLIC_VERSION_FECHA,
    commit: process.env.NEXT_PUBLIC_VERSION_COMMIT,
  });

  return (
    <span
      className={`mono ${className ?? ''}`}
      title={`Versión ${v.completa}`}
      style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.75 }}
    >
      v{v.fecha}
    </span>
  );
}
