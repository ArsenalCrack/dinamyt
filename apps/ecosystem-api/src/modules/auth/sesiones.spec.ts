import {
  SessionsService,
  juzgarSesion,
  describirDispositivo,
  type SesionJuzgable,
} from './sessions.service';

/**
 * Cuándo se acaba una sesión.
 *
 * ── Lo que se rompía ──
 *
 * La sesión ERA el token: firmado, veinticuatro horas, y nada más. Salir
 * borraba la copia del navegador y el original seguía abriendo puertas hasta
 * el día siguiente. Quien entraba desde un computador prestado y se iba dejaba
 * su cuenta abierta ahí, y ni cerrar sesión ni cambiar la contraseña la
 * cerraban.
 *
 * Estas pruebas cubren la regla que lo arregla. Se prueba la función pura y no
 * el servicio porque lo que importa —y lo que puede volver a romperse en un
 * refactor— es la DECISIÓN, no la consulta SQL que la alimenta.
 */
describe('Sesiones · los tres relojes', () => {
  const AHORA = new Date('2026-08-24T15:00:00Z').getTime();
  const minutos = (n: number) => n * 60 * 1000;
  const horas = (n: number) => n * 60 * 60 * 1000;

  /** Una sesión recién usada, con nueve horas por delante. */
  function sana(parches: Partial<SesionJuzgable> = {}): SesionJuzgable {
    return {
      lastSeenAt: new Date(AHORA - minutos(1)),
      expiresAt: new Date(AHORA + horas(9)),
      revokedAt: null,
      revokedReason: null,
      ...parches,
    };
  }

  it('una sesión en uso está viva', () => {
    expect(juzgarSesion(sana(), AHORA)).toEqual({ viva: true });
  });

  // ── Reloj 1: inactividad ─────────────────────────────────────────────────
  // Es el que resuelve el computador prestado: la persona se levanta, se va, y
  // a los veinte minutos ahí no queda nada que abrir.

  it('sigue viva justo antes de los veinte minutos', () => {
    const casi = sana({
      lastSeenAt: new Date(
        AHORA - minutos(SessionsService.INACTIVIDAD_MINUTOS) + 1000,
      ),
    });
    expect(juzgarSesion(casi, AHORA)).toEqual({ viva: true });
  });

  it('se cierra sola pasados los veinte minutos sin actividad', () => {
    const abandonada = sana({
      lastSeenAt: new Date(
        AHORA - minutos(SessionsService.INACTIVIDAD_MINUTOS + 1),
      ),
    });
    expect(juzgarSesion(abandonada, AHORA)).toEqual({
      viva: false,
      motivo: 'inactividad',
    });
  });

  // ── El reloj 1 tiene una excepción: «mantener la sesión iniciada» ────────
  //
  // La casilla del login existía y no hacía lo que dice: solo decidía en qué
  // almacén del navegador vivía el pase. El reloj de inactividad lo aplica el
  // servidor, y el servidor no se enteraba de nada — así que a los veinte
  // minutos echaba igual a quien había pedido por escrito lo contrario. Estas
  // tres pruebas son la diferencia entre una opción y un adorno.

  it('la recordada NO se cierra por estar horas quieta', () => {
    const guardada = sana({
      recordada: true,
      lastSeenAt: new Date(AHORA - horas(8)),
      expiresAt: new Date(AHORA + horas(24 * 20)),
    });
    expect(juzgarSesion(guardada, AHORA)).toEqual({ viva: true });
  });

  it('pero la recordada SÍ caduca: no vive para siempre', () => {
    const vieja = sana({
      recordada: true,
      lastSeenAt: new Date(AHORA - horas(8)),
      expiresAt: new Date(AHORA - 1000),
    });
    expect(juzgarSesion(vieja, AHORA)).toEqual({
      viva: false,
      motivo: 'caducada',
    });
  });

  it('y la recordada se puede cerrar: es la salida si se pierde el teléfono', () => {
    const cerrada = sana({
      recordada: true,
      lastSeenAt: new Date(AHORA - horas(8)),
      revokedAt: new Date(AHORA - minutos(1)),
      revokedReason: 'salir-todas',
    });
    expect(juzgarSesion(cerrada, AHORA)).toEqual({
      viva: false,
      motivo: 'salir-todas',
    });
  });

  it('sin la marca, todo sigue exactamente igual que antes', () => {
    // El valor por defecto de la columna es `false`, así que esto es lo que
    // les pasa a todas las sesiones que ya existían cuando llegó la migración.
    const normal = sana({
      recordada: false,
      lastSeenAt: new Date(
        AHORA - minutos(SessionsService.INACTIVIDAD_MINUTOS + 1),
      ),
    });
    expect(juzgarSesion(normal, AHORA)).toEqual({
      viva: false,
      motivo: 'inactividad',
    });
  });

  // ── Reloj 2: el máximo absoluto ──────────────────────────────────────────
  // Sin él, quien toca la pantalla cada cuarto de hora no vuelve a escribir su
  // contraseña jamás.

  it('muere a las doce horas aunque se esté usando en ese mismo instante', () => {
    const maratón = sana({
      lastSeenAt: new Date(AHORA - 1000),
      expiresAt: new Date(AHORA - 1000),
    });
    expect(juzgarSesion(maratón, AHORA)).toEqual({
      viva: false,
      motivo: 'caducada',
    });
  });

  // ── Reloj 3: la revocación ───────────────────────────────────────────────

  it('una sesión revocada no vale, por reciente que sea su última señal', () => {
    const cerrada = sana({
      lastSeenAt: new Date(AHORA - 1000),
      revokedAt: new Date(AHORA - 2000),
      revokedReason: 'salir-todas',
    });
    expect(juzgarSesion(cerrada, AHORA)).toEqual({
      viva: false,
      motivo: 'salir-todas',
    });
  });

  it('el motivo explícito gana al automático: se cuenta lo que de verdad pasó', () => {
    // Una sesión que alguien cerró al cambiar su contraseña Y que además lleva
    // horas parada tiene que decir «cambiaste la contraseña», no «caducó»: lo
    // segundo no explica nada y lo primero es justo lo que la persona necesita
    // entender para no creer que la aplicación falla.
    const ambas = sana({
      lastSeenAt: new Date(AHORA - horas(5)),
      expiresAt: new Date(AHORA - horas(1)),
      revokedAt: new Date(AHORA - horas(4)),
      revokedReason: 'cambio-contrasena',
    });
    expect(juzgarSesion(ambas, AHORA)).toEqual({
      viva: false,
      motivo: 'cambio-contrasena',
    });
  });

  it('una fila revocada sin motivo se cuenta como un «salir» normal', () => {
    const sinMotivo = sana({ revokedAt: new Date(AHORA - 1000) });
    expect(juzgarSesion(sinMotivo, AHORA)).toEqual({
      viva: false,
      motivo: 'salir',
    });
  });

  it('el latido escribe menos veces que las peticiones que lo provocan', () => {
    // Una pantalla que carga ocho listas no puede ser ocho UPDATE sobre la
    // misma fila para decir lo mismo. Un minuto de resolución sobra cuando el
    // corte está en veinte.
    expect(SessionsService.LATIDO_SEGUNDOS).toBeLessThan(
      SessionsService.INACTIVIDAD_MINUTOS * 60,
    );
  });

  it('el pase caduca mucho antes que la inactividad, para que renovar sea el latido', () => {
    // Si el pase durase más que la ventana de inactividad, el navegador podría
    // pasarse toda esa ventana sin volver a hablar con el ecosystem y una
    // sesión revocada seguiría entrando en Academy hasta que le tocara renovar.
    expect(SessionsService.PASE_SEGUNDOS).toBeLessThanOrEqual(
      SessionsService.INACTIVIDAD_MINUTOS * 60 * 2,
    );
  });
});

/**
 * Lo que la persona lee en «dispositivos conectados».
 *
 * No se busca exactitud —con el `User-Agent` es imposible—, se busca que
 * alguien reconozca cuál de las filas es el computador de la sala en la que
 * estuvo ayer.
 */
describe('Sesiones · nombrar el dispositivo', () => {
  it('reconoce los navegadores que se disfrazan de otros', () => {
    // Edge y Opera se presentan también como Chrome, y Chrome se presenta
    // también como Safari. Mirando en el orden equivocado, todo el mundo acaba
    // siendo Safari y la lista no distingue nada.
    expect(
      describirDispositivo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0',
      ),
    ).toBe('Edge en Windows');
    expect(
      describirDispositivo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome en Windows');
    expect(
      describirDispositivo(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari en iPhone');
  });

  it('no se queda en blanco cuando no reconoce nada', () => {
    expect(describirDispositivo(null)).toBe('Dispositivo desconocido');
    expect(describirDispositivo('curl/8.4.0')).toBe('Dispositivo desconocido');
  });
});
