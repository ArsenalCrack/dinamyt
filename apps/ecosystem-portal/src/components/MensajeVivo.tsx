/**
 * El aviso que sale después de una acción: «Guardado», «No se pudo guardar».
 *
 * Se pintaban como un `<p>` suelto que aparecía con el texto, y para quien usa
 * lector de pantalla eso no existe: pulsaba «Guardar» y no se enteraba de si
 * se guardó (auditoría 002, nº 2). `<Campo>` ya lo hacía bien con el error de
 * cada campo; esto es lo mismo para el aviso general.
 *
 * ── Por qué el contenedor está SIEMPRE ──
 *
 * Una región viva que se inserta ya con el texto dentro no la anuncian todos
 * los lectores: lo que anuncian es el CAMBIO dentro de una región que ya
 * estaba. Así que el `<div>` con el rol se pinta siempre, vacío y sin medir
 * nada, y lo que entra y sale es el párrafo de dentro.
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
