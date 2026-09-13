'use client';

import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import { SelectMenu } from '@/components/SelectMenu';
import {
  NOMBRE_PAPEL_CAMPEONATOS,
  NOMBRE_ROL,
  RANGO_CAMPEONATOS,
  nombreRol,
  opcionesDeRol,
} from '@/lib/roles';
import type { Miembro } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

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

/** Ordena como el servidor, para comparar la lista marcada con la guardada. */
const porRango = (roles: readonly string[]) =>
  [...new Set(roles)].sort(
    (a, b) =>
      (RANGO_CAMPEONATOS.indexOf(a) + 1 || 99) -
      (RANGO_CAMPEONATOS.indexOf(b) + 1 || 99),
  );

/**
 * Los papeles de una persona en Campeonatos, en casillas (F1 del plan de
 * Campeonatos).
 *
 * ── Por qué casillas y no otro desplegable ──
 *
 * Porque una persona es maestro de su club Y juez en la federación, y un
 * desplegable obliga a elegir cuál de las dos mentir. Campeonatos ya se rompió
 * una vez por eso: `puede_juzgar` es el parche booleano que tuvo que inventarse.
 *
 * ── Por qué va plegado ──
 *
 * Porque casi nadie lo necesita: a casi todo el mundo le basta su rol general,
 * traducido. Abierto por defecto serían cinco casillas por fila en una lista de
 * doscientas personas, para cambiarle algo a tres.
 */
function PapelesCampeonatos({
  miembro,
  disponibles,
  onGuardar,
  bloqueado,
}: {
  miembro: Miembro;
  disponibles: readonly string[];
  onGuardar: (roles: string[]) => void;
  bloqueado: boolean;
}) {
  const actuales = porRango(miembro.papelesCampeonatos ?? []);
  const [abierto, setAbierto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(actuales);

  // Lo que se ofrece: lo que esta organización da, MÁS lo que la persona ya
  // tiene aunque aquí no se pueda dar. Si no, quien llegó con «Juez» de la
  // reconciliación no vería su casilla, y guardar le quitaría el papel sin que
  // nadie lo hubiera pedido. El servidor deja conservarlo, no darlo.
  const opciones = porRango([...disponibles, ...actuales]);
  const cambiado = porRango(marcados).join('|') !== actuales.join('|');

  if (!abierto) {
    return (
      <button
        type="button"
        className="text-xs underline"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => {
          setMarcados(actuales);
          setAbierto(true);
        }}
        title="Qué es esta persona dentro de Campeonatos"
      >
        Campeonatos:{' '}
        {actuales.length
          ? actuales.map((r) => NOMBRE_PAPEL_CAMPEONATOS[r] ?? r).join(' + ')
          : 'nada'}
      </button>
    );
  }

  return (
    <fieldset
      className="mt-2 rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--border)' }}
      disabled={bloqueado}
    >
      <legend className="px-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        Papeles en Campeonatos
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {opciones.map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={marcados.includes(r)}
              onChange={(e) =>
                setMarcados((prev) =>
                  e.target.checked ? [...prev, r] : prev.filter((x) => x !== r),
                )
              }
            />
            {NOMBRE_PAPEL_CAMPEONATOS[r] ?? r}
            {!disponibles.includes(r) && (
              <span
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
                title="Ya lo tenía. Aquí se le puede quitar, pero no dárselo a otra persona."
              >
                (ya lo tenía)
              </span>
            )}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        Se suman: puede ser maestro y competir a la vez. Sin marcar nada, vale lo
        que dice su rol general.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={bloqueado || !cambiado}
          onClick={() => {
            onGuardar(porRango(marcados));
            setAbierto(false);
          }}
        >
          Guardar
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setAbierto(false)}
        >
          Cancelar
        </button>
      </div>
    </fieldset>
  );
}

export function FilaMiembro({
  miembro,
  asignables,
  onCambiarRol,
  ocupado,
  acciones,
  esUnoMismo = false,
  campeonatos,
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
  /**
   * Las casillas de Campeonatos. Solo las pantallas que saben en qué
   * organización están las pasan: el reparto depende de si es un club o una
   * federación.
   */
  campeonatos?: {
    disponibles: readonly string[];
    onGuardar: (roles: string[]) => void;
  };
}) {
  const { t } = useI18n();
  const m = miembro;
  // La excepción de Campeonatos puede ser una lista (F1): «Maestro + Juez».
  const excepcionCampeonatos = m.rolesCampeonatos?.length
    ? m.rolesCampeonatos
        .map((r) => NOMBRE_PAPEL_CAMPEONATOS[r] ?? r)
        .join(' + ')
    : m.roleCampeonatos;
  const tieneApps = Boolean(
    m.roleMembresias ||
      excepcionCampeonatos ||
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
                title={t('org.eresTu')}
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
              <InsigniaApp app="Campeonatos" rol={excepcionCampeonatos} />
              <InsigniaApp app="Academy" rol={m.roleAcademy} />
            </p>
          )}
          {campeonatos && m.papelesCampeonatos && (
            <div className="mt-1">
              <PapelesCampeonatos
                // La clave cambia con lo guardado: al volver la lista
                // recargada, las casillas arrancan de lo que hay ahora y no de
                // lo que se marcó antes de guardar.
                key={(m.papelesCampeonatos ?? []).join('|')}
                miembro={m}
                disponibles={campeonatos.disponibles}
                onGuardar={campeonatos.onGuardar}
                bloqueado={bloqueado}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Por qué NO lleva `flex-wrap` ──
          Los tres controles —rol, perfil y quitar— son una sola cosa: lo que
          se puede hacer con esta persona. Con `flex-wrap`, el desplegable de
          rol se quedaba con la línea entera y la ✕ caía sola a la de abajo,
          debajo del nombre, donde parece que quita OTRA fila. Un botón
          destructivo desalineado de su fila es la peor casilla del panel para
          una duda.

          Ahora la fila no se parte: lo que cede es el ANCHO del desplegable
          (`min-w-0` aquí y abajo), que puede recortar la etiqueta del rol
          porque el rol también está escrito en la insignia de la izquierda.
          Los dos botones son iconos y no encogen. */}
      <div className="flex min-w-0 items-center gap-1.5 @md:shrink-0">
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
        {/* `min-w-0` para que pueda encogerse de verdad: un hijo de flex se
            niega a bajar de su contenido sin él, y entonces la fila se
            desbordaría en vez de estrecharse. El mínimo de 9.5rem vuelve a
            partir de `@xs`, donde ya hay sitio. */}
        <span
          className="min-w-0 flex-1 @xs:min-w-[9.5rem] @xs:flex-none"
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
            style={{ width: '100%', minWidth: 0 }}
            botonStyle={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
          />
        </span>
        {acciones}
      </div>
      </div>
    </li>
  );
}
