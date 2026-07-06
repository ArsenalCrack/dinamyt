'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  obtenerToken,
  getCampeonatoAPI,
  cambiarEstadoAPI,
  siguienteEstadoUI,
  extraerError,
  type CampeonatoDetalle,
  type EstadoCampeonato,
} from '@/lib/api';
import { getSesion, esAdmin, puedeInscribir } from '@/lib/session';

/** Qué significa cada estado del ciclo de vida (guía para el admin). */
const GUIA_ESTADO: Record<EstadoCampeonato, string> = {
  BORRADOR: 'Configura el evento, inscribe e invita. El público aún no lo ve.',
  LISTO: 'Publicado: el público ya lo ve. Últimas inscripciones y llaves.',
  EN_CURSO: 'Evento en vivo: dirige desde Tatamis. La configuración quedó congelada.',
  FINALIZADO: 'Terminado: los resultados quedan públicos y el historial es inmutable.',
};

function badgeEstado(e: EstadoCampeonato): string {
  return e === 'EN_CURSO'
    ? 'badge badge-live'
    : e === 'LISTO'
      ? 'badge badge-info'
      : e === 'FINALIZADO'
        ? 'badge badge-ok'
        : 'badge';
}

/**
 * HUB del campeonato: un solo lugar con el flujo completo en tarjetas
 * numeradas (configurar → inscribir → categorías/llaves → evento en vivo),
 * para que el admin avance en orden sin perderse entre rutas.
 */
export default function HubCampeonatoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [camp, setCamp] = useState<CampeonatoDetalle | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(() => {
    getCampeonatoAPI(campId)
      .then(setCamp)
      .catch((e) => setMsg(extraerError(e, 'No se pudo cargar el campeonato.')));
  }, [campId]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    const s = getSesion();
    if (!puedeInscribir(s)) {
      router.replace('/perfil');
      return;
    }
    // El maestro no gestiona: va directo a inscribir/invitar.
    if (!esAdmin(s)) {
      router.replace(`/admin/${campId}/inscribir`);
      return;
    }
    cargar();
  }, [router, campId, cargar]);

  // Descarga el reporte Excel (inscripciones + secciones + podios).
  async function descargarReporte() {
    setMsg(null);
    setDescargando(true);
    try {
      const res = await api.get(`/campeonatos/${campId}/reporte`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${(camp?.nombre ?? 'campeonato').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(extraerError(e, 'No se pudo generar el reporte.'));
    } finally {
      setDescargando(false);
    }
  }

  async function avanzar() {
    if (!camp) return;
    const sig = siguienteEstadoUI(camp.estado);
    if (!sig) return;
    setMsg(null);
    setOcupado(true);
    try {
      await cambiarEstadoAPI(campId, sig);
      cargar();
    } catch (e) {
      setMsg(extraerError(e, 'No se pudo cambiar el estado.'));
    } finally {
      setOcupado(false);
    }
  }

  if (!camp) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
        <p style={{ color: 'var(--text-muted)' }}>{msg ?? 'Cargando…'}</p>
      </main>
    );
  }

  const congelado = camp.estado === 'EN_CURSO' || camp.estado === 'FINALIZADO';
  const sig = siguienteEstadoUI(camp.estado);

  const pasos = [
    {
      n: 1,
      titulo: 'Configuración',
      desc: 'Datos del evento, fechas, tatamis y modalidades habilitadas.',
      href: `/admin/${campId}/editar`,
      accion: 'Editar',
      deshabilitado: congelado,
      nota: congelado ? 'Congelada: el evento ya arrancó.' : null,
    },
    {
      n: 2,
      titulo: 'Inscripciones',
      desc: 'Inscribe directo, invita por correo y aprueba o rechaza lo enviado.',
      href: `/admin/${campId}/inscribir`,
      accion: 'Inscribir / Invitar',
      extra: { href: `/admin/${campId}/inscripciones`, etiqueta: 'Revisar' },
      // Con el evento EN VIVO, el admin sigue pudiendo añadir/invitar (es la
      // única vía de entrada); recién FINALIZADO se cierra del todo.
      deshabilitado: camp.estado === 'FINALIZADO',
      nota:
        camp.estado === 'EN_CURSO'
          ? 'En vivo: solo tú puedes añadir o invitar competidores.'
          : camp.estado === 'FINALIZADO'
            ? 'Cerradas: el evento terminó.'
            : null,
    },
    {
      n: 3,
      titulo: 'Categorías y llaves',
      desc: 'Define cinturones, edades y pesos; genera las secciones y sus llaves.',
      href: `/admin/${campId}/secciones`,
      accion: 'Abrir',
      deshabilitado: false,
      nota: congelado ? 'Solo lectura durante el evento.' : null,
    },
    {
      n: 4,
      titulo: 'Tatamis · evento en vivo',
      desc: 'Colas por tatami, jueces asignados, robo de secciones y mesa central.',
      href: `/admin/${campId}/tatamis`,
      accion: 'Dirigir',
      deshabilitado: false,
      nota: null,
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Campeonatos
      </Link>

      {/* Cabecera del campeonato */}
      <header className="card mt-2 mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold" style={{ color: 'var(--gold)' }}>
              {camp.nombre}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {GUIA_ESTADO[camp.estado]}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={badgeEstado(camp.estado)}>
              {camp.estado === 'EN_CURSO' ? '● EN CURSO' : camp.estado}
            </span>
            {sig && (
              <button
                onClick={avanzar}
                disabled={ocupado}
                className="btn btn-gold btn-sm"
                title={`Avanzar el campeonato a ${sig}`}
              >
                Pasar a {sig} →
              </button>
            )}
            <button
              onClick={descargarReporte}
              disabled={descargando}
              className="btn btn-outline btn-sm"
              title="Inscripciones, secciones y podios en Excel"
            >
              {descargando ? 'Generando…' : '⬇ Reporte Excel'}
            </button>
          </div>
        </div>
        {msg && <p className="msg-error mt-2 text-sm">{msg}</p>}
      </header>

      {/* Flujo en tarjetas numeradas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {pasos.map((p) => (
          <article
            key={p.n}
            className="card flex flex-col p-5"
            style={p.deshabilitado ? { opacity: 0.65 } : undefined}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-extrabold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
              >
                {p.n}
              </span>
              <div className="min-w-0">
                <h2 className="font-bold">{p.titulo}</h2>
                <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {p.desc}
                </p>
              </div>
            </div>
            {p.nota && (
              <p className="mt-2 text-xs" style={{ color: 'var(--gold)' }}>
                🔒 {p.nota}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {p.deshabilitado ? (
                <span className="btn btn-outline btn-sm" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  {p.accion}
                </span>
              ) : (
                <Link href={p.href} className="btn btn-gold btn-sm">
                  {p.accion} →
                </Link>
              )}
              {p.extra && !p.deshabilitado && (
                <Link href={p.extra.href} className="btn btn-outline btn-sm">
                  {p.extra.etiqueta} →
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Vista del público */}
      <Link
        href={`/pantalla/${campId}`}
        className="card mt-4 block p-4 text-center text-sm font-semibold"
        style={{ color: 'var(--gold)' }}
      >
        📺 Ver como lo ve el público (información, tatamis y resultados) →
      </Link>
    </main>
  );
}
