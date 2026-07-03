/**
 * Contrato del lector de huella, **independiente de la marca**. El adaptador real
 * (DigitalPersona U.are.U, ZKTeco…) implementa esta interfaz usando su SDK; el
 * resto del agente y toda la app no cambian al cambiar de lector. La plantilla es
 * un formato propietario por marca (lock-in): por eso viaja con su `format`.
 */
export interface Candidato {
  /** Identificador que se devolverá si hay match (ecosystem_user_id). */
  value: string;
  template: string;
}

export interface ReaderAdapter {
  readonly vendor: string;
  connected(): boolean;
  /** Captura una huella y devuelve su plantilla + formato. */
  capture(): Promise<{ template: string; format: string }>;
  /** Identificación 1:N local contra las plantillas cacheadas. */
  identify(candidatos: Candidato[]): Promise<string | null>;
}

/**
 * Adaptador MOCK para desarrollo/CI (sin hardware). Simula un lector conectado:
 * `capture` genera una plantilla ficticia y `identify` devuelve el primer
 * candidato. Sustituir por un adaptador real por marca en producción.
 */
export class MockReader implements ReaderAdapter {
  readonly vendor = 'mock';
  connected(): boolean {
    return true;
  }
  async capture(): Promise<{ template: string; format: string }> {
    return { template: `MOCK-${Math.random().toString(36).slice(2)}`, format: 'mock-v1' };
  }
  async identify(candidatos: Candidato[]): Promise<string | null> {
    return candidatos[0]?.value ?? null;
  }
}
