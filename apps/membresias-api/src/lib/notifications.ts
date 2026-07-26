import { estado } from './billing';

/** Miembro reducido para evaluar avisos. */
export interface MembershipLite {
  userId: string;
  membershipId: string;
  venceEl: string | null;
}

export type TipoAviso = 'pre_venc' | 'venc' | 'mora';

export interface AvisoPlan {
  userId: string;
  membershipId: string;
  type: TipoAviso;
}

/**
 * Evalúa a los miembros y decide qué avisos generar hoy (§8): `pre_venc` a los que
 * están por vencer (dentro de la ventana), `venc` a los vencidos. Puro y testeable.
 */
export function planNotificaciones(
  miembros: MembershipLite[],
  today: string,
  ventanaDias = 3,
): AvisoPlan[] {
  const out: AvisoPlan[] = [];
  for (const m of miembros) {
    if (!m.venceEl) continue;
    const est = estado(m.venceEl, today, ventanaDias);
    if (est === 'vencido') {
      out.push({ userId: m.userId, membershipId: m.membershipId, type: 'venc' });
    } else if (est === 'por_vencer') {
      out.push({ userId: m.userId, membershipId: m.membershipId, type: 'pre_venc' });
    }
  }
  return out;
}

/** Texto legible de un aviso para email/in-app. */
export function textoAviso(type: TipoAviso, venceEl: string | null): string {
  if (type === 'venc') return `Tu mensualidad venció el ${venceEl}. Acércate a ponerte al día.`;
  if (type === 'pre_venc') return `Tu mensualidad vence el ${venceEl}. ¡No olvides renovar!`;
  return 'Tienes un pago pendiente en el club.';
}
