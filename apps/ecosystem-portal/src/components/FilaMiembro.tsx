'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import { SelectMenu } from '@/components/SelectMenu';
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
 * es una rejilla que puede encogerse (`minWidth: 0`) y el correo se recorta con
 * puntos suspensivos, con su `title` para poder leerlo entero.
 *
 * ── Por qué se mide con `@container` y no con `sm:` ──
 *
 * **Este era el bug de los nombres tapados.** `sm:flex-row` mira el ancho de la
 * VENTANA, no el de la fila. En el panel del super-admin esta fila vivía dentro
 * de media pantalla partida otra vez en dos columnas —un cuarto del ancho
 * total, unos 260 px— y aun así `sm:` la ponía en horizontal, porque la ventana
 * sí era ancha. El desplegable de rol pide 152 px y los botones lo suyo, así
 * que al nombre no le quedaba nada: se recortaba hasta desaparecer.
 *
 * Con `@container` la fila se mide a sí misma. Estrecha, apila; ancha, pone los
 * controles al lado. Da igual en cuántas columnas la metan.
 *
 * ── La fila de uno mismo ──
 *
 * Se pinta distinta a propósito. El servidor ya impide que quien manda en una
 * organización se quite o se degrade —perdería su panel en el acto y no podría
 * deshacerlo—, pero una pantalla que ofrece un botón y luego contesta que no se
 * puede es una pantalla que miente. Aquí el desplegable de rol va bloqueado y
 * el botón de quitar no se dibuja: lo que no se puede hacer no se enseña.
 */

/**
 * Un rol de app, solo si la persona participa en ella.
 *
 * `sinAcceso` la pinta en rojo y lo dice: quien administra el club tiene que
 * poder ver de un vistazo a quién se le cortó el acceso en Membresías. Antes
 * esa persona salía en esta lista exactamente igual que las demás —perteneces
 * al club y punto—, y para enterarse había que abrir la otra aplicación.
 */
function InsigniaApp({
  app,
  rol,
  sinAcceso = false,
}: {
  app: string;
  rol?: string | null;
  sinAcceso?: boolean;
}) {
  // `sinAcceso` basta por sí solo, sin rol: esa marca solo la escribe la propia
  // app al cortarle el acceso a alguien (`POST /sync/acceso`), así que tenerla
  // ya demuestra que esa persona está allí. Pedir además el rol dejaba mudo
  // justo el caso que se venía a enseñar — el rol por app se borra al cambiar
  // el general (ver `cambiar-rol.spec.ts`), y entonces la fila volvía a
  // parecerse a todas las demás.
  if (sinAcceso) {
    return (
      <span
        className="badge badge-danger"
        title={`Su maestro le retiró el acceso a ${app}. Sigue siendo del club: su ficha, sus pagos y su asistencia están intactos, y se le devuelve el acceso desde ${app}.`}
      >
        {app} · sin acceso
      </span>
    );
  }
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
  esUnoMismo = false,
}: {
  miembro: Miembro;
  /** Roles que ESTA pantalla puede asignar. El actual se añade solo. */
  asignables: readonly string[];
  onCambiarRol: (rol: string) => void;
  ocupado?: boolean;
  /** Botones propios de cada pantalla (editar perfil, quitar…). */
  acciones?: ReactNode;
  /** ¿Esta fila es la de quien está mirando la pantalla? */
  esUnoMismo?: boolean;
}) {
  const m = miembro;
  const tieneApps = Boolean(
    m.roleMembresias ||
      m.roleCampeonatos ||
      m.roleAcademy ||
      m.membresiasActivo === false,
  );
  // Quien manda no se toca a sí mismo. A un alumno mirándose no le estorba
  // nada, pero tampoco tiene nada que cambiarse: se bloquea igual y así la
  // regla es una sola y se entiende de un vistazo.
  const bloqueado = Boolean(ocupado) || esUnoMismo;

  return (
    <li
      className="@container rounded-lg border px-3 py-2.5 text-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:justify-between @md:gap-3">
      {/* Identidad. `min-w-0` en los dos niveles: sin él, el hijo de un flex
          se niega a encogerse por debajo de su contenido y el recorte no
          llega a aplicarse nunca. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Ampliable: en una lista de doscientos, treinta y dos píxeles no
            bastan para reconocer a nadie. La fila no es un enlace ni un botón,
            así que aquí el anidado no es problema. */}
        <Avatar src={m.avatarUrl} nombre={m.fullName} size={32} ampliable />
        <div className="min-w-0">
          <p className="truncate font-semibold" title={m.fullName}>
            {m.fullName}
            {esUnoMismo && (
              <span
                className="badge badge-gold ml-1.5 align-middle"
                title="Eres tú: tu propio rol no lo cambias desde aquí"
              >
                Tú
              </span>
            )}
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
              <InsigniaApp
                app="Membresías"
                rol={m.roleMembresias}
                sinAcceso={m.membresiasActivo === false}
              />
              <InsigniaApp app="Campeonatos" rol={m.roleCampeonatos} />
              <InsigniaApp app="Academy" rol={m.roleAcademy} />
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 @md:shrink-0">
        {/* El desplegable del ecosistema y no el `<select>` nativo: este es el
            «tipo de usuario» del panel del maestro, y se pintaba con los
            colores del sistema operativo —gris, distinto en cada navegador, y
            en Android con su propia hoja a pantalla completa— en medio de una
            interfaz que no es nada de eso. Ver `SelectMenu.tsx`.

            El ancho va a mano porque la regla base de `globals.css` da a los
            campos un ancho del 100 %, pensada para los formularios de una
            columna; dentro de una fila estiraría hasta empujar los botones
            fuera de la tarjeta. */}
        {/* El `title` va en el envoltorio y no en el `SelectMenu`: el
            componente no recibe uno, y un control bloqueado sin explicación es
            justo el que hace pensar que la aplicación está rota. */}
        <span
          title={
            esUnoMismo
              ? 'Tu propio rol no lo cambias tú: pídeselo a otra persona que administre la organización, o al super administrador.'
              : undefined
          }
        >
          <SelectMenu
            valor={m.role}
            onChange={onCambiarRol}
            opciones={opcionesDeRol(m.role, asignables).map((r) => ({
              valor: r,
              etiqueta: nombreRol(r),
            }))}
            etiquetaAria={
              esUnoMismo
                ? `Tu rol en la organización (${nombreRol(m.role)}); no lo puedes cambiar tú`
                : `Rol de ${m.fullName} en la organización`
            }
            disabled={bloqueado}
            style={{ width: 'auto', minWidth: '9.5rem' }}
            botonStyle={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
          />
        </span>
        {acciones}
      </div>
      </div>
    </li>
  );
}
