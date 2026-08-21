'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  verCodigoClubAPI,
  rotarCodigoClubAPI,
  quitarCodigoClubAPI,
  solicitudesDelClubAPI,
  responderSolicitudAPI,
  extraerError,
  type SolicitudDeEntrada,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { nombreRol } from '@/lib/roles';

/**
 * El código del club y la bandeja de quien pide entrar — la mitad del maestro.
 *
 * ── Por qué el código no se enseña solo ──
 *
 * Se crea la primera vez que alguien pulsa «ver el código». Un club que nunca
 * lo mira nunca lo tiene, y esa es la postura segura por defecto: la entrada
 * por código es una puerta, y las puertas se abren a propósito.
 *
 * ── Por qué la bandeja va JUNTO al código ──
 *
 * Porque son la misma decisión partida en dos momentos. Repartir un código sin
 * mirar quién llega es exactamente cómo entra al club gente que nadie invitó, y
 * si la bandeja vive en otra pantalla, nadie la abre.
 */

/** Roles que el maestro puede dar al aceptar. El general va emparejado. */
const AL_ACEPTAR: { valor: string; etiqueta: string; membresias: string }[] = [
  { valor: 'student', etiqueta: 'Alumno', membresias: 'student' },
  { valor: 'staff', etiqueta: 'Auxiliar / recepción', membresias: 'staff' },
  { valor: 'coach', etiqueta: 'Acudiente', membresias: 'guardian' },
];

export function CodigoYSolicitudes({ orgId }: { orgId: string }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [pedido, setPedido] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudDeEntrada[]>([]);
  const [rolElegido, setRolElegido] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargarSolicitudes = useCallback(async () => {
    try {
      setSolicitudes(await solicitudesDelClubAPI(orgId));
    } catch (e) {
      setError(extraerError(e, 'No se pudieron cargar las solicitudes.'));
    }
  }, [orgId]);

  useEffect(() => {
    void cargarSolicitudes();
  }, [cargarSolicitudes]);

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
    const par = AL_ACEPTAR.find((r) => r.valor === elegido);
    const r = await accion(
      () =>
        responderSolicitudAPI(s.id, {
          aceptar,
          role: elegido,
          roleMembresias: par?.membresias ?? 'student',
        }),
      aceptar
        ? `${s.fullName} entró al club como ${nombreRol(elegido)}.`
        : `Se rechazó la solicitud de ${s.fullName}.`,
      'No se pudo responder la solicitud.',
    );
    if (r) await cargarSolicitudes();
  }

  return (
    <section
      className="card p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-1 text-lg font-semibold">Entrada al club</h2>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Reparte este código y quien lo teclee en DINAMYT te aparecerá aquí para
        que lo aceptes. Al aceptarlo, su ficha se crea sola en Membresías.
      </p>

      {/* ── El código ─────────────────────────────────────────────────── */}
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
            onClick={() =>
              void accion(
                () => rotarCodigoClubAPI(orgId).then((r) => setCodigo(r.joinCode)),
                'Código nuevo. El anterior ya no sirve.',
                'No se pudo cambiar el código.',
              )
            }
            disabled={ocupado}
            className="btn btn-outline btn-sm"
            // Rotar no expulsa a nadie: quien ya entró, entró.
            title="Genera uno nuevo. Quien ya entró sigue dentro."
          >
            Cambiar
          </button>
          <button
            onClick={() =>
              void accion(
                () => quitarCodigoClubAPI(orgId).then(() => setCodigo(null)),
                'Entrada por código cerrada.',
                'No se pudo cerrar la entrada.',
              )
            }
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

      {/* ── La bandeja ────────────────────────────────────────────────── */}
      <h3 className="mb-2 mt-5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        Piden entrar ({solicitudes.length})
      </h3>

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
              <label className="sr-only" htmlFor={`rol-sol-${s.id}`}>
                Rol de {s.fullName} al entrar
              </label>
              <select
                id={`rol-sol-${s.id}`}
                value={rolElegido[s.id] ?? 'student'}
                onChange={(e) =>
                  setRolElegido({ ...rolElegido, [s.id]: e.target.value })
                }
                disabled={ocupado}
                style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              >
                {AL_ACEPTAR.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
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

      {error && <p className="msg-error mt-3 text-sm">{error}</p>}
      {ok && <p className="msg-ok mt-3 text-sm">{ok}</p>}
    </section>
  );
}
