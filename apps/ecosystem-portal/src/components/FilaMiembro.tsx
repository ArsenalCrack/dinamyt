'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import { NOMBRE_ROL, nombreRol, opcionesDeRol } from '@/lib/roles';
import type { Miembro } from '@/lib/api';

/**
 * Una persona dentro de una organización, en las listas del portal.
 *
 * ── Por qué es un componente y no el mismo JSX copiado en tres pantallas ──
 *
 * Estaba copiado, y las copias se separaron: el panel del super-admin pintaba
 * el valor crudo del rol («student») y el del maestro una etiqueta en español
 * («Alumno»), así que la misma persona parecía tener dos roles distintos según
 * quién la mirara. Con una sola fila, eso no puede volver a pasar.
 *
 * ── El desbordamiento ──
 *
 * La fila era un `flex` con el nombre y el correo dentro de un `<span>` sin
 * `min-w-0`, y los controles al lado. Un correo largo —que son casi todos:
 * `nombre.apellido@algo.com`— no cabía, no se recortaba, y empujaba los
 * botones fuera de la tarjeta o encima del texto. Aquí el bloque de identidad
 * es una rejilla que puede encogerse (`minWidth: 0`), el correo se recorta con
 * puntos suspensivos y lleva su `title` para poder leerlo entero, y en pantalla
 * estrecha los controles bajan a su propia línea en vez de pelearse por el
 * ancho.
 */

/** Un rol de app, solo si la persona participa en ella. */
function InsigniaApp({ app, rol }: { app: string; rol?: string | null }) {
  if (!rol) return null;
  return (
    <span className="badge" title={`Rol en ${app}: ${rol}`}>
      {app} · {NOMBRE_ROL[rol] ?? rol}
    </span>
  );
}

export function FilaMiembro({
  miembro,
  asignables,
  onCambiarRol,
  ocupado,
  acciones,
}: {
  miembro: Miembro;
  /** Roles que ESTA pantalla puede asignar. El actual se añade solo. */
  asignables: readonly string[];
  onCambiarRol: (rol: string) => void;
  ocupado?: boolean;
  /** Botones propios de cada pantalla (editar perfil, quitar…). */
  acciones?: ReactNode;
}) {
  const m = miembro;
  const tieneApps = Boolean(m.roleMembresias || m.roleCampeonatos || m.roleAcademy);

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Identidad. `min-w-0` en los dos niveles: sin él, el hijo de un flex
          se niega a encogerse por debajo de su contenido y el recorte no
          llega a aplicarse nunca. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar src={m.avatarUrl} nombre={m.fullName} size={32} />
        <div className="min-w-0">
          <p className="truncate font-semibold" title={m.fullName}>
            {m.fullName}
          </p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--text-muted)' }}
            title={m.email}
          >
            {m.email}
          </p>
          {tieneApps && (
            <p className="mt-1 flex flex-wrap gap-1">
              <InsigniaApp app="Membresías" rol={m.roleMembresias} />
              <InsigniaApp app="Campeonatos" rol={m.roleCampeonatos} />
              <InsigniaApp app="Academy" rol={m.roleAcademy} />
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`rol-${m.memberId}`}>
          Rol de {m.fullName} en la organización
        </label>
        {/* `width: auto` a mano: la regla base de `globals.css` da a todo
            `select` un ancho del 100 %, pensada para los formularios de una
            columna. Dentro de una fila estira el desplegable hasta empujar los
            botones fuera de la tarjeta. */}
        <select
          id={`rol-${m.memberId}`}
          value={m.role}
          onChange={(e) => onCambiarRol(e.target.value)}
          disabled={ocupado}
          title={`Rol en el portal: ${nombreRol(m.role)}`}
          style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
        >
          {opcionesDeRol(m.role, asignables).map((r) => (
            <option key={r} value={r}>
              {nombreRol(r)}
            </option>
          ))}
        </select>
        {acciones}
      </div>
    </li>
  );
}
