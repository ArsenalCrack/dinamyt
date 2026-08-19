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
