import { estado } from './billing';

/** Miembro reducido para evaluar avisos. */
export interface MembershipLite {
  userId: string;
  membershipId: string;
  venceEl: string | null;
  /** Saldo de clases del que va por paquete o por clase suelta. */
  clasesRestantes?: number | null;
}

export type TipoAviso = 'pre_venc' | 'venc' | 'mora';

export interface AvisoPlan {
  userId: string;
  membershipId: string;
  type: TipoAviso;
}

/**
 * Evalúa a los miembros y decide qué avisos generar hoy (§8): `pre_venc` a los
 * que están por vencer (dentro de la ventana), `venc` a los vencidos. Puro y
 * testeable.
 *
 * El estado lo decide `estado`, con las DOS coberturas. Antes se descartaba a
 * quien no tuviera `venceEl` y se juzgaba solo por la fecha, así que el alumno
 * que dejó atrás la mensualidad y ahora va por paquete recibía cada mañana un
 * «tu mensualidad venció» por una fecha que ya no significaba nada — y el que
 * se quedó sin clases no recibía nada en absoluto.
 */
export function planNotificaciones(
  miembros: MembershipLite[],
  today: string,
  ventanaDias = 3,
): AvisoPlan[] {
  const out: AvisoPlan[] = [];
  for (const m of miembros) {
    const est = estado(m, today, ventanaDias);
    if (est === 'vencido') {
      out.push({ userId: m.userId, membershipId: m.membershipId, type: 'venc' });
    } else if (est === 'por_vencer') {
      out.push({ userId: m.userId, membershipId: m.membershipId, type: 'pre_venc' });
    }
  }
  return out;
}

/**
 * Texto legible de un aviso para push/in-app.
 *
 * Sin fecha el aviso es de un plan por clases: ahí no venció nada, se acabaron
 * las clases. Antes salía «Tu mensualidad venció el null».
 */
export function textoAviso(type: TipoAviso, venceEl: string | null): string {
  if (type === 'venc') {
    return venceEl
      ? `Tu mensualidad venció el ${venceEl}. Acércate a ponerte al día.`
      : 'Te quedaste sin clases disponibles. Acércate a tu maestro para renovar.';
  }
  if (type === 'pre_venc') {
    return venceEl
      ? `Tu mensualidad vence el ${venceEl}. ¡No olvides renovar!`
      : 'Se te están acabando las clases. ¡No olvides renovar!';
  }
  return 'Tienes un pago pendiente en el club.';
}

/**
 * ── El aviso que le llega AL MAESTRO, y por qué es un resumen ───────────────
 *
 * Hasta ahora el push de Membresías se le escribía solo al alumno: el dueño de
 * la membresía que vence. El maestro tenía la misma información en su campana
 * —la lista del club— pero **solo si abría la app**, y la abre cuando se
 * acuerda. El resultado era el de siempre: los avisos existían y nadie se
 * enteraba hasta que alguien preguntaba en clase.
 *
 * ── Por qué UNO y no uno por alumno ──
 *
 * Porque un club de treinta alumnos genera doce avisos una mañana de fin de
 * mes, y doce notificaciones seguidas en el celular no se leen: se barren de un
 * gesto y de paso se aprende a barrer las del día siguiente. Un solo aviso que
 * dice **cuántos y de qué clase** cabe en la pantalla bloqueada y basta para
 * decidir si vale la pena abrir la app ahora o después de clase.
 *
 * ── Por qué no crea fila en `notifications` ──
 *
 * Porque el maestro ya ve esos avisos en su campana: son los de sus alumnos
 * (`GET /notifications?all=1`). Una fila suya sería la misma información
 * contada dos veces en la misma pantalla. Esto es el empujón para ir a mirar,
 * no un aviso nuevo.
 *
 * Devuelve `null` cuando no hay nada que resumir: un push que dice «cero» es
 * ruido puro.
 */
export function resumenParaElClub(
  avisos: { type: TipoAviso }[],
  nombreDelClub: string | null,
): { title: string; body: string } | null {
  const vencidos = avisos.filter((a) => a.type === 'venc' || a.type === 'mora').length;
  const porVencer = avisos.filter((a) => a.type === 'pre_venc').length;
  if (vencidos === 0 && porVencer === 0) return null;

  const partes: string[] = [];
  if (vencidos > 0) {
    partes.push(
      vencidos === 1 ? '1 alumno con la mensualidad vencida' : `${vencidos} alumnos con la mensualidad vencida`,
    );
  }
  if (porVencer > 0) {
    partes.push(porVencer === 1 ? '1 por vencer' : `${porVencer} por vencer`);
  }

  return {
    // El nombre del club en el título: quien lleva dos no puede tener que
    // adivinar de cuál le están hablando.
    title: nombreDelClub ? `DINAMYT · ${nombreDelClub}` : 'DINAMYT · Mi Club',
    body: `Hoy: ${partes.join(' y ')}.`,
  };
}
