// Motor de combate en vivo — port fiel de DINAMYT-COMBAT
// (backend/app/engine/combate_engine.py → aplicarEvento). Modelo de 4 réferis de
// esquina (j1-j4) + juez central (árbitro), con KyongGo/GamJeum, descalificación
// automática, alerta de superioridad técnica, punto de oro, cronómetro y reset.
//
// Reductor PURO: clona el estado y aplica el evento. El servidor
// `campeonatos-combat` mantiene este estado por sala y lo reenvía.

export const ALERTA_SUPERIORIDAD_DIFERENCIA = 12;
export const MAX_KYONGGO_DQ = 6;
export const MAX_GAMJEUM_DQ = 3;

export type Color = 'hong' | 'chung';

export interface JuezPuntos {
  hong: number;
  chung: number;
}

export interface EntradaHistorial {
  juez: string;
  color: Color;
  pts: number;
  nombre: string;
  esEspecial?: boolean;
  esKyongGo?: boolean;
  esGamJeum?: boolean;
  esDecision?: boolean;
  tiempo: number;
  ronda: string;
  momento: string;
}

export interface Alerta12 {
  hong: string;
  chung: string;
  lider: string;
  diferencia: string;
  motivo: string;
}

export interface EstadoCombate {
  nombreHong: string;
  nombreChung: string;
  jueces: Record<string, JuezPuntos>;
  nombresJueces: Record<string, string>;
  numJueces: number;
  arbHong: number;
  arbChung: number;
  historial: EntradaHistorial[];
  kyongHong: number;
  kyongChung: number;
  faltasHong: number;
  faltasChung: number;
  segundos: number;
  segundosMax: number;
  activo: boolean;
  log: { txt: string; color: string; ts: number }[];
  alerta12Lanzada: boolean;
  alerta12Data: Alerta12 | null;
  ronda: string;
  oroResuelto: boolean;
  oroPendienteAprobacion: boolean;
  oroGanadorNombre: string;
  oroGanadorColor: string;
  oroPuntoPendiente: EntradaHistorial | null;
  oroPuntoDetalle: string;
  ganadorManualColor: string;
  ganadorManualMotivo: string;
  ganadorPendienteCierre: boolean;
  ganadorPendienteNombre: string;
  ganadorPendienteColor: string;
  ganadorPendienteMotivo: string;
}

/** Evento delta. `accion` discrimina; el resto de campos dependen de la acción. */
export interface EventoCombate {
  accion: string;
  [clave: string]: unknown;
}

const ACCIONES_MARCADOR = new Set([
  'punto_juez',
  'deshacer_juez',
  'especial',
  'deshacer_arbitro',
  'kyonggo',
  'gamjeum',
  'set_num_jueces',
]);

const ACCIONES_BLOQUEADAS_DURANTE_ALERTA = new Set([
  'punto_juez',
  'deshacer_juez',
  'especial',
  'deshacer_arbitro',
  'kyonggo',
  'gamjeum',
  'crono_start',
  'ronda',
  'set_num_jueces',
  'nombres',
]);

const ACCIONES_BLOQUEADAS_TRAS_GANADOR = new Set([
  'punto_juez',
  'deshacer_juez',
  'especial',
  'deshacer_arbitro',
  'kyonggo',
  'gamjeum',
  'crono_start',
  'ronda',
  'declarar_ganador',
  'descalificar',
  'set_num_jueces',
  'nombres',
]);

export function estadoInicialCombate(): EstadoCombate {
  return {
    nombreHong: 'Hong',
    nombreChung: 'Chung',
    jueces: {
      j1: { hong: 0, chung: 0 },
      j2: { hong: 0, chung: 0 },
      j3: { hong: 0, chung: 0 },
      j4: { hong: 0, chung: 0 },
    },
    nombresJueces: { j1: '', j2: '', j3: '', j4: '' },
    numJueces: 4,
    arbHong: 0,
    arbChung: 0,
    historial: [],
    kyongHong: 0,
    kyongChung: 0,
    faltasHong: 0,
    faltasChung: 0,
    segundos: 120,
    segundosMax: 120,
    activo: false,
    log: [],
    alerta12Lanzada: false,
    alerta12Data: null,
    ronda: 'r1',
    oroResuelto: false,
    oroPendienteAprobacion: false,
    oroGanadorNombre: '',
    oroGanadorColor: '',
    oroPuntoPendiente: null,
    oroPuntoDetalle: '',
    ganadorManualColor: '',
    ganadorManualMotivo: '',
    ganadorPendienteCierre: false,
    ganadorPendienteNombre: '',
    ganadorPendienteColor: '',
    ganadorPendienteMotivo: '',
  };
}

function agregarLog(estado: EstadoCombate, txt: string, color: string) {
  estado.log.unshift({ txt, color, ts: Date.now() });
  if (estado.log.length > 15) estado.log = estado.log.slice(0, 15);
}

function momento(): string {
  return new Date().toISOString();
}

function registrarOroPendiente(
  estado: EstadoCombate,
  entrada: EntradaHistorial,
  color: Color,
  detalle: string,
) {
  estado.oroResuelto = true;
  estado.activo = false;
  estado.oroPendienteAprobacion = true;
  estado.oroGanadorNombre = color === 'hong' ? estado.nombreHong : estado.nombreChung;
  estado.oroGanadorColor = color;
  estado.oroPuntoPendiente = entrada;
  estado.oroPuntoDetalle = detalle;
  agregarLog(estado, `Punto de Oro — ${detalle} (pendiente aprobación JC)`, 'arb');
}

function descalificar(estado: EstadoCombate, colorInfractor: Color, razon: string) {
  const rival: Color = colorInfractor === 'hong' ? 'chung' : 'hong';
  const winner = rival === 'hong' ? estado.nombreHong : estado.nombreChung;
  const perdedor = colorInfractor === 'hong' ? estado.nombreHong : estado.nombreChung;
  const motivo = `Descalificación del oponente — ${razon}`;

  estado.activo = false;
  estado.oroPendienteAprobacion = false;
  estado.alerta12Data = null;
  estado.ganadorManualColor = rival;
  estado.ganadorManualMotivo = motivo;
  estado.ganadorPendienteCierre = true;
  estado.ganadorPendienteNombre = winner;
  estado.ganadorPendienteColor = rival;
  estado.ganadorPendienteMotivo = motivo;
  estado.historial.push({
    juez: 'arbitro',
    color: rival,
    pts: 0,
    nombre: motivo,
    esDecision: true,
    tiempo: estado.segundos,
    ronda: estado.ronda,
    momento: momento(),
  });
  agregarLog(estado, `DESCALIFICACIÓN — ${perdedor} (${razon})`, 'arb');
  agregarLog(estado, `SUNG — ${winner} GANA (${motivo})`, 'arb');
}

export function calcularMarcador(estado: EstadoCombate) {
  const n = estado.numJueces || 4;
  let esqHong = 0;
  let esqChung = 0;
  for (let i = 1; i <= n; i++) {
    const j = estado.jueces[`j${i}`];
    if (j) {
      esqHong += j.hong;
      esqChung += j.chung;
    }
  }
  esqHong /= n;
  esqChung /= n;
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    esq_hong: r(esqHong),
    esq_chung: r(esqChung),
    total_hong: r(esqHong + estado.arbHong),
    total_chung: r(esqChung + estado.arbChung),
  };
}

export interface SnapshotCombate {
  nombreHong: string;
  nombreChung: string;
  marcadorHong: number;
  marcadorChung: number;
  esqHong: number;
  esqChung: number;
  centralHong: number;
  centralChung: number;
  kyongHong: number;
  kyongChung: number;
  faltasHong: number;
  faltasChung: number;
  numJueces: number;
  duracionSegundos: number;
  rondaFinal: string;
  ganador: 'hong' | 'chung' | null;
  motivo: string | null;
}

/** Resumen persistible del combate (port de guardar_combate_snapshot de COMBAT). */
export function snapshotCombate(estado: EstadoCombate): SnapshotCombate {
  const m = calcularMarcador(estado);
  return {
    nombreHong: estado.nombreHong,
    nombreChung: estado.nombreChung,
    marcadorHong: m.total_hong,
    marcadorChung: m.total_chung,
    esqHong: m.esq_hong,
    esqChung: m.esq_chung,
    centralHong: estado.arbHong,
    centralChung: estado.arbChung,
    kyongHong: estado.kyongHong,
    kyongChung: estado.kyongChung,
    faltasHong: estado.faltasHong,
    faltasChung: estado.faltasChung,
    numJueces: estado.numJueces,
    duracionSegundos: estado.segundosMax,
    rondaFinal: estado.ronda,
    ganador: (estado.ganadorManualColor as 'hong' | 'chung') || null,
    motivo: estado.ganadorManualMotivo || null,
  };
}

function verificarSuperioridad(estado: EstadoCombate): Alerta12 | null {
  if (estado.alerta12Lanzada || estado.ganadorManualColor) return null;
  const m = calcularMarcador(estado);
  const diff = Math.abs(m.total_hong - m.total_chung);
  if (diff < ALERTA_SUPERIORIDAD_DIFERENCIA) return null;

  const lider = m.total_hong > m.total_chung ? 'Hong' : 'Chung';
  estado.alerta12Lanzada = true;
  agregarLog(estado, `[ALERTA] Superioridad técnica — ${lider} lidera por ${diff.toFixed(1)}`, 'arb');
  const alerta: Alerta12 = {
    hong: m.total_hong.toFixed(1),
    chung: m.total_chung.toFixed(1),
    lider,
    diferencia: diff.toFixed(1),
    motivo: 'Superioridad técnica',
  };
  estado.alerta12Data = alerta;
  estado.activo = false;
  return alerta;
}

const num = (v: unknown, def = 0): number =>
  typeof v === 'number' ? v : def;
const str = (v: unknown, def = ''): string =>
  typeof v === 'string' ? v : def;

/** Aplica un evento al estado del combate y devuelve uno nuevo (no muta). */
export function aplicarEvento(
  estado: EstadoCombate,
  ev: EventoCombate,
): EstadoCombate {
  const accion = ev.accion;

  if (estado.ganadorManualColor && ACCIONES_BLOQUEADAS_TRAS_GANADOR.has(accion)) {
    return estado;
  }
  if (estado.alerta12Data && ACCIONES_BLOQUEADAS_DURANTE_ALERTA.has(accion)) {
    return estado;
  }

  // Clon profundo (el estado es JSON-serializable: sin Dates ni funciones).
  const e: EstadoCombate = JSON.parse(JSON.stringify(estado)) as EstadoCombate;

  switch (accion) {
    case 'punto_juez': {
      const juez = str(ev.juez);
      const color = str(ev.color) as Color;
      const pts = num(ev.pts);
      const nombre = str(ev.nombre);
      if (e.ronda === 'oro' && e.oroResuelto) return estado;
      if (juez.startsWith('j')) {
        const idx = parseInt(juez.slice(1), 10);
        if (Number.isNaN(idx) || idx > (e.numJueces || 4)) return estado;
      }
      if (e.jueces[juez]) {
        const entrada: EntradaHistorial = {
          juez,
          color,
          pts,
          nombre,
          tiempo: e.segundos,
          ronda: e.ronda,
          momento: momento(),
        };
        if (e.ronda === 'oro') {
          registrarOroPendiente(e, entrada, color, `${nombre} +${pts}`);
          break;
        }
        e.jueces[juez][color] += pts;
        e.historial.push(entrada);
        agregarLog(e, `${nombre} +${pts}`, color);
      }
      break;
    }

    case 'deshacer_juez': {
      const juez = str(ev.juez);
      for (let i = e.historial.length - 1; i >= 0; i--) {
        const h = e.historial[i];
        if (h.juez === juez) {
          e.jueces[h.juez][h.color] -= h.pts;
          e.historial.splice(i, 1);
          agregarLog(e, `Deshacer ${juez}`, 'arb');
          break;
        }
      }
      break;
    }

    case 'especial': {
      const color = str(ev.color) as Color;
      const pts = num(ev.pts);
      const nombre = str(ev.nombre);
      if (e.ronda === 'oro' && e.oroResuelto) return estado;
      const entrada: EntradaHistorial = {
        juez: 'arbitro',
        color,
        pts,
        nombre,
        esEspecial: true,
        tiempo: e.segundos,
        ronda: e.ronda,
        momento: momento(),
      };
      if (e.ronda === 'oro') {
        registrarOroPendiente(e, entrada, color, `⭐ ${nombre} +${pts}`);
        break;
      }
      if (color === 'hong') e.arbHong += pts;
      else e.arbChung += pts;
      e.historial.push(entrada);
      agregarLog(e, `⭐ ${nombre} +${pts}`, color);
      break;
    }

    case 'deshacer_arbitro': {
      const color = str(ev.color) as Color;
      for (let i = e.historial.length - 1; i >= 0; i--) {
        const h = e.historial[i];
        if (h.juez === 'arbitro' && h.color === color) {
          if (h.esKyongGo) {
            if (color === 'hong') {
              e.kyongHong = Math.max(0, e.kyongHong - 1);
              e.arbHong += 0.5;
            } else {
              e.kyongChung = Math.max(0, e.kyongChung - 1);
              e.arbChung += 0.5;
            }
          } else if (h.esGamJeum) {
            if (color === 'hong') {
              e.arbHong += 1;
              e.faltasHong = Math.max(0, e.faltasHong - 1);
            } else {
              e.arbChung += 1;
              e.faltasChung = Math.max(0, e.faltasChung - 1);
            }
          } else {
            if (color === 'hong') e.arbHong -= h.pts;
            else e.arbChung -= h.pts;
          }
          e.historial.splice(i, 1);
          agregarLog(e, `Deshacer árbitro: ${color}`, 'arb');
          break;
        }
      }
      break;
    }

    case 'kyonggo': {
      const color = str(ev.color) as Color;
      if (color === 'hong') {
        e.kyongHong += 1;
        e.arbHong -= 0.5;
      } else {
        e.kyongChung += 1;
        e.arbChung -= 0.5;
      }
      const cuenta = color === 'hong' ? e.kyongHong : e.kyongChung;
      e.historial.push({
        juez: 'arbitro',
        color,
        nombre: `KyongGo #${cuenta} (−0.5)`,
        pts: -0.5,
        esKyongGo: true,
        tiempo: e.segundos,
        ronda: e.ronda,
        momento: momento(),
      });
      agregarLog(e, `KyongGo #${cuenta} −0.5 — ${color}`, color);
      if (cuenta >= MAX_KYONGGO_DQ) {
        descalificar(e, color, `${MAX_KYONGGO_DQ} advertencias (KyongGo)`);
      }
      break;
    }

    case 'gamjeum': {
      const color = str(ev.color) as Color;
      if (color === 'hong') {
        e.arbHong -= 1;
        e.faltasHong += 1;
      } else {
        e.arbChung -= 1;
        e.faltasChung += 1;
      }
      const faltas = color === 'hong' ? e.faltasHong : e.faltasChung;
      e.historial.push({
        juez: 'arbitro',
        color,
        nombre: `GamJeum #${faltas}`,
        pts: -1,
        esGamJeum: true,
        tiempo: e.segundos,
        ronda: e.ronda,
        momento: momento(),
      });
      agregarLog(e, `GamJeum −1 — ${color}`, color);
      if (faltas >= MAX_GAMJEUM_DQ) {
        descalificar(e, color, `${MAX_GAMJEUM_DQ} GamJeum`);
      }
      break;
    }

    case 'set_num_jueces':
      e.numJueces = Math.max(2, Math.min(4, num(ev.numJueces, 4)));
      agregarLog(e, `Réferis de esquina: ${e.numJueces}`, 'arb');
      break;

    case 'nombres':
      e.nombreHong = str(ev.nombreHong) || 'Hong';
      e.nombreChung = str(ev.nombreChung) || 'Chung';
      break;

    case 'set_nombre_juez': {
      const juez = str(ev.juez);
      if (juez) e.nombresJueces[juez] = str(ev.nombre);
      break;
    }

    case 'crono_start':
      e.activo = true;
      break;
    case 'crono_pause':
      e.activo = false;
      break;
    case 'crono_reset':
      e.activo = false;
      e.segundos = num(ev.segundosMax, e.segundosMax);
      if (ev.segundosMax) e.segundosMax = num(ev.segundosMax);
      break;
    case 'crono_seg':
      e.segundos = num(ev.segundos, e.segundos);
      if (typeof ev.activo === 'boolean') e.activo = ev.activo;
      break;

    case 'ronda':
      e.ronda = str(ev.ronda) || 'r1';
      agregarLog(e, `Ronda: ${e.ronda}`, 'arb');
      break;

    case 'aprobar_oro': {
      if (e.oroPendienteAprobacion) {
        const p = e.oroPuntoPendiente;
        if (p) {
          if (p.esEspecial) {
            if (p.color === 'hong') e.arbHong += p.pts;
            else e.arbChung += p.pts;
          } else if (e.jueces[p.juez]) {
            e.jueces[p.juez][p.color] += p.pts;
          }
          e.historial.push(p);
          agregarLog(e, `${p.nombre} +${p.pts} (Punto de Oro aprobado)`, p.color);
        }
        e.oroPuntoPendiente = null;
        e.oroPuntoDetalle = '';
        e.oroPendienteAprobacion = false;
        e.alerta12Data = null;
        e.ganadorManualColor = e.oroGanadorColor;
        e.ganadorManualMotivo = 'Punto de Oro';
        e.ganadorPendienteCierre = true;
        e.ganadorPendienteNombre = e.oroGanadorNombre;
        e.ganadorPendienteColor = e.oroGanadorColor;
        e.ganadorPendienteMotivo = 'Punto de Oro';
        agregarLog(e, `SUNG — ${e.oroGanadorNombre} GANA (Punto de Oro)`, 'arb');
      }
      break;
    }

    case 'declarar_ganador': {
      const color = str(ev.color) as Color;
      if (color === 'hong' || color === 'chung') {
        const winner = color === 'hong' ? e.nombreHong : e.nombreChung;
        const motivo = str(ev.motivo) || 'Decisión del Juez Central';
        e.alerta12Data = null;
        e.ganadorManualColor = color;
        e.ganadorManualMotivo = motivo;
        e.ganadorPendienteCierre = true;
        e.ganadorPendienteNombre = winner;
        e.ganadorPendienteColor = color;
        e.ganadorPendienteMotivo = motivo;
        e.activo = false;
        e.oroPendienteAprobacion = false;
        e.historial.push({
          juez: 'arbitro',
          color,
          pts: 0,
          nombre: motivo,
          esDecision: true,
          tiempo: e.segundos,
          ronda: e.ronda,
          momento: momento(),
        });
        agregarLog(e, `SUNG — ${winner} GANA (${motivo})`, 'arb');
      }
      break;
    }

    case 'cerrar_alerta12':
      if (e.alerta12Data) {
        e.alerta12Data = null;
        if (ev.reanudar) {
          e.activo = true;
          agregarLog(e, 'Superioridad evaluada — el JC reanuda el combate', 'arb');
        } else {
          agregarLog(e, 'Alerta de superioridad cerrada por el JC', 'arb');
        }
      }
      break;

    case 'descalificar': {
      const color = str(ev.color) as Color;
      if (color === 'hong' || color === 'chung') {
        const razon = (str(ev.razon) || 'Decisión del Juez Central').slice(0, 80);
        descalificar(e, color, razon);
      }
      break;
    }

    case 'cerrar_ganador':
      if (e.ganadorPendienteCierre) {
        e.ganadorPendienteCierre = false;
        e.ganadorPendienteNombre = '';
        e.ganadorPendienteColor = '';
        e.ganadorPendienteMotivo = '';
        agregarLog(e, 'Ganador reconocido por el Juez Central', 'arb');
      }
      break;

    case 'rechazar_oro':
      if (e.oroPendienteAprobacion) {
        e.oroPendienteAprobacion = false;
        e.oroResuelto = false;
        e.oroGanadorNombre = '';
        e.oroGanadorColor = '';
        e.oroPuntoPendiente = null;
        e.oroPuntoDetalle = '';
        agregarLog(e, 'Punto de Oro rechazado por el JC — el combate continúa', 'arb');
      }
      break;

    case 'reset': {
      const segMax = e.segundosMax;
      const nuevo = estadoInicialCombate();
      nuevo.segundosMax = segMax;
      nuevo.segundos = segMax;
      agregarLog(nuevo, 'Reset', 'arb');
      return nuevo;
    }
  }

  if (ACCIONES_MARCADOR.has(accion)) {
    verificarSuperioridad(e);
  }
  if (e.historial.length > 200) {
    e.historial = e.historial.slice(-200);
  }

  return e;
}
