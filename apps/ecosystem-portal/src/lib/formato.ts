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
