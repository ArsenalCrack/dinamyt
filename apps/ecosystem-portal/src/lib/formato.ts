/**
 * Un importe en pesos, como se escribe en Colombia.
 *
 * Vive aquí y no dentro de una pantalla porque lo usan dos que tienen que
 * decir lo MISMO: el panel de recaudo y el alta de una suscripción. Dos
 * formatos distintos para la misma cifra hacen dudar de si son la misma cifra.
 *
 * Sin decimales a propósito: el peso no los usa en la práctica, y un importe
 * con centavos sueltos no cuadra con ningún recibo.
 */
export const dinero = (v: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(v);

/**
 * Las piezas sueltas de la moneda, sacadas del MISMO formateador que pinta los
 * importes: el símbolo y los dos separadores.
 *
 * Se sacan de `Intl` y no de una tabla propia porque cualquier tabla se queda
 * corta: hay monedas con el símbolo detrás, con espacio duro en medio y con
 * separadores que no son ni punto ni coma. Lo usa `<CampoDinero>` para que
 * ESCRIBIR un importe se vea igual que leerlo — que era justo lo que no pasaba:
 * los importes se leían «$ 35.000» y se tecleaban «35000», donde pasarse un
 * cero no lo nota nadie hasta cobrarlo.
 */
const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function piezaDe(tipo: Intl.NumberFormatPartTypes, muestra: number): string | null {
  return formatoMoneda.formatToParts(muestra).find((p) => p.type === tipo)?.value ?? null;
}

export const SIMBOLO_MONEDA = piezaDe('currency', 0) ?? '$';
/** Separador de miles: `.` en es-CO. */
export const SEPARADOR_MILES = piezaDe('group', 1_000_000) ?? '.';
/**
 * Separador decimal: `,` en es-CO.
 *
 * El formateador de arriba no lo enseña —los importes se pintan sin
 * decimales—, así que se pregunta aparte por el mismo idioma.
 */
export const SEPARADOR_DECIMAL =
  new Intl.NumberFormat('es-CO').formatToParts(1.5).find((p) => p.type === 'decimal')
    ?.value ?? ',';
