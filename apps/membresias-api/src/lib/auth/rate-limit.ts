/**
 * Límite de intentos de login (ventana deslizante, en memoria).
 *
 * Pensado para un proceso único, que es como se despliega esta API. Si algún
 * día corre con varios workers, el contador deja de ser global y habría que
 * moverlo a un backend compartido (Redis).
 */

interface Registro {
  marcas: number[];
  ventanaMs: number;
}

const intentos = new Map<string, Registro>();

/** Tope de claves en memoria, para que no crezca sin control. */
const MAX_CLAVES = 10_000;

function podar(ahora: number) {
  if (intentos.size <= MAX_CLAVES) return;
  for (const [clave, reg] of intentos) {
    const vigentes = reg.marcas.filter((t) => ahora - t < reg.ventanaMs);
    if (vigentes.length) intentos.set(clave, { ...reg, marcas: vigentes });
    else intentos.delete(clave);
  }
}

/**
 * Registra un intento y devuelve `true` si la clave YA superó el límite.
 * `clave` identifica el sujeto: `login:correo@x.com` o `login-ip:1.2.3.4`.
 */
export function intentoBloqueado(
  clave: string,
  maxIntentos: number,
  ventanaSeg: number,
): boolean {
  const ahora = Date.now();
  const ventanaMs = ventanaSeg * 1000;
  const previo = intentos.get(clave);
  const marcas = (previo?.marcas ?? []).filter((t) => ahora - t < ventanaMs);

  if (marcas.length >= maxIntentos) {
    intentos.set(clave, { marcas, ventanaMs });
    return true;
  }

  marcas.push(ahora);
  intentos.set(clave, { marcas, ventanaMs });
  podar(ahora);
  return false;
}

/** Borra los intentos de una clave (tras un login correcto). */
export function limpiarIntentos(clave: string) {
  intentos.delete(clave);
}

/** Segundos que faltan para que la clave vuelva a admitir intentos. */
export function segundosRestantes(clave: string): number {
  const reg = intentos.get(clave);
  if (!reg?.marcas.length) return 0;
  const masViejo = Math.min(...reg.marcas);
  return Math.max(0, Math.ceil((reg.ventanaMs - (Date.now() - masViejo)) / 1000));
}

/** Solo para tests: deja el contador en blanco. */
export function reiniciarLimites() {
  intentos.clear();
}
