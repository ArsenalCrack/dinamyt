'use client';

import { useCallback, useEffect, useState } from 'react';
import { PROPS_CORREO } from '@/lib/validacion';
import {
  verCodigoClubAPI,
  rotarCodigoClubAPI,
  quitarCodigoClubAPI,
  solicitudesDelClubAPI,
  responderSolicitudAPI,
  invitarPersonaAPI,
  invitacionesDelClubAPI,
  cancelarInvitacionAPI,
  extraerError,
  type SolicitudDeEntrada,
  type InvitacionDelClub,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { SelectMenu } from '@/components/SelectMenu';
import { nombreRol } from '@/lib/roles';
import { useConfirmar } from '@/components/Confirmar';

/**
 * **Entrada al club: las dos puertas, juntas.**
 *
 * ── Por qué las dos viven aquí ──
 *
 * Entrar a un club siempre lo deciden DOS personas, y solo cambia quién habla
 * primero:
 *
 *   · **El código** — la persona lo teclea y pide entrar; el maestro acepta.
 *   · **La invitación** — el maestro la manda; la persona acepta.
 *
 * La invitación estaba al final de la lista de gente, disfrazada de «+ Añadir»
 * junto a un buscador y una paginación, y no era ni lo uno ni lo otro: metía la
 * fila de `org_members` en el acto, sin preguntarle a nadie. Vivía lejos de su
 * pareja y hacía lo contrario de lo que decía. Ahora las dos puertas están en
 * la misma tarjeta, cada una con su lista de espera debajo, y ninguna mete a
 * nadie en ningún sitio sin su visto bueno.
 *
 * ── Por qué el código no se enseña solo ──
 *
 * Se crea la primera vez que alguien pulsa «ver el código». Un club que nunca
 * lo mira nunca lo tiene, y esa es la postura segura por defecto: la entrada
 * por código es una puerta, y las puertas se abren a propósito.
 */

/**
 * Roles que el maestro puede dar, y con qué entran a Membresías.
 *
 * La MISMA lista para las dos puertas: aceptar una solicitud y mandar una
 * invitación acaban los dos en una fila de `org_members`, y ofrecer roles
 * distintos según por dónde entre la persona es cómo se acaba con dos alumnos
 * iguales que la app trata distinto.
 */
const ROLES_DE_ENTRADA: { valor: string; etiqueta: string; membresias: string }[] = [
  { valor: 'student', etiqueta: 'Alumno', membresias: 'student' },
  { valor: 'staff', etiqueta: 'Auxiliar / recepción', membresias: 'staff' },
  { valor: 'coach', etiqueta: 'Acudiente', membresias: 'guardian' },
];

const OPCIONES_ROL = ROLES_DE_ENTRADA.map((r) => ({
  valor: r.valor,
  etiqueta: r.etiqueta,
}));

const paraMembresias = (rol: string) =>
  ROLES_DE_ENTRADA.find((r) => r.valor === rol)?.membresias ?? 'student';

/** Cómo se ve el estado de una invitación ya respondida. */
const COLOR_ESTADO: Record<string, { borderColor: string; color: string }> = {
  ACEPTADA: { borderColor: '#3ecf8e', color: '#3ecf8e' },
  RECHAZADA: { borderColor: 'var(--danger)', color: 'var(--danger)' },
  CANCELADA: { borderColor: 'var(--border-strong)', color: 'var(--text-muted)' },
};

export function CodigoYSolicitudes({ orgId }: { orgId: string }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [pedido, setPedido] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudDeEntrada[]>([]);
  const [rolElegido, setRolElegido] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, dialogo } = useConfirmar();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // ── La invitación ───────────────────────────────────────────────────────
  const [invitaciones, setInvitaciones] = useState<InvitacionDelClub[]>([]);
  const [nueva, setNueva] = useState({
    email: '',
    role: 'student',
    fullName: '',
    note: '',
  });
  /**
   * El enlace que se devuelve cuando el correo NO salió.
   *
   * Es la muleta mientras el club no tenga proveedor de correo configurado: el
   * maestro lo copia y lo manda por WhatsApp. Con el correo funcionando no
   * aparece nunca — el enlace es una llave, y quien invita no debería ser quien
   * la reparte.
   */
  const [enlaceSuelto, setEnlaceSuelto] = useState<string | null>(null);

  const cargarSolicitudes = useCallback(async () => {
    try {
      setSolicitudes(await solicitudesDelClubAPI(orgId));
    } catch (e) {
      setError(extraerError(e, 'No se pudieron cargar las solicitudes.'));
    }
  }, [orgId]);

  const cargarInvitaciones = useCallback(async () => {
    try {
      setInvitaciones(await invitacionesDelClubAPI(orgId));
    } catch {
      // Que no se puedan listar las invitaciones no impide mandar una: el
      // formulario sigue funcionando y esta lista simplemente no se dibuja.
      setInvitaciones([]);
    }
  }, [orgId]);

  useEffect(() => {
    void cargarSolicitudes();
    void cargarInvitaciones();
  }, [cargarSolicitudes, cargarInvitaciones]);

  async function accion<T>(fn: () => Promise<T>, exito: string, fallo: string) {
    setOcupado(true);
    setError('');
    setOk('');
    try {
      const r = await fn();
      setOk(exito);
      return r;
    } catch (e) {
      setError(extraerError(e, fallo));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function verCodigo() {
    const r = await accion(
      () => verCodigoClubAPI(orgId),
      'Este es el código de tu club.',
      'No se pudo obtener el código.',
    );
    if (r) {
      setCodigo(r.joinCode);
      setPedido(true);
    }
  }

  async function responder(s: SolicitudDeEntrada, aceptar: boolean) {
    const elegido = rolElegido[s.id] ?? 'student';
    // Aceptar mete a alguien en el club y rechazar le cierra la puerta: las dos
    // le llegan a una persona por correo y ninguna se deshace desde aquí.
    const ok = await confirmar(
      aceptar
        ? {
            titulo: `¿Dejar entrar a ${s.fullName} como «${nombreRol(elegido)}»?`,
            detalle:
              'Entra al club con ese rol y se le avisa por correo. Si te equivocas de rol, se cambia después en la lista de gente.',
            textoOk: 'Aceptar la entrada',
          }
        : {
            titulo: `¿Rechazar la solicitud de ${s.fullName}?`,
            detalle:
              'La solicitud desaparece. Para entrar tendrá que volver a teclear el código del club, o invitarle tú.',
            textoOk: 'Rechazar',
            tono: 'peligro',
          },
    );
    if (!ok) return;
    const r = await accion(
      () =>
        responderSolicitudAPI(s.id, {
          aceptar,
          role: elegido,
          roleMembresias: paraMembresias(elegido),
        }),
      aceptar
        ? `${s.fullName} entró al club como ${nombreRol(elegido)}. Le avisamos por correo.`
        : `Se rechazó la solicitud de ${s.fullName}.`,
      'No se pudo responder la solicitud.',
    );
    if (r) await cargarSolicitudes();
  }

  async function invitar() {
    setEnlaceSuelto(null);
    const correo = nueva.email.trim();
    const r = await accion(
      () =>
        invitarPersonaAPI(orgId, {
          email: correo,
          role: nueva.role,
          roleMembresias: paraMembresias(nueva.role),
          fullName: nueva.fullName.trim() || undefined,
          note: nueva.note.trim() || undefined,
        }),
      // El texto cambia según lo que de verdad pasó al otro lado, y no es un
      // matiz: «invitación enviada» cuando el correo no salió es la forma más
      // rápida de que el maestro se quede esperando una respuesta que nadie
      // sabe que tiene que dar.
      '',
      'No se pudo enviar la invitación.',
    );
    if (!r) return;

    const nombreVisible = nueva.fullName.trim() || correo;
    if (r.aviso.enviadoPorCorreo) {
      setOk(
        r.cuenta === 'existente'
          ? `Invitación enviada a ${correo}. Le aparece en su DINAMYT para que la acepte.`
          : `Le creamos la cuenta a ${nombreVisible} y le mandamos el enlace para poner su contraseña. La invitación le espera dentro.`,
      );
    } else {
      setOk(
        r.cuenta === 'existente'
          ? `${correo} tiene la invitación esperando en su DINAMYT. Avísale tú: este club todavía no manda correos.`
          : `Cuenta creada. Este club todavía no manda correos: pásale tú este enlace para que ponga su contraseña.`,
      );
      if (r.aviso.enlace) setEnlaceSuelto(r.aviso.enlace);
    }

    setNueva({ email: '', role: nueva.role, fullName: '', note: '' });
    await cargarInvitaciones();
  }

  const enElAire = invitaciones.filter((i) => i.status === 'PENDIENTE');

  return (
    <section
      // El ancla al que salta la campana desde «alguien quiere entrar». Sin
      // ella, el aviso dejaba al maestro arriba de una pantalla larga
      // buscando dónde estaba lo que le acababan de decir.
      id="solicitudes"
      className="card p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-1 text-lg font-semibold">Entrada al club</h2>
      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Dos puertas, y las dos las cierra alguien: <b>tú repartes el código</b> y
        aceptas a quien lo teclee, o <b>tú invitas</b> y la persona acepta. En
        cualquiera de las dos, su ficha se crea sola en Membresías al entrar.
      </p>

      {/* ══ Puerta 1 · El código ════════════════════════════════════════ */}
      <h3
        className="eyebrow mb-2"
        style={{ color: 'var(--gold-dim)' }}
      >
        1 · Tu código
      </h3>

      {!pedido ? (
        <button
          onClick={() => void verCodigo()}
          disabled={ocupado}
          className="btn btn-outline"
        >
          Ver el código de mi club
        </button>
      ) : codigo ? (
        <div className="flex flex-wrap items-center gap-3">
          <code
            className="rounded-lg border px-4 py-2 font-mono text-xl tracking-[0.35em]"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            {codigo}
          </code>
          <button
            onClick={async () => {
              if (
                !(await confirmar({
                  titulo: '¿Cambiar el código del club?',
                  detalle:
                    'El de ahora deja de servir en el acto: quien lo tenga apuntado o le haya llegado por WhatsApp ya no podrá entrar con él. Quien YA entró sigue dentro.',
                  textoOk: 'Cambiar el código',
                }))
              ) {
                return;
              }
              await accion(
                () => rotarCodigoClubAPI(orgId).then((r) => setCodigo(r.joinCode)),
                'Código nuevo. El anterior ya no sirve.',
                'No se pudo cambiar el código.',
              );
            }}
            disabled={ocupado}
            className="btn btn-outline btn-sm"
            // Rotar no expulsa a nadie: quien ya entró, entró.
            title="Genera uno nuevo. Quien ya entró sigue dentro."
          >
            Cambiar
          </button>
          <button
            onClick={async () => {
              if (
                !(await confirmar({
                  titulo: '¿Cerrar la entrada por código?',
                  detalle:
                    'Tu club deja de admitir a nadie por código. La única forma de entrar pasa a ser la invitación, una por una. Se puede volver a abrir cuando quieras, pero con un código nuevo.',
                  textoOk: 'Cerrar la entrada',
                  tono: 'peligro',
                }))
              ) {
                return;
              }
              await accion(
                () => quitarCodigoClubAPI(orgId).then(() => setCodigo(null)),
                'Entrada por código cerrada.',
                'No se pudo cerrar la entrada.',
              );
            }}
            disabled={ocupado}
            className="btn btn-danger btn-sm"
          >
            Cerrar entrada
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Tu club no admite entradas por código.
          </p>
          <button
            onClick={() =>
              void accion(
                () => rotarCodigoClubAPI(orgId).then((r) => setCodigo(r.joinCode)),
                'Listo: ya puedes repartirlo.',
                'No se pudo generar el código.',
              )
            }
            disabled={ocupado}
            className="btn btn-gold btn-sm"
          >
            Generar un código
          </button>
        </div>
      )}

      {/* ── La bandeja del código ──────────────────────────────────────── */}
      <h4 className="mb-2 mt-5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        Piden entrar ({solicitudes.length})
      </h4>

      {solicitudes.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Nadie está esperando.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {solicitudes.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            {/* Mismo recorte que en `FilaMiembro`: un correo largo no puede
                empujar los botones fuera de la tarjeta. */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar src={s.avatarUrl} nombre={s.fullName} size={32} />
              <div className="min-w-0">
                <p className="truncate font-semibold" title={s.fullName}>
                  {s.fullName}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--text-muted)' }}
                  title={s.email}
                >
                  {s.email}
                  {s.phone ? ` · ${s.phone}` : ''}
                </p>
                {s.note && (
                  <p className="mt-0.5 truncate text-xs italic" title={s.note}>
                    «{s.note}»
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {/* El desplegable del ecosistema, no el gris del sistema
                  operativo: ver `SelectMenu.tsx`. */}
              <SelectMenu
                valor={rolElegido[s.id] ?? 'student'}
                onChange={(v) => setRolElegido({ ...rolElegido, [s.id]: v })}
                opciones={OPCIONES_ROL}
                etiquetaAria={`Rol de ${s.fullName} al entrar`}
                disabled={ocupado}
                style={{ width: 'auto', minWidth: '10.5rem' }}
                botonStyle={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              />
              <button
                onClick={() => void responder(s, true)}
                disabled={ocupado}
                className="btn btn-gold btn-sm"
              >
                Aceptar
              </button>
              <button
                onClick={() => void responder(s, false)}
                disabled={ocupado}
                className="btn btn-outline btn-sm"
              >
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* ══ Puerta 2 · La invitación ════════════════════════════════════ */}
      <hr className="my-6" style={{ borderColor: 'var(--border)' }} />

      <h3 className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>
        2 · Invitar por correo
      </h3>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Le llega un correo y le aparece en su DINAMYT. <b>No entra hasta que
        acepte</b>: aquí se pregunta, no se agrega. Si todavía no tiene cuenta,
        se la creamos y le mandamos el enlace para que ponga su contraseña.
      </p>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          placeholder="correo@persona.com"
          {...PROPS_CORREO}
          maxLength={200}
          value={nueva.email}
          onChange={(e) => setNueva({ ...nueva, email: e.target.value })}
          aria-label="Correo de quien invitas"
          className="min-w-0"
        />
        <SelectMenu
          valor={nueva.role}
          onChange={(v) => setNueva({ ...nueva, role: v })}
          opciones={OPCIONES_ROL}
          etiquetaAria="Rol con el que entraría"
          disabled={ocupado}
          style={{ minWidth: '11rem' }}
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Nombre completo — solo si todavía no tiene cuenta
          </span>
          <input
            className="mt-1"
            maxLength={200}
            value={nueva.fullName}
            onChange={(e) => setNueva({ ...nueva, fullName: e.target.value })}
            placeholder="ANA RESTREPO"
          />
        </label>
        <label className="block text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Un mensaje para ella (opcional)
          </span>
          <input
            className="mt-1"
            maxLength={300}
            value={nueva.note}
            onChange={(e) => setNueva({ ...nueva, note: e.target.value })}
            placeholder="«eres del grupo de los martes»"
          />
        </label>
      </div>

      <button
        onClick={() => void invitar()}
        disabled={ocupado || !nueva.email.trim()}
        className="btn btn-gold mt-3"
      >
        ✉ Enviar invitación
      </button>

      {enlaceSuelto && (
        <div
          className="mt-3 rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--gold-dim)', background: 'var(--bg-elevated)' }}
        >
          <p className="mb-1 font-semibold">Pásale este enlace:</p>
          <p className="break-all" style={{ color: 'var(--gold)' }}>
            {enlaceSuelto}
          </p>
        </div>
      )}

      {/* ── Las invitaciones en el aire ─────────────────────────────────── */}
      <h4 className="mb-2 mt-5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        Invitaciones sin responder ({enElAire.length})
      </h4>

      {enElAire.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No tienes ninguna esperando.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {enElAire.map((i) => (
          <li
            key={i.id}
            className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar src={i.avatarUrl} nombre={i.fullName ?? i.email} size={32} />
              <div className="min-w-0">
                <p className="truncate font-semibold" title={i.fullName ?? i.email}>
                  {i.fullName ?? i.email}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--text-muted)' }}
                  title={i.email}
                >
                  {i.email} · {nombreRol(i.role)}
                </p>
                {/* La diferencia importa: sin contraseña, la persona todavía no
                    tiene dónde aceptar nada. */}
                {!i.cuentaLista && (
                  <span className="badge mt-1 inline-block">
                    Aún no ha puesto su contraseña
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="badge" style={COLOR_ESTADO[i.status]}>
                Esperando
              </span>
              <button
                onClick={async () => {
                  if (
                    !(await confirmar({
                      titulo: `¿Retirar la invitación de ${i.email}?`,
                      detalle:
                        'El enlace que le mandamos deja de valer. Si aún quieres que entre, tendrás que invitarle otra vez.',
                      textoOk: 'Retirar',
                      tono: 'peligro',
                    }))
                  ) {
                    return;
                  }
                  await accion(
                    () => cancelarInvitacionAPI(i.id).then(cargarInvitaciones),
                    `Se retiró la invitación de ${i.email}.`,
                    'No se pudo retirar la invitación.',
                  );
                }}
                disabled={ocupado}
                className="btn btn-outline btn-sm"
                style={{ color: 'var(--danger)' }}
                title={`Retirar la invitación de ${i.email}`}
              >
                Retirar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="msg-error mt-3 text-sm">{error}</p>}
      {ok && <p className="msg-ok mt-3 text-sm">{ok}</p>}
      {dialogo}
    </section>
  );
}
