/**
 * **La única puerta por la que otra aplicación crea cuentas de DINAMYT.**
 *
 * ── Por qué esta ruta merece pruebas propias ──
 *
 * `POST /sync/alta` es el maestro inscribiendo a un alumno en Membresías, con
 * el alumno delante. Del lado de allá ya está cubierto —`alta-del-club.spec.ts`
 * comprueba que la ficha nace enlazada—, pero **esto es lo que crea la cuenta**:
 * si falla en silencio o crea de más, el problema no es una ficha rara, es una
 * identidad de más o una cuenta metida en un club que no le toca.
 *
 * Y era la única de las cinco rutas del espejo sin una sola prueba. `modules/sync`
 * tenía el controlador con sus dos rutas y solo la de `acceso` probada.
 *
 * ── Los tres invariantes, que son de clases distintas ──
 *
 * 1. **La puerta.** Sin `ECOSYSTEM_SYNC_SECRET` la ruta NO EXISTE (404, no 401):
 *    una ruta sin autenticar que crea cuentas y las mete en clubes no puede
 *    quedarse abierta «por si acaso». Y ni un solo toque a la base antes de
 *    comprobarla.
 * 2. **No se crea nada a ciegas.** Ni la organización que no está enlazada, ni
 *    una cuenta con un rol que aquí no existe. `owner` se rechaza a propósito:
 *    el mando de un club no se reparte por una ruta de servidor a servidor.
 * 3. **Un alta fallida NO devuelve 200.** Es el invariante que sostiene el
 *    contador `fichas_sueltas`: Membresías crea su ficha con el `ecoSub` que
 *    devuelve esta respuesta, así que una respuesta buena sin `ecoSub` —o un
 *    error tragado— es exactamente cómo nace una ficha suelta.
 */

jest.mock('../../db', () => ({ db: {} }));

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncController } from './sync.controller';
import { db } from '../../db';
import type { OrganizationsService } from '../organizations/organizations.service';

const SECRETO = 'secreto-del-espejo';
const CLUB = '33333333-3333-4333-8333-333333333333';
const NUEVO = '11111111-1111-4111-8111-111111111111';
const MAESTRO = '22222222-2222-4222-8222-222222222222';

/** Lo que `inviteMember` contesta cuando todo va bien. */
const INVITACION = {
  miembro: { userId: NUEVO },
  cuenta: { creada: true, tieneContrasena: false },
  invitacion: { enlace: 'https://dinamyt.org/poner-contrasena?t=xyz' },
};

/**
 * `db` de mentira y servicio de mentira.
 *
 * `orgEncontrada` decide si el club existe aquí; `llamadas` guarda con qué
 * argumentos se pidió la invitación —que es donde se ve si el rol llegó
 * traducido— y `verbos`, si se tocó la base antes de la puerta.
 */
function armar(
  opciones: {
    orgEncontrada?: boolean;
    invitar?: () => Promise<typeof INVITACION>;
  } = {},
) {
  const { orgEncontrada = true, invitar } = opciones;
  const verbos: string[] = [];
  const llamadas: unknown[][] = [];

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'where', 'limit', 'returning']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  for (const verbo of ['select', 'update', 'insert', 'delete']) {
    fake[verbo] = () => {
      verbos.push(verbo);
      return encadenar(() => (orgEncontrada ? [{ id: CLUB }] : []));
    };
  }

  const servicio = {
    inviteMember: (...args: unknown[]) => {
      llamadas.push(args);
      return invitar ? invitar() : Promise.resolve(INVITACION);
    },
  } as unknown as OrganizationsService;

  return { controlador: new SyncController(servicio), verbos, llamadas };
}

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  ecoOrgId: CLUB,
  email: 'alumno@nuevo.com',
  fullName: 'ALUMNO NUEVO',
  role: 'student',
  invitadoPor: MAESTRO,
  ...extra,
});

describe('POST /sync/alta · Membresías inscribe a alguien en su club', () => {
  let secretoOriginal: string | undefined;
  beforeEach(() => {
    secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  });
  afterEach(() => {
    if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
    else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
  });

  // ── 1 · La puerta ──────────────────────────────────────────────────────────

  it('sin el secreto configurado la ruta no existe, y no toca la base', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { controlador, verbos, llamadas } = armar();

    await expect(controlador.alta(SECRETO, cuerpo())).rejects.toThrow(
      NotFoundException,
    );
    expect(verbos).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  it('sin cabecera no crea nada', async () => {
    const { controlador, verbos, llamadas } = armar();

    await expect(controlador.alta(undefined, cuerpo())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verbos).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  it('con el secreto equivocado tampoco', async () => {
    const { controlador, verbos, llamadas } = armar();

    await expect(controlador.alta('otro-cualquiera', cuerpo())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verbos).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  it('un secreto del mismo largo pero distinto no pasa', async () => {
    // La comparación es en tiempo constante y exige el mismo largo; esta es la
    // que comprobaría que no se colara por la puerta de la longitud.
    const { controlador, llamadas } = armar();
    const mismoLargo = 'x'.repeat(SECRETO.length);

    await expect(controlador.alta(mismoLargo, cuerpo())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(llamadas).toEqual([]);
  });

  // ── 2 · No se crea nada a ciegas ───────────────────────────────────────────

  it('sin `ecoOrgId` se rechaza: no hay club al que sumar a nadie', async () => {
    const { controlador, llamadas } = armar();

    await expect(
      controlador.alta(SECRETO, cuerpo({ ecoOrgId: '' })),
    ).rejects.toThrow(BadRequestException);
    expect(llamadas).toEqual([]);
  });

  it('si el club no está enlazado aquí, se dice qué hacer en vez de crearlo', async () => {
    // Crear la organización a ciegas desde un alta sería peor que negarse: se
    // acabaría con clubes fantasma que nadie administra.
    const { controlador, llamadas } = armar({ orgEncontrada: false });

    await expect(controlador.alta(SECRETO, cuerpo())).rejects.toThrow(
      /Enlázalo antes de dar de alta/,
    );
    expect(llamadas).toEqual([]);
  });

  it('un rol que aquí no existe se rechaza y no crea la cuenta', async () => {
    const { controlador, llamadas } = armar();

    await expect(
      controlador.alta(SECRETO, cuerpo({ role: 'inventado' })),
    ).rejects.toThrow(BadRequestException);
    expect(llamadas).toEqual([]);
  });

  it('`owner` NO viaja por esta puerta, y es a propósito', async () => {
    // El dueño de un club no se da de alta a sí mismo desde el formulario de
    // alumnos. Dejarlo pasar sería repartir el mando de un club por una ruta
    // de servidor a servidor, sin nadie mirando.
    const { controlador, llamadas } = armar();

    await expect(
      controlador.alta(SECRETO, cuerpo({ role: 'owner' })),
    ).rejects.toThrow(BadRequestException);
    expect(llamadas).toEqual([]);
  });

  // ── 3 · El alta buena ──────────────────────────────────────────────────────

  it('devuelve el `ecoSub`, que es lo que hace que la ficha nazca enlazada', async () => {
    const { controlador } = armar();

    const r = await controlador.alta(SECRETO, cuerpo());

    expect(r).toEqual({
      ecoSub: NUEVO,
      cuenta: INVITACION.cuenta,
      invitacion: INVITACION.invitacion,
    });
  });

  it('es la MISMA invitación del maestro: mismo rol, mismo enlace, sin contraseña', async () => {
    const { controlador, llamadas } = armar();

    await controlador.alta(SECRETO, cuerpo());

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toEqual([
      CLUB,
      'alumno@nuevo.com',
      'student',
      MAESTRO,
      { fullName: 'ALUMNO NUEVO', phone: undefined },
    ]);
  });

  it('sin `role` cae a alumno, que es el que no hace daño', async () => {
    const { controlador, llamadas } = armar();

    await controlador.alta(SECRETO, cuerpo({ role: undefined }));

    expect((llamadas[0] as unknown[])[2]).toBe('student');
  });

  it('`staff` y `guardian` pasan, que son los otros dos que Membresías manda', async () => {
    for (const rol of ['staff', 'guardian']) {
      const { controlador, llamadas } = armar();
      await controlador.alta(SECRETO, cuerpo({ role: rol }));
      expect((llamadas[0] as unknown[])[2]).toBe(rol);
    }
  });

  it('sin `invitadoPor` sigue funcionando: la trazabilidad es deseable, no obligatoria', async () => {
    const { controlador, llamadas } = armar();

    await controlador.alta(SECRETO, cuerpo({ invitadoPor: null }));

    expect((llamadas[0] as unknown[])[3]).toBeUndefined();
  });

  // ── 4 · Un alta fallida no deja ficha suelta ───────────────────────────────

  it('si la invitación falla, el error SALE: no se contesta 200 sin `ecoSub`', async () => {
    // Éste es el invariante que vigila `ensayo.sh sueltas`. Membresías crea su
    // ficha con el `ecoSub` de esta respuesta; si el fallo se tragara y
    // devolviéramos algo con forma de éxito, allá nacería una ficha sin cuenta
    // detrás — y ninguno de los cuatro avisos del espejo la alcanzaría nunca.
    const { controlador } = armar({
      invitar: () => Promise.reject(new BadRequestException('Correo inválido.')),
    });

    await expect(controlador.alta(SECRETO, cuerpo())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('el motivo del fallo llega tal cual, para que el maestro lo lea', async () => {
    // Un «no se pudo» genérico obliga a mirar el log del servidor para saber
    // que el correo estaba repetido. El maestro tiene al alumno delante.
    const { controlador } = armar({
      invitar: () =>
        Promise.reject(new BadRequestException('Ese correo ya está en otro club.')),
    });

    await expect(controlador.alta(SECRETO, cuerpo())).rejects.toThrow(
      /ya está en otro club/,
    );
  });
});
