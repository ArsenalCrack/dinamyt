'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { hoyISO } from '@/lib/formato';

/** Lo que devuelve `GET /calendar`. Ver `routes/calendar.ts` de la API. */
interface Mes {
  mes: string;
  hoy: string;
  /** Días de la semana en que abre el club (0 = domingo). */
  abre: number[];
  cumpleanos: {
    fecha: string;
    userId: string;
    fullName: string;
    role: string;
    belt: string | null;
    cumple: number;
  }[];
  excepciones: { id: string; date: string; isClosed: boolean; note: string | null }[];
  vencimientos: {
    fecha: string;
    userId: string;
    fullName: string;
    estado: 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan';
  }[];
}

type Capa = 'cumple' | 'cierre' | 'vence';
const CAPAS: { id: Capa; icono: string; clave: ClaveTexto }[] = [
  { id: 'cumple', icono: '🎂', clave: 'calendario.capaCumple' },
  { id: 'cierre', icono: '⛔', clave: 'calendario.capaCierre' },
  { id: 'vence', icono: '💳', clave: 'calendario.capaVence' },
];

/** Una cosa que pasa un día, ya lista para pintarse en la casilla y en el detalle. */
interface Evento {
  capa: Capa;
  clave: string;
  /** Lo corto, para la casilla: el primer nombre. */
  corto: string;
  /** Lo largo, para el detalle del día. */
  largo: string;
  /** El dato de al lado: «12 años», «Vencido», el motivo del cierre. */
  dato?: string;
  /** Tono del dato, cuando lo tiene: el estado de la mensualidad. */
  tono?: 'ok' | 'gold' | 'danger';
  href?: string;
}

const GUARDADO = 'dinamyt.calendario.capas';

/** Las capas encendidas, como se dejaron. Si no se puede leer, todas. */
function capasGuardadas(): Record<Capa, boolean> {
  const todas = { cumple: true, cierre: true, vence: true };
  try {
    const crudo = localStorage.getItem(GUARDADO);
    return crudo ? { ...todas, ...(JSON.parse(crudo) as Partial<Record<Capa, boolean>>) } : todas;
  } catch {
    return todas;
  }
}

/** 'YYYY-MM' ± n meses, sin `Date` local: aquí solo se cuentan meses. */
function masMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const locale = (idioma: string) => (idioma === 'en' ? 'en-GB' : 'es-CO');
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El mes del club en una cuadrícula, como un calendario de pared.
 *
 * ── Tres capas que se encienden y se apagan ──
 *
 * Cumpleaños, cierres y festivos, y vencimientos de mensualidad. Van juntas
 * porque son las tres cosas por las que el maestro mira un calendario —¿quién
 * cumple, cuándo no abrimos, a quién le toca pagar?— y separadas porque no
 * siempre quiere las tres: quien solo busca los cumpleaños apaga las otras dos
 * y le queda exactamente ese calendario. Lo apagado se recuerda en el
 * navegador; es una preferencia de quien mira, no del club.
 *
 * ── La casilla resume, el detalle cuenta ──
 *
 * En el teléfono una casilla mide un dedo: ahí solo caben el número y un punto
 * por capa. Los nombres salen en pantallas anchas, y el detalle completo —con
 * enlace a cada ficha— debajo de la cuadrícula, al tocar el día.
 */
export function CalendarioMes() {
  const { t, idioma } = useI18n();
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));
  const [datos, setDatos] = useState<Mes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Se lee en el primer pintado sin miedo a que no coincida con el HTML del
  // servidor: este componente solo se monta con la sesión ya resuelta, que es
  // cosa del navegador (ver `/calendario`).
  const [capas, setCapas] = useState<Record<Capa, boolean>>(capasGuardadas);
  const [elegido, setElegido] = useState<string>(() => hoyISO());

  function alternarCapa(c: Capa) {
    setCapas((antes) => {
      const nuevas = { ...antes, [c]: !antes[c] };
      try {
        localStorage.setItem(GUARDADO, JSON.stringify(nuevas));
      } catch {
        /* sin almacenamiento, la elección dura lo que dure la pantalla */
      }
      return nuevas;
    });
  }

  // «Cargando» lo enciende quien cambia de mes (`irA`), no esto: así el primer
  // mes no repinta dos veces, y el mes anterior se queda a la vista —apagado—
  // mientras llega el siguiente, en vez de una cuadrícula vacía.
  const cargar = useCallback(
    async (deMes: string) => {
      try {
        const { data } = await api.get<Mes>('/calendar', { params: { mes: deMes } });
        setDatos(data);
        setError('');
      } catch (e) {
        setError(mensajeError(e, t('comun.ninguno')));
      } finally {
        setCargando(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void cargar(mes);
  }, [cargar, mes]);

  /** Cambiar de mes elige su primer día, o hoy si es el mes de hoy. */
  function irA(nuevo: string) {
    if (nuevo === mes) return;
    setCargando(true);
    setMes(nuevo);
    const hoy = hoyISO();
    setElegido(hoy.startsWith(nuevo) ? hoy : `${nuevo}-01`);
  }

  // ── Todo lo del mes, agrupado por día ─────────────────────────────────────
  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    if (!datos) return mapa;
    const poner = (fecha: string, e: Evento) => {
      const lista = mapa.get(fecha) ?? [];
      lista.push(e);
      mapa.set(fecha, lista);
    };
    for (const x of datos.excepciones) {
      const tipo = x.isClosed ? t('calendario.cerrado') : t('calendario.abierto');
      poner(x.date, {
        capa: 'cierre',
        clave: `x-${x.id}`,
        corto: tipo,
        // El motivo es lo que se lee —«campeonato departamental»—; el tipo va
        // al lado, en su insignia. Sin motivo, queda solo la insignia.
        largo: x.note ?? '',
        dato: tipo,
        tono: x.isClosed ? 'danger' : 'ok',
      });
    }
    for (const c of datos.cumpleanos) {
      poner(c.fecha, {
        capa: 'cumple',
        clave: `c-${c.userId}`,
        corto: c.fullName.split(' ')[0],
        largo: c.fullName,
        dato: `${t('aviso.cumpleHoy')} ${c.cumple} ${t('panel.cumpleAnos')}`,
        href: `/alumnos/${c.userId}`,
      });
    }
    for (const v of datos.vencimientos) {
      poner(v.fecha, {
        capa: 'vence',
        clave: `v-${v.userId}`,
        corto: v.fullName.split(' ')[0],
        largo: v.fullName,
        dato: t(`estado.${v.estado}` as ClaveTexto),
        tono: v.estado === 'vencido' ? 'danger' : v.estado === 'por_vencer' ? 'gold' : 'ok',
        // El mismo destino que el aviso de la campana: lo que sigue a «le toca
        // pagar» es cobrarle.
        href: `/alumnos/${v.userId}#cobrar`,
      });
    }
    return mapa;
  }, [datos, t]);

  const visibles = (fecha: string) => (porDia.get(fecha) ?? []).filter((e) => capas[e.capa]);

  const cuantos = useMemo(
    () => ({
      cumple: datos?.cumpleanos.length ?? 0,
      cierre: datos?.excepciones.length ?? 0,
      vence: datos?.vencimientos.length ?? 0,
    }),
    [datos],
  );

  // ── La cuadrícula: semanas de lunes a domingo ─────────────────────────────
  //
  // De lunes a domingo, como la semana de la nota de clase (`lunesDe`): el
  // fin de semana junto al final, que es donde el club suele cerrar.
  const ano = Number(mes.slice(0, 4));
  const numMes = Number(mes.slice(5, 7));
  const diasDelMes = new Date(Date.UTC(ano, numMes, 0)).getUTCDate();
  const primerDiaSemana = new Date(Date.UTC(ano, numMes - 1, 1)).getUTCDay(); // 0 = domingo
  const huecos = (primerDiaSemana + 6) % 7; // casillas vacías antes del día 1
  const casillas: (string | null)[] = [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from(
      { length: diasDelMes },
      (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (casillas.length % 7 !== 0) casillas.push(null);

  const cabecera = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale(idioma), { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-01 fue lunes.
    return Array.from({ length: 7 }, (_, i) =>
      mayuscula(fmt.format(new Date(Date.UTC(2024, 0, 1 + i)))).replace('.', ''),
    );
  }, [idioma]);

  const titulo = mayuscula(
    new Intl.DateTimeFormat(locale(idioma), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(ano, numMes - 1, 1))),
  );

  const hoy = hoyISO();
  const abre = new Set(datos?.abre ?? [0, 1, 2, 3, 4, 5, 6]);
  const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const cierre = (fecha: string) =>
    datos?.excepciones.find((x) => x.date === fecha && x.isClosed) != null;

  const detalle = elegido.startsWith(mes) ? visibles(elegido) : [];
  const fechaLarga = (fecha: string) =>
    mayuscula(
      new Intl.DateTimeFormat(locale(idioma), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${fecha}T12:00:00Z`)),
    );

  return (
    <section className="card calmes" aria-busy={cargando}>
      {/* ── El mes: flecha · nombre · flecha, y «Hoy» si no es este ── */}
      <div className="semana-nav calmes-nav">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={t('calendario.mesAnterior')}
          title={t('calendario.mesAnterior')}
          onClick={() => irA(masMeses(mes, -1))}
        >
          ‹
        </button>
        <div className="semana-nav-centro">
          <h2 className="calmes-titulo">{titulo}</h2>
          {mes !== hoy.slice(0, 7) && (
            <button
              type="button"
              className="btn btn-outline btn-sm calmes-hoy"
              onClick={() => irA(hoy.slice(0, 7))}
            >
              {t('calendario.hoy')}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={t('calendario.mesSiguiente')}
          title={t('calendario.mesSiguiente')}
          onClick={() => irA(masMeses(mes, 1))}
        >
          ›
        </button>
      </div>

      {/* ── Las capas ── */}
      <div className="filtros-chips calmes-capas" role="group" aria-label={t('calendario.capas')}>
        {CAPAS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="filtros-chip"
            data-activa={capas[c.id]}
            data-capa={c.id}
            aria-pressed={capas[c.id]}
            onClick={() => alternarCapa(c.id)}
          >
            <span aria-hidden="true">{c.icono}</span>
            {t(c.clave)}
            <span className="mono calmes-cuenta">{cuantos[c.id]}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="msg-error" style={{ margin: '0.75rem 0' }}>
          {error}
        </p>
      )}

      {/* ── La cuadrícula ──
          Botones sueltos y no `role="grid"`: una rejilla ARIA exige filas y
          navegación con flechas, y a medias es peor que nada. Cada botón lleva
          en su etiqueta la fecha entera y lo que pasa ese día. */}
      <div className="calmes-rejilla">
        {cabecera.map((d) => (
          <div key={d} className="calmes-semana microetiqueta" aria-hidden="true">
            {d}
          </div>
        ))}
        {casillas.map((fecha, i) => {
          if (!fecha) return <div key={`h-${i}`} className="calmes-hueco" aria-hidden="true" />;
          const eventos = visibles(fecha);
          const noAbre = !abre.has(diaSemana(fecha));
          const cerrado = capas.cierre && cierre(fecha);
          const enCasilla = eventos.filter((e) => e.capa !== 'cierre');
          return (
            <button
              key={fecha}
              type="button"
              className="calmes-dia"
              data-hoy={fecha === hoy}
              data-elegido={fecha === elegido}
              data-no-abre={noAbre}
              data-cerrado={cerrado}
              aria-pressed={fecha === elegido}
              aria-label={[
                fechaLarga(fecha),
                ...eventos.map((e) => `${e.largo || e.corto}${e.dato ? ` (${e.dato})` : ''}`),
              ].join(' · ')}
              onClick={() => setElegido(fecha)}
            >
              <span className="calmes-num mono">{Number(fecha.slice(8))}</span>
              {/* En el teléfono, un punto por capa con algo ese día. */}
              <span className="calmes-puntos" aria-hidden="true">
                {CAPAS.filter((c) => eventos.some((e) => e.capa === c.id)).map((c) => (
                  <span key={c.id} className="calmes-punto" data-capa={c.id} />
                ))}
              </span>
              {/* En pantalla ancha, los nombres: dos, y cuántos más. */}
              <span className="calmes-marcas">
                {cerrado && <span className="calmes-marca" data-capa="cierre">⛔</span>}
                {enCasilla.slice(0, 2).map((e) => (
                  <span key={e.clave} className="calmes-marca" data-capa={e.capa}>
                    {e.capa === 'cumple' ? '🎂' : '💳'} {e.corto}
                  </span>
                ))}
                {enCasilla.length > 2 && (
                  <span className="calmes-mas">+{enCasilla.length - 2}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── El día elegido ── */}
      {elegido.startsWith(mes) && (
        <div className="calmes-detalle" aria-live="polite">
          <h3 className="calmes-detalle-titulo">
            {fechaLarga(elegido)}
            {elegido === hoy && <span className="badge badge-gold">{t('calendario.hoy')}</span>}
          </h3>
          {detalle.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {abre.has(diaSemana(elegido))
                ? t('calendario.sinEventos')
                : t('calendario.clubNoAbre')}
            </p>
          ) : (
            <ul className="calmes-lista">
              {detalle.map((e) => {
                const icono = CAPAS.find((c) => c.id === e.capa)!.icono;
                const contenido = (
                  <>
                    <span aria-hidden="true">{icono}</span>
                    {e.largo && <span className="calmes-lista-nombre">{e.largo}</span>}
                    {e.dato &&
                      (e.tono ? (
                        <span className={`badge badge-${e.tono}`}>{e.dato}</span>
                      ) : (
                        <span className="muted calmes-lista-dato">{e.dato}</span>
                      ))}
                  </>
                );
                return (
                  <li key={e.clave}>
                    {e.href ? (
                      <Link href={e.href} className="calmes-lista-fila" data-enlace="true">
                        {contenido}
                      </Link>
                    ) : (
                      <div className="calmes-lista-fila">{contenido}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
