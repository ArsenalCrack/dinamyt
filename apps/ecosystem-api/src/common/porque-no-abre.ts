/**
 * Por qué una organización **no** abre una app hoy, dicho en una frase.
 *
 * ── El silencio que rompe ──
 *
 * `appsPorOrganizacion` contesta sí o no, y con un no a secas el super-admin se
 * queda igual que estaba: ve el club en el portal, con su plan y su fecha, y no
 * aparece en Membresías. Las causas son pocas y **todas invisibles desde la
 * pantalla de suscripciones**:
 *
 * · **La suscripción se creó y nadie la activó.** Es la que muerde: nace en
 *   `PENDING_REVIEW` a propósito, y hasta que no se pone en `ACTIVE` el club no
 *   abre nada — ni por el portal ni por Membresías. En la fila se lee «En
 *   revisión», que no parece una avería.
 * · **Venció.** El `status` se queda en `ACTIVE` hasta que alguien lo cambie, así
 *   que lo que caduca de verdad es la FECHA: una fila que dice «Activa» con la
 *   fecha pasada no abre nada.
 * · **El plan no incluye la app.** Se contrató el de Campeonatos.
 *
 * ── Por qué es una función pura y aparte ──
 *
 * Por lo mismo que `jerarquia`: lo que se rompe aquí no es la consulta, es la
 * ELECCIÓN —cuál de las tres suscripciones de un club es la que hay que
 * nombrar— y eso se prueba sin base de datos delante. Es además lo único que
 * lee un humano cuando algo va mal, así que la frase importa tanto como la
 * lógica.
 */

/** Lo que hace falta saber de una suscripción para juzgarla. */
export interface SuscripcionMirada {
  /** De quién es: suya, o de la federación de la que cuelga. */
  orgId: string;
  status: string | null;
  endsAt: Date | string | null;
  planName: string;
  appsIncluded: string[] | null;
}

/** El día que hay escrito en la fecha, sin correrlo con el reloj de nadie. */
function dia(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/**
 * Cuál de las candidatas está MÁS CERCA de abrir: es la que hay que tocar.
 *
 * Un club con una vencida del año pasado y una recién creada sin activar
 * necesita oír «actívala», no «aquella venció». Con el mismo estado, la de
 * vencimiento más lejano.
 */
const CERCANIA: Record<string, number> = {
  PENDING_REVIEW: 3,
  // `ACTIVE` y aun así sin abrir solo puede ser una cosa: venció por fecha.
  ACTIVE: 2,
  SUSPENDED: 1,
  EXPIRED: 0,
};

/**
 * @param orgId La organización por la que se pregunta.
 * @param eslabones Su cadena de mando: ella y sus federaciones (ver
 *   `cadenasDeMando`). La herencia BAJA, así que un club puede abrir con el
 *   plan de su federación y sin fila propia — y decirle «no tienes plan» sin
 *   mirar ahí sería mentira.
 * @param filas Las suscripciones de cualquiera de esos eslabones.
 * @param app El `apps_included` que se busca.
 * @returns La frase, o `null` si esta organización no tiene ningún plan de esa
 *   app: no falla nada, sencillamente no la usa.
 */
export function porQueNoAbre(
  orgId: string,
  eslabones: readonly string[],
  filas: readonly SuscripcionMirada[],
  app = 'membresias',
): string | null {
  const dentro = new Set(eslabones.length > 0 ? eslabones : [orgId]);
  const suyas = filas.filter(
    (f) => dentro.has(f.orgId) && (f.appsIncluded ?? []).includes(app),
  );

  // ── `null` no es «no lo sé»: es «esta pregunta no va con esta organización» ──
  //
  // Sin ninguna suscripción a esta app, ni suya ni heredada, el club no es que
  // falle: **no la usa**. La diferencia importa porque quien llama pinta una
  // lista de problemas, y meter ahí a las diez federaciones que solo compraron
  // Campeonatos convierte el listado en algo que nadie lee — que es la forma
  // de esconder los dos clubes que sí necesitan una llamada.
  if (suyas.length === 0) return null;

  const mejor = suyas.slice().sort(
    (a, b) =>
      (CERCANIA[b.status ?? ''] ?? -1) - (CERCANIA[a.status ?? ''] ?? -1) ||
      (dia(b.endsAt) ?? '').localeCompare(dia(a.endsAt) ?? ''),
  )[0];

  const plan = `«${mejor.planName}»`;
  // De quién es el plan que se nombra. Sin esto, a un club afiliado se le dice
  // «tu suscripción» de una fila que no es suya y que él no puede tocar.
  const heredado = mejor.orgId !== orgId ? ' de su federación' : '';
  const vence = dia(mejor.endsAt) ?? 'sin fecha';

  switch (mejor.status) {
    case 'PENDING_REVIEW':
      return `su suscripción${heredado} a ${plan} sigue EN REVISIÓN. Ponla en «Activa» y el club abre en el acto.`;
    case 'SUSPENDED':
      return `su suscripción${heredado} a ${plan} está suspendida.`;
    case 'ACTIVE':
      return `su suscripción${heredado} a ${plan} venció el ${vence}. Registra el pago y vuelve a abrir.`;
    default:
      return `su suscripción${heredado} a ${plan} está marcada como vencida (${vence}).`;
  }
}
