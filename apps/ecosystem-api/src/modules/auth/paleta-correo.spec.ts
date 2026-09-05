import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La paleta del correo no se puede separar de la del ecosistema.
 *
 * `mailer.service.ts` repite los colores a mano porque un correo no puede
 * importar una hoja de estilos —Gmail la tira— ni usar `var(--bg)`, que Outlook
 * no entiende. Es la única copia que queda de los tokens, y queda por una
 * limitación del medio.
 *
 * El problema de una copia es el de siempre, y aquí es peor que en otros
 * sitios: **nadie mira su propio correo de verificación dos veces**. Si los
 * colores se separan, el correo será la última pantalla del ecosistema en
 * notarse, y para entonces llevará meses saliendo con la marca vieja.
 *
 * Esta prueba lee los dos archivos y los compara. No es elegante leer un CSS
 * desde una prueba de Jest; es que la alternativa es no enterarse.
 */
describe('la paleta del correo sigue siendo la del ecosistema', () => {
  const estilos = readFileSync(
    join(__dirname, '../../../../../packages/shared/estilos.css'),
    'utf8',
  );
  const mailer = readFileSync(join(__dirname, 'mailer.service.ts'), 'utf8');

  /** El valor de un token en el bloque `:root` del archivo compartido. */
  function token(nombre: string): string {
    const m = new RegExp(`^\\s*--${nombre}:\\s*([^;]+);`, 'm').exec(
      estilos.slice(estilos.indexOf(':root {'), estilos.indexOf('html[data-theme')),
    );
    if (!m) throw new Error(`No está el token --${nombre} en estilos.css`);
    return m[1].trim().toLowerCase();
  }

  /** El valor de una entrada de la constante `C` del mailer. */
  function correo(clave: string): string {
    const m = new RegExp(`${clave}:\\s*'([^']+)'`).exec(mailer);
    if (!m) throw new Error(`No está ${clave} en mailer.service.ts`);
    return m[1].trim().toLowerCase();
  }

  const PARES: [string, string][] = [
    ['fondo', 'bg'],
    ['tarjeta', 'bg-card'],
    ['elevado', 'bg-elevated'],
    ['borde', 'border'],
    ['texto', 'text'],
    ['tenue', 'text-muted'],
    ['oro', 'gold'],
    ['oroApagado', 'gold-dim'],
    ['accion', 'accion'],
    ['accionTexto', 'accion-texto'],
  ];

  it.each(PARES)('%s = --%s', (claveCorreo, nombreToken) => {
    expect(correo(claveCorreo)).toBe(token(nombreToken));
  });

  it('el correo usa el oro de MARCA, no el de texto del modo claro', () => {
    // El modo claro tiene dos oros (`--gold` para la letra, `--gold-fill` para
    // el relleno). El correo va siempre en oscuro, así que le toca el vivo.
    expect(correo('oro')).toBe('#f0b800');
  });
});
