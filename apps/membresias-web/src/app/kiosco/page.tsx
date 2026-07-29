'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LIM, soloDigitos } from '@/lib/campos';
import { EscanerQR } from '@/components/EscanerQR';
import { ControlesApariencia } from '@/components/ControlesApariencia';

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
  ts: number;
}

/**
 * Kiosco de check-in: pantalla completa, sin barra de navegación, pensada para
 * el celular del maestro en la puerta del salón.
 */
export default function Kiosco() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [filtro, setFiltro] = useState('');
  const [pin, setPin] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [escaneando, setEscaneando] = useState(false);

  function encolar(identifier: { type: string; value: string }) {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    q.push({ identifier, ts: Date.now() });
    localStorage.setItem(QKEY, JSON.stringify(q));
    setPendientes(q.length);
  }

  // Reintenta los check-ins guardados sin conexión. Los que el servidor
  // rechaza se descartan: reintentarlos daría el mismo error para siempre.
  const flush = useCallback(async () => {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    if (!q.length) return;
    const rest: Encolado[] = [];
    for (const item of q) {
      try {
        await api.post('/checkin', { identifier: item.identifier });
      } catch (e) {
        const err = e as { response?: unknown };
        if (!err.response) rest.push(item);
      }
    }
    localStorage.setItem(QKEY, JSON.stringify(rest));
    setPendientes(rest.length);
  }, []);

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

  async function checkin(identifier: { type: string; value: string }) {
    setResultado(null);
    try {
      const res = await api.post('/checkin', { identifier });
      setResultado({ ok: true, ...res.data });
      void flush();
    } catch (e) {
      const err = e as { response?: { data?: Resultado } };
      if (!err.response) {
        encolar(identifier);
        setResultado({ ok: false, error: t('kiosco.ayuda') });
      } else {
        setResultado({ ...(err.response.data ?? {}), ok: false });
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
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem', minHeight: '100vh' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {pendientes > 0 && <span className="badge badge-gold">{pendientes}</span>}
          <Link href="/" className="btn btn-outline btn-sm">
            {t('menu.panel')}
          </Link>
        </div>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(min(140px, 100%), 1fr))',
              gap: '0.5rem',
              paddingBottom: '0.75rem',
            }}
          >
            {enPantalla.map((a) => (
              <button
                key={a.userId}
                className="btn btn-outline"
                onClick={() => checkin({ type: 'manual', value: a.userId })}
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

      {/* El kiosco no lleva NavBar: el tema y el idioma van aquí. */}
      <ControlesApariencia />
    </main>
  );
}
