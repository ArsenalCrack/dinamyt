'use client';

import { useState } from 'react';
import {
  ESTADOS_SUSCRIPCION,
  METODOS_PAGO,
  cambiarEstadoSuscripcionAPI,
  editarSuscripcionAPI,
  abonarSuscripcionAPI,
  eliminarSuscripcionAPI,
  renovarSuscripcionAPI,
  historialSuscripcionAPI,
  nombreMetodo,
  extraerError,
  type SuscripcionOrg,
  type Plan,
  type PagoSuscripcion,
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
 *
 * ── Renovar es lo que se hace a diario, y por eso está fuera ──
 *
 * Antes cobrarle el mes siguiente a un club era crear OTRA suscripción: con
 * quince clubes, quince formularios al mes y la historia de cada uno repartida
 * en doce filas que nadie relacionaba. Ahora es un botón, y por eso está en la
 * fila y no escondido detrás de «Editar»: es el gesto normal, no la excepción.
 *
 * Corregir una fecha a mano sigue existiendo —está donde estaba— pero ya no es
 * el camino para renovar. Son cosas distintas: renovar deja un pago escrito y
 * reactiva; editar arregla un dedazo.
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
  const [renovando, setRenovando] = useState(false);
  const [abono, setAbono] = useState('');
  const [metodoAbono, setMetodoAbono] = useState('efectivo');

  /** Lo que se va a cobrar. El precio sale del plan y casi nunca se toca. */
  const precioMes = planes.find((p) => p.id === sub.planId)?.priceMonthly ?? null;
  const [renovacion, setRenovacion] = useState({
    meses: '1',
    precio: '',
    amount: '',
    method: 'efectivo',
    notes: '',
  });

  // ── El historial ──
  // Se pide al abrirlo y no con la fila: son veinte suscripciones en pantalla y
  // traer los pagos de todas para que se miren los de una es pedir veinte veces
  // lo que no se va a leer.
  const [pagos, setPagos] = useState<PagoSuscripcion[] | null>(null);
  const [cargandoPagos, setCargandoPagos] = useState(false);
  const [errorPagos, setErrorPagos] = useState('');

  async function verHistorial() {
    if (pagos) {
      setPagos(null);
      return;
    }
    setCargandoPagos(true);
    setErrorPagos('');
    try {
      setPagos(await historialSuscripcionAPI(sub.id));
    } catch (e) {
      setErrorPagos(extraerError(e, 'No se pudo cargar el historial.'));
    } finally {
      setCargandoPagos(false);
    }
  }
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

        {/* Sin `shrink-0`: con cinco controles —estado, renovar, historial,
            editar y borrar— este bloque ya no cabe en 375 px, y un hijo de un
            flex que no puede encogerse tampoco llega a envolver: se sale de la
            tarjeta y empuja la página entera hacia los lados. */}
        <div className="flex flex-wrap items-center gap-1.5">
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
          {/* El primero de los botones, y en oro: es el que se pulsa cada mes.
              «Editar» y «Borrar» son la excepción. */}
          <button
            type="button"
            onClick={() => setRenovando(!renovando)}
            disabled={ocupado}
            className="btn btn-gold btn-sm"
            title="Extiende la fecha y deja el pago escrito en el historial"
          >
            {renovando ? 'Cerrar' : '↻ Renovar'}
          </button>
          <button
            type="button"
            onClick={() => void verHistorial()}
            disabled={ocupado || cargandoPagos}
            className="btn btn-outline btn-sm"
          >
            {cargandoPagos ? '…' : pagos ? 'Ocultar pagos' : 'Historial'}
          </button>
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

      {/* ── Renovar ─────────────────────────────────────────────────────
          Los tres campos que de verdad cambian —cuántos meses, cuánto costó,
          cuánto entregó— y nada más. El precio y el monto salen ya puestos con
          el precio del plan: el caso normal es pulsar el botón sin tocar nada.

          «Cuánto costó» y «cuánto entregó» son dos campos y no uno porque son
          dos hechos distintos. Con uno solo, quien recibe la mitad tiene que
          elegir entre mentir en el precio o mentir en lo pagado — y el estado
          de pago deja de significar nada. */}
      {renovando && (
        <div
          className="flex flex-col gap-2 border-t pt-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {vencida
              ? 'Está vencida: el periodo nuevo empieza hoy.'
              : `Le quedan días: el periodo nuevo empieza el ${new Date(sub.endsAt).toLocaleDateString('es-CO')} y no pierde ninguno.`}
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Meses</span>
              <input
                className="mt-1"
                inputMode="numeric"
                value={renovacion.meses}
                onChange={(e) =>
                  setRenovacion({
                    ...renovacion,
                    meses: e.target.value.replace(/[^0-9]/g, ''),
                  })
                }
              />
            </label>
            <label className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Cuánto costó</span>
              <input
                className="mt-1"
                inputMode="numeric"
                placeholder={
                  precioMes
                    ? String(Number(precioMes) * (Number(renovacion.meses) || 1))
                    : 'Precio del plan'
                }
                value={renovacion.precio}
                onChange={(e) =>
                  setRenovacion({
                    ...renovacion,
                    precio: e.target.value.replace(/[^0-9.]/g, ''),
                  })
                }
              />
            </label>
            <label className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Cuánto entregó</span>
              <input
                className="mt-1"
                inputMode="numeric"
                placeholder="Todo"
                value={renovacion.amount}
                onChange={(e) =>
                  setRenovacion({
                    ...renovacion,
                    amount: e.target.value.replace(/[^0-9.]/g, ''),
                  })
                }
              />
            </label>
            <div className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Cómo pagó</span>
              <div className="mt-1">
                <SelectMenu
                  valor={renovacion.method}
                  onChange={(v) => setRenovacion({ ...renovacion, method: v })}
                  opciones={METODOS_PAGO.map((m) => ({
                    valor: m.valor,
                    etiqueta: m.etiqueta,
                  }))}
                  etiquetaAria="Forma de pago"
                />
              </div>
            </div>
          </div>
          <label className="block text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Nota (opcional)</span>
            <input
              className="mt-1"
              maxLength={300}
              placeholder="«pagó agosto y septiembre juntos»"
              value={renovacion.notes}
              onChange={(e) => setRenovacion({ ...renovacion, notes: e.target.value })}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() =>
                void onAccion(
                  () =>
                    renovarSuscripcionAPI(sub.id, {
                      meses: Number(renovacion.meses) || 1,
                      precio: renovacion.precio || undefined,
                      amount: renovacion.amount || undefined,
                      method: renovacion.method,
                      notes: renovacion.notes || undefined,
                    }),
                  'Renovada: la fecha se extendió y el pago quedó registrado.',
                  'No se pudo renovar.',
                ).then(() => {
                  setRenovando(false);
                  setRenovacion({
                    meses: '1',
                    precio: '',
                    amount: '',
                    method: renovacion.method,
                    notes: '',
                  });
                  setPagos(null);
                })
              }
              disabled={ocupado}
              className="btn btn-gold btn-sm"
            >
              Renovar y registrar el pago
            </button>
          </div>
        </div>
      )}

      {/* ── El historial ────────────────────────────────────────────────
          Lo que `paid_amount` nunca pudo contar: cuándo entró cada pago, cómo,
          qué meses compró y quién lo recibió. Es lo que se mira cuando un club
          dice que ya pagó. */}
      {(pagos || errorPagos) && (
        <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          {errorPagos && <p className="msg-error text-xs">{errorPagos}</p>}
          {pagos && pagos.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Todavía no hay ningún pago registrado.
            </p>
          )}
          {pagos && pagos.length > 0 && (
            // Se desliza sola en el celular: son seis columnas y no caben en
            // 375 px sin partir las cifras.
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: '34rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="py-1 pr-3 text-left font-medium">Fecha</th>
                    <th className="py-1 pr-3 text-right font-medium">Monto</th>
                    <th className="py-1 pr-3 text-left font-medium">Cómo</th>
                    <th className="py-1 pr-3 text-left font-medium">Periodo</th>
                    <th className="py-1 text-left font-medium">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pg) => (
                    <tr key={pg.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {new Date(pg.paidAt).toLocaleDateString('es-CO')}
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap font-semibold">
                        {dinero(pg.amount)}
                      </td>
                      <td className="py-1.5 pr-3">{nombreMetodo(pg.method)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {/* `periodos: 0` es un abono: paga deuda, no compra
                            meses. Enseñarlo como un periodo vacío haría creer
                            que ese dinero extendió la fecha. */}
                        {pg.periodos > 0 && pg.periodoDesde && pg.periodoHasta
                          ? `${pg.periodoDesde} → ${pg.periodoHasta}`
                          : 'Abono'}
                      </td>
                      <td className="py-1.5" style={{ color: 'var(--text-muted)' }}>
                        {pg.registradoPor ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
            <div className="block text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Cómo pagó</span>
              <div className="mt-1">
                <SelectMenu
                  valor={metodoAbono}
                  onChange={setMetodoAbono}
                  opciones={METODOS_PAGO.map((m) => ({
                    valor: m.valor,
                    etiqueta: m.etiqueta,
                  }))}
                  etiquetaAria="Forma de pago del abono"
                  style={{ width: 'auto', minWidth: '9rem' }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                void onAccion(
                  () =>
                    abonarSuscripcionAPI(sub.id, {
                      paidAmount: abono,
                      method: metodoAbono,
                    }),
                  'Abono registrado.',
                  'No se pudo registrar el abono.',
                ).then(() => {
                  setAbono('');
                  setPagos(null);
                })
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
