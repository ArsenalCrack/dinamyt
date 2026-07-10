import { activityLog, type Db } from '@dinamyt/academy-db';

/** Tipos de evento del historial (bitácora que ve el maestro). */
export type TipoActividad =
  | 'ingreso'
  | 'contenido_visto'
  | 'entrega'
  | 'intento_figura'
  | 'avance_grado';

export interface EventoActividad {
  userId: string;
  type: TipoActividad;
  detail?: string | null;
  martialArtId?: string | null;
  refId?: string | null;
}

/** Registra un evento en la bitácora. Best-effort: la actividad JAMÁS debe
 *  tumbar la operación principal. */
export async function registrarActividad(db: Db, evento: EventoActividad) {
  try {
    await db.insert(activityLog).values({
      userId: evento.userId,
      type: evento.type,
      detail: evento.detail ?? null,
      martialArtId: evento.martialArtId ?? null,
      refId: evento.refId ?? null,
    });
  } catch {
    /* nunca romper el flujo por la bitácora */
  }
}

// «Entró a la plataforma»: un evento por SESIÓN, no por request. Se usa una
// ventana en memoria (si el proceso reinicia puede duplicar un ingreso: es
// inofensivo para una bitácora).
const VENTANA_INGRESO_MS = 30 * 60 * 1000;
const ultimoIngreso = new Map<string, number>();

export async function registrarIngreso(db: Db, userId: string) {
  const ahora = Date.now();
  const previo = ultimoIngreso.get(userId);
  if (previo && ahora - previo < VENTANA_INGRESO_MS) return;
  ultimoIngreso.set(userId, ahora);
  await registrarActividad(db, {
    userId,
    type: 'ingreso',
    detail: 'Entró a la plataforma',
  });
}

/** Solo para tests: limpia la ventana de sesión en memoria. */
export function _resetVentanaIngresos() {
  ultimoIngreso.clear();
}
