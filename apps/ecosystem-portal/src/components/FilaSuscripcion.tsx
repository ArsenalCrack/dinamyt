'use client';

import { useState } from 'react';
import {
  ESTADOS_SUSCRIPCION,
  cambiarEstadoSuscripcionAPI,
  editarSuscripcionAPI,
  abonarSuscripcionAPI,
  eliminarSuscripcionAPI,
  type SuscripcionOrg,
  type Plan,
} from '@/lib/api';
import { CampoFecha } from '@/components/CampoFecha';
import { SelectMenu } from '@/components/SelectMenu';

/**
 * Una suscripción de organización, con todo lo que se le puede hacer.
 *
 * ── Qué faltaba ──
 *
 * Solo se podía CREAR y activar. Una fecha mal tecleada, un club que se va o
 * una suscripción creada por error se quedaban en la base para siempre, y el
 * panel acababa enseñando cosas que no correspondían a nada.
 *
 * ── Cancelar y borrar no son lo mismo, y aquí se nota ──
 *
 * **Suspender** corta el acceso y conserva la historia: es lo que se quiere
 * casi siempre, así que está a un toque, en el desplegable de estado.
 * **Borrar** hace desaparecer la fila, pide confirmación, y el servidor lo
 * rechaza si hay algún abono registrado — no hay tabla de pagos aparte, el
 * dinero vive en `paid_amount`, y borrar la fila borraría el único registro de
 * que entró.
 *
 * ── Por qué la edición está plegada ──
 *
 * Corregir fechas es raro; mirar el estado es constante. Con los campos
 * siempre abiertos, la lista de veinte suscripciones no cabe en una pantalla y
 * lo que se consulta a diario queda enterrado bajo formularios que nadie toca.
 */

/** Cómo se lee cada estado de pago. El valor crudo no lo entiende nadie. */
const PAGO: Record<string, { texto: string; clase: string }> = {
  PAID: { texto: 'Pagada', clase: 'badge badge-gold' },
  PARTIAL: { texto: 'Abono parcial', clase: 'badge' },
  PENDING: { texto: 'Sin pagos', clase: 'badge' },
};

const dinero = (v: string | null) =>
  v == null || v === ''
    ? '—'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(v));

export function FilaSuscripcion({
  sub,
  planes,
  ocupado,
  onAccion,
}: {
  sub: SuscripcionOrg;
  planes: Plan[];
  ocupado?: boolean;
  /** Ejecuta la llamada, avisa y recarga. Lo pone la pantalla. */
  onAccion: (
    fn: () => Promise<unknown>,
    exito: string,
    fallo: string,
  ) => Promise<unknown>;
}) {
  const [editando, setEditando] = useState(false);
  const [abono, setAbono] = useState('');
  const [form, setForm] = useState({
    planId: sub.planId ?? '',
    startsAt: sub.startsAt ? sub.startsAt.slice(0, 10) : '',
    endsAt: sub.endsAt ? sub.endsAt.slice(0, 10) : '',
    totalAmount: sub.totalAmount ?? '',
    notes: sub.notes ?? '',
  });

  const pago = PAGO[sub.paymentStatus] ?? { texto: sub.paymentStatus, clase: 'badge' };
  const vencida = new Date(sub.endsAt) < new Date();

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{sub.planName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={pago.clase}>{pago.texto}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {dinero(sub.paidAmount)} de {dinero(sub.totalAmount)}
            </span>
            <span
              style={{ color: vencida ? 'var(--danger)' : 'var(--text-muted)' }}
              // La fecha se dice entera: «hasta 12/2» no distingue el año, y una
              // suscripción vencida hace doce meses se lee igual que una de la
              // semana que viene.
              title={new Date(sub.endsAt).toLocaleDateString('es-CO', {
                dateStyle: 'full',
              })}
            >
              {vencida ? 'venció' : 'hasta'} el{' '}
              {new Date(sub.endsAt).toLocaleDateString('es-CO')}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <SelectMenu
            valor={sub.status}
            disabled={ocupado}
            onChange={(v) =>
              void onAccion(
                () => cambiarEstadoSuscripcionAPI(sub.id, v),
                'Estado actualizado.',
                'No se pudo cambiar el estado.',
              )
            }
            opciones={ESTADOS_SUSCRIPCION.map((e) => ({
              valor: e.valor,
              etiqueta: e.etiqueta,
            }))}
            etiquetaAria="Estado de la suscripción"
            style={{ width: 'auto', minWidth: '9rem' }}
            botonStyle={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
          />
          <button
            type="button"
            onClick={() => setEditando(!editando)}
            disabled={ocupado}
            className="btn btn-outline btn-sm"
          >
            {editando ? 'Cerrar' : 'Editar'}
          </button>
          <button
            type="button"
            onClick={() => {
              // Confirmación del navegador y no un diálogo propio: es una
              // acción rara, del super-admin, y un `confirm` no se puede
              // pulsar sin querer al deslizar la lista en el celular.
              if (
                !window.confirm(
                  `¿Borrar la suscripción «${sub.planName}» de ${sub.orgName}? No se puede deshacer.`,
                )
              ) {
                return;
              }
              void onAccion(
                () => eliminarSuscripcionAPI(sub.id),
                'Suscripción borrada.',
                'No se pudo borrar.',
              );
            }}
            disabled={ocupado}
            className="btn btn-danger btn-sm"
            title="Borra la fila. Si tiene pagos registrados, el servidor lo impide: suspéndela."
          >
            Borrar
          </button>
        </div>
      </div>

      {editando && (
        <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Plan</span>
              <div className="mt-1">
                <SelectMenu
                  valor={form.planId}
                  onChange={(v) => setForm({ ...form, planId: v })}
                  opciones={planes.map((p) => ({ valor: p.id, etiqueta: p.name }))}
                  etiquetaAria="Plan de la suscripción"
                  placeholder="Plan…"
                />
              </div>
            </div>
            <label className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Monto total</span>
              <input
                className="mt-1"
                inputMode="numeric"
                value={form.totalAmount}
                onChange={(e) =>
                  setForm({ ...form, totalAmount: e.target.value.replace(/[^0-9.]/g, '') })
                }
              />
            </label>
            <div className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Desde</span>
              <div className="mt-1">
                <CampoFecha
                  valor={form.startsAt}
                  onChange={(v) => setForm({ ...form, startsAt: v })}
                  etiquetaAria="Inicio de la suscripción"
                  borrable={false}
                />
              </div>
            </div>
            <div className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Hasta</span>
              <div className="mt-1">
                <CampoFecha
                  valor={form.endsAt}
                  onChange={(v) => setForm({ ...form, endsAt: v })}
                  etiquetaAria="Fin de la suscripción"
                  borrable={false}
                />
              </div>
            </div>
          </div>
          <label className="block text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Notas</span>
            <input
              className="mt-1"
              value={form.notes}
              maxLength={300}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void onAccion(
                  () =>
                    editarSuscripcionAPI(sub.id, {
                      planId: form.planId || undefined,
                      startsAt: form.startsAt || undefined,
                      endsAt: form.endsAt || undefined,
                      totalAmount: form.totalAmount || null,
                      notes: form.notes || null,
                    }),
                  'Suscripción corregida.',
                  'No se pudo corregir.',
                ).then(() => setEditando(false))
              }
              disabled={ocupado}
              className="btn btn-gold btn-sm"
            >
              Guardar cambios
            </button>
          </div>

          {/* ── Abono ──
              Suma al pagado y recalcula el estado de pago; no lo sustituye.
              Se escribe lo que entró HOY, que es como lo cuenta quien cobra. */}
          <div
            className="flex flex-wrap items-end gap-2 border-t pt-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <label className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Registrar un abono</span>
              <input
                className="mt-1"
                inputMode="numeric"
                placeholder="Lo que entró hoy"
                value={abono}
                onChange={(e) => setAbono(e.target.value.replace(/[^0-9.]/g, ''))}
                style={{ width: 'auto' }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                void onAccion(
                  () => abonarSuscripcionAPI(sub.id, { paidAmount: abono }),
                  'Abono registrado.',
                  'No se pudo registrar el abono.',
                ).then(() => setAbono(''))
              }
              disabled={ocupado || !abono || Number(abono) <= 0}
              className="btn btn-outline btn-sm"
            >
              Abonar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
