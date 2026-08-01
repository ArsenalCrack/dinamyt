'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { LIM, soloDigitos } from '@/lib/campos';
import { avisar } from '@/lib/sonido';
import { EscanerQR } from '@/components/EscanerQR';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RosterItem {
  userId: string;
  fullName: string;
  estado: string;
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
 * A partir de cuántos alumnos la parrilla manual deja de ser una lista y pasa a
 * ser un muro. Por encima aparece el buscador y solo se dibujan los primeros
 * que coincidan: el resto está a dos letras de distancia.
 */
const TOPE_BOTONES = 40;

const QKEY = 'membresias_checkin_queue';
interface Encolado {
  identifier: { type: string; value: string };
  /**
   * El día en que se marcó DE VERDAD, en hora local del celular.
   *
   * Antes aquí solo había un `ts` que se guardaba y no se mandaba nunca: la
   * marca del sábado en el salón sin señal llegaba al servidor el lunes y
   * quedaba fechada el lunes. Ahora viaja, y la API la acepta solo hacia atrás
   * y dentro de una ventana corta (ver `routes/checkin.ts`).
   */
  fecha: string;
  /** El instante exacto, para la hora que enseña la lista del día. */
  marcadoEn: string;
  ts: number;
}

/**
 * Una marca de la cola que el servidor rechazó, con su motivo.
 *
 * Guarda el identificador y no el nombre: el nombre se resuelve al pintar, con
 * el roster que haya en ese momento. Guardándolo aquí saldría el UUID crudo
 * cuando la cola se vacía antes de que el roster termine de descargarse.
 */
interface Rechazado {
  valor: string;
  fecha: string;
  motivo: string;
}

/**
 * Kiosco de check-in: pensado para el celular del maestro en la puerta del
 * salón, con los botones grandes y todo a un toque.
 *
 * Lleva la barra de navegación de siempre, como el resto de la app. Antes no:
 * era una pantalla «completa», y por eso tenía que traerse aquí dentro un
 * enlace de vuelta al panel y su propia esquina de tema e idioma — dos copias
 * de algo que ya existe arriba, y aun así sin manera de saltar a «Alumnos» sin
 * pasar por el panel.
 */
export default function Kiosco() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [filtro, setFiltro] = useState('');
  const [pin, setPin] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [escaneando, setEscaneando] = useState(false);
  /** Marcas de la cola que el servidor no aceptó. Ver `flush`. */
  const [rechazados, setRechazados] = useState<Rechazado[]>([]);

  function encolar(identifier: { type: string; value: string }) {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    const ahora = new Date();
    q.push({
      identifier,
      // La fecha se congela AQUÍ, con el reloj del celular que está en la
      // puerta: es el único que sabe qué día entró el alumno.
      fecha: hoyISO(),
      marcadoEn: ahora.toISOString(),
      ts: ahora.getTime(),
    });
    localStorage.setItem(QKEY, JSON.stringify(q));
    setPendientes(q.length);
  }

  /**
   * Reintenta los check-ins guardados sin conexión, cada uno con SU fecha.
   *
   * Lo que el servidor rechaza sale de la cola —reintentarlo daría el mismo
   * error para siempre— pero ya no desaparece sin más: antes se descartaba en
   * silencio y una asistencia real se perdía sin que nadie se enterara. Ahora
   * queda en pantalla con el motivo, para poder registrarla a mano desde la
   * ficha del alumno.
   */
  const flush = useCallback(async () => {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    if (!q.length) return;
    const rest: Encolado[] = [];
    const fallidos: Rechazado[] = [];
    for (const item of q) {
      try {
        await api.post('/checkin', {
          identifier: item.identifier,
          // Las de antes de este cambio no llevan fecha: sin ella la API las
          // fecha hoy, que es exactamente lo que hacía antes.
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

  /**
   * El roster del kiosco NO se pagina, y es la excepción a propósito.
   *
   * En la puerta del salón no hay tiempo de pasar páginas: el alumno que se
   * dejó el carnet en casa y no se sabe el PIN tiene que estar en esta
   * pantalla, sea el primero de la lista o el número doscientos. Así que se
   * pide entero (la API deja hasta 500 sin `limit`) y el filtrado se hace aquí
   * mismo, sobre lo que ya está descargado — que además es lo que permite
   * seguir marcando gente cuando se cae la conexión, igual que la cola de
   * check-ins de arriba.
   */
  const cargar = useCallback(async () => {
    try {
      const r = await api.get<{ items: RosterItem[] }>('/memberships');
      setRoster(r.data.items);
    } catch {
      /* el kiosco puede operar sin roster (solo QR/PIN) */
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar();
    setPendientes((JSON.parse(localStorage.getItem(QKEY) || '[]') as Encolado[]).length);
    void flush();
  }, [cargandoSesion, user, esStaff, router, cargar, flush]);

  /**
   * Marca la asistencia y AVISA POR EL ALTAVOZ.
   *
   * El maestro está en la puerta con la fila delante y el celular en la mano:
   * no está mirando la pantalla cuando el alumno pasa el carnet. El pitido dice
   * las tres cosas que hay que saber sin bajar la vista —entró, entró pero hay
   * algo que decirle, o no entró—; la tarjeta de abajo cuenta el detalle para
   * cuando sí se mire. Ver `lib/sonido.ts`.
   */
  async function checkin(identifier: { type: string; value: string }) {
    setResultado(null);
    try {
      const res = await api.post('/checkin', { identifier });
      setResultado({ ok: true, ...res.data });
      // «Avisar» es la mensualidad que se acaba o la última clase del paquete:
      // la marca entró, pero hay que hablar con el alumno.
      avisar(res.data?.accionSugerida === 'avisar' ? 'aviso' : 'ok');
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

  function nombreDe(id?: string) {
    return roster.find((r) => r.userId === id)?.fullName ?? id ?? '';
  }

  const q = filtro.trim().toLowerCase();
  const coincidencias = q
    ? roster.filter((a) => a.fullName.toLowerCase().includes(q))
    : roster;
  const enPantalla = coincidencias.slice(0, TOPE_BOTONES);

  const color = resultado?.bloqueado
    ? 'var(--danger)'
    : resultado?.ok
      ? resultado.accionSugerida === 'avisar'
        ? 'var(--gold)'
        : 'var(--ok)'
      : 'var(--danger)';

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem' }}>
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

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('kiosco.titulo')}
        </h1>
        {/* Los check-ins que se guardaron sin conexión y siguen esperando. El
            enlace de vuelta al panel se fue con la llegada de la barra: allí
            está, y además lleva a cualquier otra pantalla. */}
        {pendientes > 0 && (
          <span className="badge badge-gold">
            {pendientes} {t('kiosco.pendientes')}
          </span>
        )}
      </header>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-cta"
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
          {/* Solo dígitos y los que caben en la columna: este cuadro es el
              respaldo del escáner y lo que se teclea aquí es el PIN. Un QR se
              lee con la cámara, no se transcribe a mano. */}
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

      {/* ── Lo que la cola no consiguió registrar ──
          Antes esto no existía: la marca rechazada se borraba en silencio y una
          asistencia real se perdía sin que nadie lo supiera. Se queda en
          pantalla hasta que el maestro la descarte, porque lo que hay que hacer
          con ella —registrarla a mano en la ficha del alumno— no lo puede hacer
          la aplicación sola. */}
      {rechazados.length > 0 && (
        <div
          className="card"
          style={{
            padding: '1rem',
            marginBottom: '1.25rem',
            borderColor: 'var(--gold-dim)',
          }}
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

      {roster.length > 0 && (
        <div className="card" style={{ padding: '0.5rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem', padding: '0.5rem 0' }}>
            {t('kiosco.manual')}
          </div>
          {/* Con veinte alumnos la parrilla de botones se lee de un vistazo;
              con doscientos es un muro por el que hay que bajar con el dedo
              mientras alguien espera en la puerta. El buscador filtra lo que
              ya está descargado —el roster viene entero, ver `cargar`—, así
              que sigue funcionando sin conexión. */}
          {roster.length > TOPE_BOTONES && (
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              maxLength={LIM.busqueda}
              placeholder={t('pag.buscarAlumno')}
              aria-label={t('pag.buscarAlumno')}
              style={{ marginBottom: '0.6rem' }}
            />
          )}
          {/* La parrilla y sus botones tienen clase propia porque `.btn` lleva
              `white-space: nowrap`: un nombre de cuatro palabras se salía del
              rectángulo y pisaba al de al lado. Aquí el nombre se parte en
              varias líneas y todos los botones quedan igual de altos. */}
          <div className="kiosco-parrilla">
            {enPantalla.map((a) => (
              <button
                key={a.userId}
                className="btn btn-outline kiosco-alumno"
                onClick={() => checkin({ type: 'manual', value: a.userId })}
                title={a.fullName}
              >
                {a.fullName}
              </button>
            ))}
          </div>
          {enPantalla.length === 0 && (
            <p className="muted" style={{ fontSize: '0.78rem', paddingBottom: '0.75rem' }}>
              {t('pag.sinResultados')}
            </p>
          )}
          {coincidencias.length > enPantalla.length && (
            <p className="muted" style={{ fontSize: '0.72rem', paddingBottom: '0.75rem' }}>
              {enPantalla.length} {t('pag.de')} {coincidencias.length} · {t('kiosco.afina')}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
