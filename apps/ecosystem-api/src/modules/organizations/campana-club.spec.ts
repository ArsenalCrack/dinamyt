/**
 * La campana de quien lleva un club: a quién se le avisa, y cuándo deja de
 * haber algo que avisar.
 *
 * ── Lo que se rompía sin esto ──
 *
 * Un club funciona por cosas que pasan cuando su maestro no está mirando.
 * Alguien tecleaba el código y se quedaba esperando; la bandeja de solicitudes
 * existía pero **había que acordarse de abrirla**, y la persona leía «te
 * avisamos cuando tu maestro responda» sin que ese aviso existiera en ninguna
 * parte. Se han quedado solicitudes días ahí dentro.
 *
 * ── Las dos reglas que hacen que la campana sirva, y por qué se prueban ──
 *
 * Las dos son fáciles de romper sin que nadie se entere, porque romperlas no
 * da ningún error: la campana sigue apareciendo, solo que llena de ruido o de
 * cosas ya hechas. Y una campana en la que no se puede confiar es peor que no
 * tener campana — se deja de mirar, y con ella se pierde la que sí importaba.
 *
 *   1. **A quien lo hizo no se le avisa.** Si no, el maestro que más trabaja es
 *      el que más ruido tiene en su campana.
 *   2. **Lo que ya está hecho desaparece**, y desaparece para TODOS los
 *      gestores, no solo para el que respondió.
 *
 * ── Por qué la base es de mentira ──
 *
 * Lo que se prueba aquí son decisiones —a quién se le escribe, con qué filtro
 * se resuelve—, no consultas. Mismo truco que `cambiar-rol.spec.ts`.
 */

jest.mock('../../db', () => ({ db: {} }));

import { OrgNotificationsService } from './org-notifications.service';
import {
  destinoDelAviso,
  textoDelAviso,
  AVISOS_RESOLUBLES,
} from '../../common/avisos-org';
import { db } from '../../db';

const CLUB = '33333333-3333-4333-8333-333333333333';
const MAESTRO = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const ALUMNO = '44444444-4444-4444-8444-444444444444';
const SOLICITUD = '55555555-5555-4555-8555-555555555555';
const AVISO = '66666666-6666-4666-8666-666666666666';

/**
 * Los UUID que hay dentro de un filtro de Drizzle.
 *
 * Un `and(...)` es un árbol de objetos con referencias circulares —cada columna
 * apunta a su tabla y la tabla a sus columnas—, así que `JSON.stringify` no
 * sirve: revienta. Esto lo recorre con un registro de visitados y se queda con
 * los valores que tienen forma de identificador, que es lo único que hace falta
 * para contestar «¿está este usuario dentro del filtro?».
 */
function idsEn(filtro: unknown): string[] {
  const vistos = new Set<unknown>();
  const encontrados: string[] = [];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  (function recorrer(v: unknown) {
    if (typeof v === 'string') {
      if (UUID.test(v)) encontrados.push(v);
      return;
    }
    if (!v || typeof v !== 'object' || vistos.has(v)) return;
    vistos.add(v);
    for (const hijo of Object.values(v as Record<string, unknown>)) recorrer(hijo);
  })(filtro);

  return encontrados;
}

/**
 * `db` de mentira. `filtros` guarda lo que se le pasó a cada `.where()` y
 * `escritas`, las filas de cada `.values()`: entre las dos está todo lo que
 * este servicio decide.
 */
function armar(
  gestores: { userId: string }[],
  /**
   * Lo que devuelve un `UPDATE … RETURNING`. Es lo que separa «marcado» de «ya
   * estaba leído», así que las pruebas de marcar necesitan decidirlo: con la
   * lista vacía, la fila no existía o ya tenía fecha.
   */
  actualizadas: { id: string }[] = [],
) {
  const filtros: unknown[] = [];
  const escritas: Record<string, unknown>[][] = [];
  const puestos: Record<string, unknown>[] = [];

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'limit', 'orderBy', 'innerJoin', 'leftJoin', 'returning']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.where = (f: unknown) => {
      filtros.push(f);
      return eslabon;
    };
    eslabon.values = (filas: Record<string, unknown>[]) => {
      escritas.push(filas);
      return eslabon;
    };
    eslabon.set = (v: Record<string, unknown>) => {
      puestos.push(v);
      return eslabon;
    };
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => encadenar(() => gestores);
  fake.insert = () => encadenar(() => []);
  fake.update = () => encadenar(() => actualizadas);

  return { servicio: new OrgNotificationsService(), filtros, escritas, puestos };
}

describe('La campana del club · a quién se le avisa', () => {
  it('escribe un aviso por cada gestor del club', async () => {
    const { servicio, escritas } = armar([{ userId: MAESTRO }, { userId: ADMIN }]);

    await servicio.avisar({
      orgId: CLUB,
      kind: 'solicitud_entrada',
      entityId: SOLICITUD,
      subjectUserId: ALUMNO,
      actorUserId: ALUMNO,
      data: { fullName: 'Ana Pérez' },
    });

    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toHaveLength(2);
    expect(escritas[0].map((f) => f.userId)).toEqual([MAESTRO, ADMIN]);
    // Y cada fila lleva con qué escribir la frase sin volver a la base.
    expect(escritas[0][0]).toMatchObject({
      orgId: CLUB,
      kind: 'solicitud_entrada',
      entityId: SOLICITUD,
      subjectUserId: ALUMNO,
      data: { fullName: 'Ana Pérez' },
    });
  });

  /**
   * La regla 1, mirada desde el único sitio donde se puede comprobar: el filtro
   * con el que se piden los gestores. Con `actorUserId` puesto, ese usuario
   * tiene que estar DENTRO del filtro —es el `ne(...)` que lo excluye—; sin
   * actor, el filtro no menciona a nadie.
   */
  it('a quien lo hizo no se le avisa: su id entra en el filtro para dejarlo fuera', async () => {
    const conActor = armar([{ userId: ADMIN }]);
    await conActor.servicio.avisar({
      orgId: CLUB,
      kind: 'miembro_baja',
      subjectUserId: ALUMNO,
      actorUserId: MAESTRO,
    });
    expect(idsEn(conActor.filtros[0])).toContain(MAESTRO);

    const sinActor = armar([{ userId: MAESTRO }, { userId: ADMIN }]);
    await sinActor.servicio.avisar({
      orgId: CLUB,
      kind: 'miembro_baja',
      subjectUserId: ALUMNO,
      actorUserId: null,
    });
    expect(idsEn(sinActor.filtros[0])).not.toContain(MAESTRO);
    // Y el club sí está en los dos: es de lo que se está preguntando.
    expect(idsEn(sinActor.filtros[0])).toContain(CLUB);
  });

  it('un club sin gestores no escribe nada y no revienta', async () => {
    const { servicio, escritas } = armar([]);
    await servicio.avisar({ orgId: CLUB, kind: 'miembro_nuevo', subjectUserId: ALUMNO });
    expect(escritas).toHaveLength(0);
  });

  /**
   * Escribir un aviso va DETRÁS de la acción de verdad (aceptar a alguien,
   * darlo de baja) y no puede tumbarla. Si esto lanzara, el maestro vería un
   * 500 al aceptar a un alumno que en realidad ya está aceptado.
   */
  it('si la base falla, se pierde el aviso y no la acción', async () => {
    const fake = db as unknown as Record<string, unknown>;
    fake.select = () => {
      throw new Error('la base se cayó');
    };
    const servicio = new OrgNotificationsService();
    await expect(
      servicio.avisar({ orgId: CLUB, kind: 'miembro_nuevo', subjectUserId: ALUMNO }),
    ).resolves.toBeUndefined();
  });
});

describe('La campana del club · lo que ya está hecho desaparece', () => {
  it('resolver marca la fecha y filtra por la solicitud, no por quién respondió', async () => {
    const { servicio, puestos, filtros } = armar([]);
    await servicio.resolverPor(SOLICITUD);

    expect(puestos).toHaveLength(1);
    expect(puestos[0].resolvedAt).toBeInstanceOf(Date);
    // Un solo `where`, y sin `userId` dentro: el aviso se apaga para los tres
    // administradores del club. Si llevara el usuario, los otros dos seguirían
    // viendo un rojo por algo que ya está hecho.
    expect(filtros).toHaveLength(1);
    expect(idsEn(filtros[0])).toEqual([SOLICITUD]);
  });

  it('«alguien quiere entrar» es el único que se resuelve solo', () => {
    // Los demás son noticias —entró alguien, se fue alguien— y no piden nada:
    // se leen y se quedan. Si algún día otro tipo se vuelve resoluble, esto
    // obliga a decidirlo a propósito en vez de por descuido.
    expect(AVISOS_RESOLUBLES).toEqual(['solicitud_entrada']);
  });
});

/**
 * ── El número baja de uno en uno ────────────────────────────────────────────
 *
 * Abrir la campana marcaba TODO como leído. Quien tenía nueve avisos la abría
 * para mirar UNO —la solicitud que estaba esperando— y los otros ocho se iban
 * de la lista sin haberlos visto: `mios` no devuelve lo leído, así que no había
 * forma de recuperarlos. Y el número saltaba de 9 a 0 de un tirón.
 */
describe('La campana del club · se vacía de uno en uno', () => {
  it('marcar UNO filtra por el aviso Y por su dueño', async () => {
    const { servicio, puestos, filtros } = armar([], [{ id: AVISO }]);

    const r = await servicio.marcarLeido(MAESTRO, AVISO);

    expect(r).toEqual({ marcado: true });
    expect(puestos[0].readAt).toBeInstanceOf(Date);
    // Los DOS dentro del filtro. Sin el dueño, cualquiera con sesión podría
    // apagarle un aviso a otro gestor pasando un identificador que no es suyo.
    const dentro = idsEn(filtros[0]);
    expect(dentro).toContain(AVISO);
    expect(dentro).toContain(MAESTRO);
  });

  it('marcar algo que ya estaba leído devuelve false, no un error', async () => {
    // Pasa de verdad: dos toques seguidos, o la misma cuenta abierta en el
    // celular y en el portátil del club.
    const { servicio } = armar([]);
    await expect(servicio.marcarLeido(MAESTRO, AVISO)).resolves.toEqual({
      marcado: false,
    });
  });

  it('«marcar todo» sigue tocando solo los del propio usuario', async () => {
    const { servicio, filtros } = armar([], [{ id: AVISO }]);
    await servicio.marcarLeidos(MAESTRO);
    expect(idsEn(filtros[0])).toEqual([MAESTRO]);
  });
});

/**
 * ── Lo que se lee en la pantalla bloqueada ──────────────────────────────────
 *
 * El mismo aviso sale por dos sitios —la campana y el push— y tiene que decir
 * lo mismo en los dos. Lo que se prueba aquí es lo que separa un aviso útil de
 * uno que se aprende a ignorar: que diga QUIÉN, y de qué club.
 */
describe('La campana del club · la frase del aviso al celular', () => {
  it('dice quién y de qué club, sin tener que abrir la app', () => {
    expect(
      textoDelAviso('solicitud_entrada', { quien: 'Ana Pérez', club: 'Club Norte' }),
    ).toEqual({
      title: 'DINAMYT · Club Norte',
      body: 'Ana Pérez quiere entrar a tu club.',
    });
  });

  it('sin nombre no se queda mudo: dice «Alguien»', () => {
    const { body } = textoDelAviso('miembro_baja', { quien: null, club: 'Club Norte' });
    expect(body).toBe('Alguien salió de tu club.');
  });

  it('un tipo que no conoce tampoco se queda mudo', () => {
    // El día que se añada una clase de aviso y nadie toque esto, sale una frase
    // pobre pero cierta — no una notificación vacía.
    expect(textoDelAviso('lo_que_venga', { quien: 'Ana' }).body).toBe(
      'Hay una novedad en tu club.',
    );
  });
});

describe('La campana del club · a dónde lleva cada aviso', () => {
  it('la solicitud lleva a la bandeja donde se acepta', () => {
    expect(destinoDelAviso('solicitud_entrada', {})).toBe(
      '/mi-organizacion#solicitudes',
    );
  });

  it('alguien nuevo lleva a SU ficha', () => {
    expect(destinoDelAviso('miembro_nuevo', { subjectUserId: ALUMNO })).toBe(
      `/mi-organizacion/miembro/${ALUMNO}`,
    );
  });

  /**
   * Un tipo que no esté en el catálogo no puede salir sin enlace: una línea que
   * no lleva a ninguna parte se lee como que la aplicación se rompió. Cae al
   * panel de la organización, que siempre es un destino razonable.
   */
  it('un tipo desconocido cae en un destino que existe', () => {
    expect(destinoDelAviso('lo_que_sea', {})).toBe('/mi-organizacion');
  });
});
