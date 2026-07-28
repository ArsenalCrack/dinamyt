'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { fmtFecha, fmtMoneda } from '@/lib/formato';
import { cinturonPorNombre, fondoCinturon } from '@/lib/cinturones';

interface Estadisticas {
  mes: string;
  alumnos: {
    total: number;
    activos: number;
    inactivos: number;
    nuevosEsteMes: number;
    al_dia: number;
    por_vencer: number;
    vencido: number;
    sin_plan: number;
  };
  dinero: {
    /** Lo que ENTRÓ en el mes. */
    recaudadoMes: number;
    /** Lo que le CORRESPONDE al mes, repartiendo los pagos adelantados. */
    devengadoMes: number;
    pagosMes: number;
    esperadoMensual: number;
    porMes: { month: string; total: number; devengado: number; pagos: number }[];
  };
  asistencia: {
    hoy: number;
    total30: number;
    diasConClase: number;
    promedioPorDia: number;
    porDia: { date: string; count: number }[];
    masConstantes: { userId: string; fullName: string; asistencias: number }[];
  };
  planes: { planId: string; name: string; type: string; price: string; alumnos: number }[];
  cinturones: { belt: string; alumnos: number }[];
}

/** 'YYYY-MM' → «jul» en el idioma activo. */
function nombreMes(mes: string, idioma: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(
    idioma === 'en' ? 'en-GB' : 'es-CO',
    { month: 'short', timeZone: 'UTC' },
  );
}

/** Una tarjeta de número grande: el titular de un dato. */
function Dato({
  etiqueta,
  valor,
  pie,
  color,
}: {
  etiqueta: string;
  valor: string | number;
  pie?: string;
  color?: string;
}) {
  return (
    <div className="card" style={{ padding: '0.9rem' }}>
      <div className="muted" style={{ fontSize: '0.72rem' }}>
        {etiqueta}
      </div>
      <div
        className="mono"
        style={{ fontSize: '1.5rem', fontWeight: 700, color: color ?? 'var(--text)' }}
      >
        {valor}
      </div>
      {pie && (
        <div className="muted" style={{ fontSize: '0.7rem' }}>
          {pie}
        </div>
      )}
    </div>
  );
}

/**
 * Barra horizontal con su etiqueta. Se usa para todo lo que es «cuántos de
 * cada»: estados, planes y cinturones. Sin librería de gráficas: son tres
 * divs, y una dependencia entera para esto pesaría más que la página.
 */
function Barra({
  etiqueta,
  valor,
  maximo,
  color,
  punto,
  sufijo,
}: {
  etiqueta: string;
  valor: number;
  maximo: number;
  color?: string;
  punto?: string;
  sufijo?: string;
}) {
  const ancho = maximo > 0 ? Math.max((valor / maximo) * 100, valor > 0 ? 4 : 0) : 0;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          fontSize: '0.8rem',
          marginBottom: '0.25rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
          {punto && (
            <span
              aria-hidden="true"
              style={{
                width: '0.8rem',
                height: '0.8rem',
                borderRadius: 999,
                background: punto,
                border: '1px solid var(--border-strong)',
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {etiqueta}
          </span>
        </span>
        <span className="mono" style={{ flexShrink: 0 }}>
          {valor}
          {sufijo ? ` ${sufijo}` : ''}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${ancho}%`,
            height: '100%',
            borderRadius: 999,
            background: color ?? 'var(--gold)',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Estadísticas del club.
 *
 * El maestro tenía tres números sueltos en el panel y nada más: ni de dónde
 * venía el dinero, ni si su gente viene a clase, ni cómo se reparten los
 * planes. Esto es esa foto, en una sola pantalla y con una sola llamada a la
 * API (`GET /reports/estadisticas`).
 */
export default function EstadisticasPage() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [s, setS] = useState<Estadisticas | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Estadisticas>('/reports/estadisticas');
      setS(data);
    } catch (e) {
      setError(mensajeError(e, t('stats.sinDatos')));
    }
  }, [t]);

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
  }, [cargandoSesion, user, esStaff, router, cargar]);

  if (cargandoSesion || (!s && !error)) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {t('comun.cargando')}
      </main>
    );
  }
  if (!s) {
    return (
      <main style={{ padding: '2rem' }} className="msg-error">
        {error}
      </main>
    );
  }

  const maxMes = Math.max(
    ...s.dinero.porMes.map((m) => Math.max(m.total, m.devengado)),
    1,
  );
  const maxDia = Math.max(...s.asistencia.porDia.map((d) => d.count), 1);
  const maxPlan = Math.max(...s.planes.map((p) => p.alumnos), 1);
  const maxCinturon = Math.max(...s.cinturones.map((c) => c.alumnos), 1);
  const maxEstado = Math.max(s.alumnos.activos, 1);
  // El porcentaje se calcula con lo DEVENGADO, no con la caja: si no, un
  // alumno que paga tres meses de golpe hace que julio marque 300 %.
  const cumplimiento =
    s.dinero.esperadoMensual > 0
      ? Math.round((s.dinero.devengadoMes / s.dinero.esperadoMensual) * 100)
      : null;

  const estados: { clave: ClaveTexto; valor: number; color: string }[] = [
    { clave: 'estado.al_dia', valor: s.alumnos.al_dia, color: 'var(--ok)' },
    { clave: 'estado.por_vencer', valor: s.alumnos.por_vencer, color: 'var(--gold)' },
    { clave: 'estado.vencido', valor: s.alumnos.vencido, color: 'var(--danger)' },
    { clave: 'estado.sin_plan', valor: s.alumnos.sin_plan, color: 'var(--text-muted)' },
  ];

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h1 className="display" style={{ fontSize: '1.5rem' }}>
            {t('stats.titulo')}
          </h1>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {t('stats.subtitulo')}
          </p>
        </div>
        <Link href="/" className="btn btn-outline btn-sm">
          {t('menu.panel')}
        </Link>
      </header>

      {/* ── Los cuatro números que se miran primero ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        <Dato
          etiqueta={t('stats.alumnos')}
          valor={s.alumnos.activos}
          pie={`+${s.alumnos.nuevosEsteMes} · ${t('stats.nuevosMes')}`}
        />
        <Dato
          etiqueta={t('stats.recaudoMes')}
          valor={fmtMoneda(s.dinero.recaudadoMes)}
          pie={
            cumplimiento != null
              ? `${fmtMoneda(s.dinero.devengadoMes)} ${t('stats.devengadoMes').toLowerCase()} · ${cumplimiento}% ${t('stats.esperado')}`
              : `${s.dinero.pagosMes} ${t('stats.pagosMes')}`
          }
          color="var(--gold)"
        />
        <Dato
          etiqueta={t('asistencia.presentes')}
          valor={s.asistencia.hoy}
          pie={`${s.asistencia.promedioPorDia} · ${t('stats.promedioPorDia')}`}
          color="var(--ok)"
        />
        <Dato
          etiqueta={t('panel.vencidos')}
          valor={s.alumnos.vencido}
          pie={`${s.alumnos.inactivos} · ${t('stats.inactivos')}`}
          color={s.alumnos.vencido > 0 ? 'var(--danger)' : undefined}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: '1rem',
        }}
      >
        {/* ── Recaudo de los últimos seis meses ── */}
        {/* Dos barras por mes: lo que entró (caja) y lo que le corresponde al
            mes (devengado). Cuando alguien paga varios meses de golpe, la
            primera se dispara y la segunda se reparte hacia adelante. */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            {t('stats.recaudo6')}
          </h2>
          <div
            style={{
              display: 'flex',
              gap: '0.9rem',
              fontSize: '0.68rem',
              marginBottom: '0.7rem',
            }}
            className="muted"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--gold)' }}
              />
              {t('stats.caja')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accion)' }}
              />
              {t('stats.devengado')}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '0.5rem',
              height: 150,
            }}
          >
            {s.dinero.porMes.map((m) => (
              <div
                key={m.month}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.3rem',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
                title={`${m.month} · ${t('stats.caja')}: ${fmtMoneda(m.total)} · ${t('stats.devengado')}: ${fmtMoneda(m.devengado)}`}
              >
                <span className="mono muted" style={{ fontSize: '0.62rem' }}>
                  {m.total > 0 ? Math.round(m.total / 1000) + 'k' : ''}
                </span>
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 2,
                    height: '100%',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: `${Math.max((m.total / maxMes) * 100, m.total > 0 ? 3 : 1)}%`,
                      borderRadius: '0.3rem 0.3rem 0 0',
                      background: 'var(--gold)',
                      opacity: m.month === s.mes ? 1 : 0.7,
                      minHeight: 2,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      height: `${Math.max((m.devengado / maxMes) * 100, m.devengado > 0 ? 3 : 1)}%`,
                      borderRadius: '0.3rem 0.3rem 0 0',
                      background: 'var(--accion)',
                      opacity: m.month === s.mes ? 1 : 0.7,
                      minHeight: 2,
                    }}
                  />
                </div>
                <span className="muted" style={{ fontSize: '0.65rem' }}>
                  {nombreMes(m.month, idioma)}
                </span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.68rem', marginTop: '0.6rem' }}>
            {t('stats.adelantos')}
          </p>
        </section>

        {/* ── Estado de las mensualidades ── */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.9rem' }}>
            {t('stats.estados')}
          </h2>
          {estados.map((e) => (
            <Barra
              key={e.clave}
              etiqueta={t(e.clave)}
              valor={e.valor}
              maximo={maxEstado}
              color={e.color}
            />
          ))}
        </section>

        {/* ── Asistencia de los últimos 30 días ── */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.3rem' }}>
            {t('stats.asistencia30')}
          </h2>
          <p className="muted" style={{ fontSize: '0.72rem', marginBottom: '0.9rem' }}>
            {s.asistencia.total30} {t('stats.asistenciasCuenta')} · {s.asistencia.diasConClase}{' '}
            {t('stats.diasConClase')}
          </p>
          {s.asistencia.porDia.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('stats.sinDatos')}
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
              {s.asistencia.porDia.map((d) => (
                <div
                  key={d.date}
                  title={`${fmtFecha(d.date, idioma)}: ${d.count}`}
                  style={{
                    flex: 1,
                    minWidth: 3,
                    height: `${Math.max((d.count / maxDia) * 100, 4)}%`,
                    borderRadius: '0.2rem 0.2rem 0 0',
                    background: 'var(--ok)',
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Los más constantes ── */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.9rem' }}>
            {t('stats.masConstantes')}
          </h2>
          {s.asistencia.masConstantes.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('stats.sinDatos')}
            </p>
          ) : (
            s.asistencia.masConstantes.map((a) => (
              <Barra
                key={a.userId}
                etiqueta={a.fullName}
                valor={a.asistencias}
                maximo={s.asistencia.masConstantes[0].asistencias}
                color="var(--info)"
              />
            ))
          )}
        </section>

        {/* ── Alumnos por plan ── */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.9rem' }}>
            {t('stats.porPlan')}
          </h2>
          {s.planes.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('planes.sinPlanes')}
            </p>
          ) : (
            s.planes.map((p) => (
              <Barra
                key={p.planId}
                etiqueta={`${p.name} · ${fmtMoneda(p.price)}`}
                valor={p.alumnos}
                maximo={maxPlan}
              />
            ))
          )}
        </section>

        {/* ── Alumnos por cinturón ── */}
        <section className="card" style={{ padding: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.9rem' }}>
            {t('stats.porCinturon')}
          </h2>
          {s.cinturones.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('stats.sinDatos')}
            </p>
          ) : (
            s.cinturones.map((c) => {
              const cat = cinturonPorNombre(c.belt);
              return (
                <Barra
                  key={c.belt}
                  etiqueta={c.belt}
                  valor={c.alumnos}
                  maximo={maxCinturon}
                  punto={cat ? fondoCinturon(cat) : undefined}
                  color={cat?.color}
                />
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
