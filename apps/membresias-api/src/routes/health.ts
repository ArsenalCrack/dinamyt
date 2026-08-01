import type { FastifyInstance } from 'fastify';
import { todayStr } from '../lib/billing';

export async function healthRoutes(app: FastifyInstance) {
  /**
   * Señal de vida, y de paso EN QUÉ DÍA CREE EL SERVIDOR QUE ESTÁ.
   *
   * Lo segundo no es un adorno. El día del check-in, el vencimiento de las
   * mensualidades y la fecha del carnet se calculan con la hora local del
   * servidor (`todayStr`), y si esa hora no es la del club, un entreno de las
   * ocho de la noche queda validado contra el día siguiente: el kiosco rechaza
   * a la fila entera con «hoy el club no tiene clase programada». Render arranca
   * en UTC, así que hace falta `TZ` (ver `render.yaml`).
   *
   * Sin esto, comprobarlo obligaba a esperar a las siete de la tarde y probar el
   * kiosco a ver qué pasaba. Ahora es una línea:
   *
   *     curl https://TU-SERVICIO.onrender.com/health
   *
   * Si `zonaHoraria` dice «UTC» y tu club está en Colombia, falta la variable.
   * No lleva ningún dato de nadie: solo la hora del reloj.
   */
  app.get('/health', async () => {
    const ahora = new Date();
    return {
      status: 'ok',
      service: 'membresias-api',
      zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'desconocida',
      /** El «hoy» que usa toda la aplicación, no la hora UTC. */
      hoy: todayStr(ahora),
      hora: ahora.toLocaleTimeString('es-CO', { hour12: false }),
    };
  });
}
