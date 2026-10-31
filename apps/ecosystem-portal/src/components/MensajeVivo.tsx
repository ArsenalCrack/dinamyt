/**
 * El aviso que sale después de una acción: «Guardado», «No se pudo guardar».
 *
 * Se pintaban como un `<p>` suelto que aparecía con el texto, y para quien usa
 * lector de pantalla eso no existe: pulsaba «Guardar» y no se enteraba de si
 * se guardó (auditoría 002, nº 2). `<Campo>` anuncia el error de cada campo
 * con `aria-live`, pero insertando la región ya con el texto, que es lo que
 * aquí abajo se explica que no todos anuncian (hoja de ruta, 0.6).
 *
 * ── Por qué el contenedor está SIEMPRE ──
 *
 * Una región viva que se inserta ya con el texto dentro no la anuncian todos
 * los lectores: lo que anuncian es el CAMBIO dentro de una región que ya
 * estaba. Así que el `<div>` con el rol se pinta siempre, vacío, y lo que
 * entra y sale es el párrafo de dentro.
 *
 * ── Y por eso no va suelto en un `gap` ──
 *
 * Vacío no mide nada en un bloque normal, pero dentro de un `flex` o una
 * rejilla con `gap` cuenta como un hijo más y suma el hueco: dejaba 16 o 32 px
 * de más antes de «Guardar» (thermos, 31 oct 2026). El aviso va en un `<div>`
 * junto con el botón que lo provoca, y su separación la pone `className`
 * (`mb-4`, el mismo `gap` que había).
 *
 * El error va con `role="alert"` (interrumpe, porque algo no salió); lo demás
 * con `role="status"` (espera a que el lector termine lo que estaba diciendo).
 */
export function MensajeVivo({
  tono,
  texto,
  className = '',
}: {
  tono: 'ok' | 'error' | 'info';
  texto: string | null | undefined | false;
  /** Para el párrafo: márgenes y tamaño, como antes en el `<p>`. */
  className?: string;
}) {
  const clase = tono === 'error' ? 'msg-error' : tono === 'ok' ? 'msg-ok' : '';
  return (
    <div role={tono === 'error' ? 'alert' : 'status'}>
      {texto ? <p className={`${clase} ${className}`.trim()}>{texto}</p> : null}
    </div>
  );
}
