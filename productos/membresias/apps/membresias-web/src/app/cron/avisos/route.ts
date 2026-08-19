import { NextResponse } from 'next/server';

/**
 * Disparo diario de los avisos.
 *
 * Por qué existe esta ruta en la WEB y no un cron en la API: la API vive en el
 * plan gratuito de Render, que apaga el servicio cuando nadie lo usa y no
 * ofrece tareas programadas. Un `setInterval` dentro del proceso moriría con
 * él. Vercel sí trae cron incluido, así que quien lleva el reloj es la web y la
 * API solo hace el trabajo cuando la llaman.
 *
 * La cadena completa:
 *   cron de Vercel (ver `vercel.json`)
 *     → GET /cron/avisos  ← esta ruta, con el Bearer que Vercel añade sola
 *       → POST {API}/notifications/cron  con la cabecera `x-cron-secret`
 *         → recorre todos los clubes, encola avisos y manda los push
 *
 * Hace falta `CRON_SECRET` en Vercel Y en Render, con el MISMO valor: sin él,
 * ni Vercel firma la llamada ni la API la acepta.
 */

// Nada de cachear: cada ejecución tiene que llegar hasta la API.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/**
 * Render duerme el servicio gratuito tras un rato sin tráfico y despertarlo
 * cuesta cerca de un minuto. Con los 10 s por defecto, el cron moría esperando
 * justo los días en que nadie había entrado a la app — que son precisamente
 * los días en que los avisos hacen falta.
 */
export const maxDuration = 60;

const API = process.env.MEMBRESIAS_API_ORIGIN || 'http://127.0.0.1:3004';

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: 'Falta CRON_SECRET: los avisos automáticos están apagados.' },
      { status: 503 },
    );
  }

  // Vercel firma sus propias llamadas con este encabezado. Sin la comprobación,
  // cualquiera podría disparar los push de todos los clubes desde fuera.
  if (req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  // Dos intentos: el primero suele gastarse en despertar a Render.
  let ultimoError = 'sin respuesta';
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(`${API}/notifications/cron`, {
        method: 'POST',
        headers: { 'x-cron-secret': secreto, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(25_000),
        cache: 'no-store',
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (r.ok) return NextResponse.json({ ok: true, intento, ...cuerpo });
      ultimoError = `La API respondió ${r.status}`;
      // Un 401 o un 404 no se arreglan reintentando: es la configuración.
      if (r.status < 500) break;
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({ ok: false, error: ultimoError }, { status: 502 });
}
