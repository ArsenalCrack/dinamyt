'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { LIM, soloDigitos } from '@/lib/campos';
import { avisar } from '@/lib/sonido';
import { EscanerQR } from '@/components/EscanerQR';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QKEY = 'membresias_checkin_queue';

interface Encolado {
  identifier: { type: string; value: string };
  /**
   * El día en que se marcó DE VERDAD, en hora local del celular.
   *
   * Es el único que sabe qué día entró el alumno: sin esto, la marca del sábado
   * en el salón sin señal llegaba al servidor el lunes y quedaba fechada el
   * lunes. La API la acepta solo hacia atrás y dentro de una ventana corta (ver
   * `routes/checkin.ts`).
   */
  fecha: string;
  marcadoEn: string;
  ts: number;
}

/** Una marca de la cola que el servidor no aceptó. Ver `flush`. */
interface Rechazado {
  valor: string;
  fecha: string;
  motivo: string;
}

interface Resultado {
  ok: boolean;
  bloqueado?: boolean;
  userId?: string;
  estado?: string;
  diasFaltantes?: number | null;
  clasesRestantes?: number | null;
  accionSugerida?: string;
  message?: string;
  error?: string;
}

/**
 * Marcar asistencia con el carnet QR o con el PIN.
 *
 * ── De dónde sale ────────────────────────────────────────────────────────────
 *
 * Era la pantalla `/kiosco`, que se retiró porque hacía lo mismo que
 * «Asistencia» con otra cara: las dos llaman a `POST /checkin` y las dos pasan
 * lista. Lo que el kiosco tenía de propio —el escáner, el PIN y la cola sin
 * conexión— es esto, y ahora vive DENTRO de Asistencia. Su parrilla de botones
 * no se trajo: marcar a alguien de la lista es justo lo que Asistencia ya hace,
 * y con buscador y paginación, que la parrilla no tenía.
 *
 * ── La cola es lo que no se podía perder ────────────────────────────────────
 *
 * El salón sin señal es el caso normal, no el raro. Sin conexión la marca se
 * guarda en este dispositivo **con su fecha**, y se manda sola cuando vuelva la
 * red. Lo que el servidor rechace sale de la cola —reintentarlo daría el mismo
 * error para siempre— pero **no desaparece en silencio**: queda en pantalla con
 * el motivo, para registrarlo a mano desde la ficha del alumno.
 *
 * ── El pitido ───────────────────────────────────────────────────────────────
 *
 * El maestro está en la puerta con la fila delante: no mira la pantalla cuando
 * el alumno pasa el carnet. El sonido dice las tres cosas que hay que saber sin
 * bajar la vista —entró, entró pero hay algo que decirle, o no entró—; la
 * tarjeta cuenta el detalle para cuando sí se mire.
 */
export function MarcarConCarnet({
  nombreDe,
  onMarcado,
}: {
  /** Cómo se llama el dueño de ese id o PIN, para nombrarlo en la tarjeta. */
  nombreDe: (id?: string) => string;
  /** Que la lista del día se entere de que acaba de entrar alguien. */
  onMarcado: () => void;
}) {
  const { t, idioma } = useI18n();
  const [pin, setPin] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [rechazados, setRechazados] = useState<Rechazado[]>([]);

  function encolar(identifier: { type: string; value: string }) {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    const ahora = new Date();
    q.push({
      identifier,
      // La fecha se congela AQUÍ, con el reloj del dispositivo que está en la
      // puerta: es el único que sabe qué día entró el alumno.
      fecha: hoyISO(),
      marcadoEn: ahora.toISOString(),
      ts: ahora.getTime(),
    });
    localStorage.setItem(QKEY, JSON.stringify(q));
    setPendientes(q.length);
  }

  const flush = useCallback(async () => {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    if (!q.length) return;
    const rest: Encolado[] = [];
    const fallidos: Rechazado[] = [];
    for (const item of q) {
      try {
        await api.post('/checkin', {
          identifier: item.identifier,
          // Las de antes de que la cola llevara fecha no la traen: sin ella la
          // API las fecha hoy, que es exactamente lo que hacía antes.
          ...(item.fecha ? { fecha: item.fecha, marcadoEn: item.marcadoEn } : {}),
        });
      } catch (e) {
        const err = e as { response?: { data?: { error?: string } } };
        // Sin respuesta = sigue sin haber señal: se queda en la cola.
        if (!err.response) {
          rest.push(item);
          continue;
        }
        fallidos.push({
          valor: item.identifier.value,
          fecha: item.fecha ?? '',
          motivo: err.response.data?.error ?? t('comun.ninguno'),
        });
      }
    }
    localStorage.setItem(QKEY, JSON.stringify(rest));
    setPendientes(rest.length);
    if (fallidos.length) setRechazados((r) => [...fallidos, ...r]);
  }, [t]);

  // Al abrir la pantalla: cuántas quedaron esperando, y se intenta mandarlas.
  useEffect(() => {
    setPendientes((JSON.parse(localStorage.getItem(QKEY) || '[]') as Encolado[]).length);
    void flush();
  }, [flush]);

  async function checkin(identifier: { type: string; value: string }) {
    setResultado(null);
    try {
      const res = await api.post('/checkin', { identifier });
      setResultado({ ok: true, ...res.data });
      // «Avisar» es la mensualidad que se acaba o la última clase del paquete:
      // la marca entró, pero hay que hablar con el alumno.
      avisar(res.data?.accionSugerida === 'avisar' ? 'aviso' : 'ok');
      onMarcado();
      void flush();
    } catch (e) {
      const err = e as { response?: { data?: Resultado } };
      if (!err.response) {
        encolar(identifier);
        setResultado({ ok: false, error: t('kiosco.ayuda') });
        // Sin conexión no es un fallo del alumno: quedó guardado y se manda
        // solo cuando vuelva la señal. Por eso suena a aviso y no a error.
        avisar('aviso');
      } else {
        setResultado({ ...(err.response.data ?? {}), ok: false });
        // Bloqueado por mora, ya marcó hoy, PIN que no existe, día sin clase:
        // todo eso es «no pasa», y suena igual.
        avisar('error');
      }
    }
  }

  const color = resultado?.ok
    ? resultado.accionSugerida === 'avisar'
      ? 'var(--gold)'
      : 'var(--ok)'
    : 'var(--danger)';

  return (
    <>
      {escaneando && (
        <EscanerQR
          onDetectado={(valor) => {
            setEscaneando(false);
            // Un carnet QR lleva el id del alumno (un UUID); cualquier otra
            // cosa se intenta como PIN.
            void checkin({ type: UUID_RE.test(valor) ? 'qr' : 'pin', value: valor });
          }}
          onCerrar={() => setEscaneando(false)}
        />
      )}

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: '0.7rem',
          }}
        >
          <div className="card-title" style={{ margin: 0 }}>
            {t('asistencia.conCarnet')}
          </div>
          {/* Las marcas que se guardaron sin conexión y siguen esperando. */}
          {pendientes > 0 && (
            <span className="badge badge-gold">
              {pendientes} {t('kiosco.pendientes')}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-gold"
          onClick={() => setEscaneando(true)}
          style={{ width: '100%', fontSize: '1.05rem', padding: '0.9rem' }}
        >
          {t('kiosco.escanear')}
        </button>

        <label
          className="muted"
          style={{ fontSize: '0.8rem', display: 'block', marginTop: '1.1rem' }}
        >
          {t('kiosco.pin')}
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const valor = pin.trim();
            if (!valor) return;
            void checkin({ type: 'pin', value: valor });
            setPin('');
          }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}
        >
          {/* Solo dígitos: este cuadro es el respaldo del escáner y lo que se
              teclea aquí es el PIN. Un QR se lee con la cámara, no se
              transcribe a mano. */}
          <input
            value={pin}
            onChange={(e) => setPin(soloDigitos(e.target.value, LIM.checkinPin))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={LIM.checkinPin}
            className="mono"
            style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.15em' }}
          />
          <button className="btn btn-gold" type="submit">
            {t('asistencia.marcar')}
          </button>
        </form>

        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>
          {t('kiosco.ayuda')}
        </p>
      </div>

      {resultado && (
        <div
          className="card"
          style={{ padding: '1.25rem', marginBottom: '1.25rem', borderColor: color }}
        >
          {resultado.ok || resultado.bloqueado ? (
            <>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                {nombreDe(resultado.userId)}
              </div>
              <div className="display" style={{ fontSize: '1.8rem', color }}>
                {resultado.bloqueado ? t('kiosco.bloqueado') : t('kiosco.registrado')}
              </div>
              <div className="muted" style={{ marginTop: '0.3rem' }}>
                {resultado.estado === 'vencido'
                  ? (resultado.message ?? '')
                  : resultado.diasFaltantes != null
                    ? `${t('mi.diasFaltantes')}: ${resultado.diasFaltantes}`
                    : resultado.clasesRestantes != null
                      ? `${t('mi.clasesRestantes')}: ${resultado.clasesRestantes}`
                      : ''}
              </div>
            </>
          ) : (
            <div className="msg-error" style={{ fontWeight: 600 }}>
              {resultado.error ?? t('comun.ninguno')}
            </div>
          )}
        </div>
      )}

      {/* Lo que la cola no consiguió registrar. Se queda en pantalla hasta que
          el maestro lo descarte, porque lo que hay que hacer con ello
          —registrarlo a mano en la ficha del alumno— no lo puede hacer la
          aplicación sola. */}
      {rechazados.length > 0 && (
        <div
          className="card"
          style={{ padding: '1rem', marginBottom: '1.25rem', borderColor: 'var(--gold-dim)' }}
        >
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)' }}>
            ⚠ {t('kiosco.rechazados')}
          </p>
          <p className="muted" style={{ fontSize: '0.72rem', margin: '0.2rem 0 0.6rem' }}>
            {t('kiosco.rechazadosAyuda')}
          </p>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.45rem' }}>
            {rechazados.map((r, i) => (
              <li key={`${r.valor}-${r.fecha}-${i}`} style={{ fontSize: '0.8rem' }}>
                <strong>{nombreDe(r.valor)}</strong>
                {r.fecha && <span className="muted"> · {fmtFecha(r.fecha, idioma)}</span>}
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {r.motivo}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: '0.7rem' }}
            onClick={() => setRechazados([])}
          >
            {t('comun.cerrar')}
          </button>
        </div>
      )}
    </>
  );
}
