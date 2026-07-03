import type { ReaderAdapter, Candidato } from './reader';

/**
 * ESQUELETO del adaptador para lectores **DigitalPersona U.are.U** (SDK de Windows).
 *
 * ⚠️ NO INTEGRADO: requiere el hardware + el SDK; no puede probarse sin el lector.
 * Los `TODO` marcan dónde van las llamadas reales del SDK. Al implementarlo, NADA
 * más de la app cambia (el resto habla con el contrato `ReaderAdapter`).
 *
 * Integración típica:
 *  1. Instalar el "HID DigitalPersona U.are.U SDK" y su runtime en el PC del kiosco.
 *  2. Enlazarlo desde Node: addon nativo (node-gyp) o el WebSocket "Lite Client".
 *  3. Implementar capture()/identify() con las llamadas del SDK y serializar el
 *     FMD/plantilla a base64 (con su `format`, p. ej. 'dp-fmd-ansi').
 */
export class DigitalPersonaReader implements ReaderAdapter {
  readonly vendor = 'digitalpersona';

  connected(): boolean {
    // TODO: preguntar al SDK si hay un lector conectado.
    return false;
  }

  async capture(): Promise<{ template: string; format: string }> {
    // TODO: SDK.capture() → FMD → base64 + format.
    throw new Error(
      'DigitalPersonaReader.capture() no implementado: requiere el SDK y el lector.',
    );
  }

  async identify(_candidatos: Candidato[]): Promise<string | null> {
    // TODO: SDK.identify(fmd, candidatos) → value del match 1:N o null.
    throw new Error(
      'DigitalPersonaReader.identify() no implementado: requiere el SDK y el lector.',
    );
  }
}
