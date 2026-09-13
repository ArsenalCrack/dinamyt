/**
 * Cambiar el rol general **borra los roles por app**, y esa línea es el arreglo.
 *
 * ── El fallo, que no daba ningún error ──
 *
 * `role_membresias`, `role_campeonatos` y `role_academy` mandan sobre el rol
 * general (`common/roles-por-app.ts`), y la reconciliación del 29 de agosto las
 * dejó escritas para las 46 personas que importó. Con `role_membresias` puesto
 * en `student`, cambiar el general a `maestro` **no cambiaba absolutamente
 * nada**: el pase seguía llevando `student`, el aviso a Membresías contestaba
 * «ya lo tenía», y el panel enseñaba la insignia vieja al lado del rol nuevo,
 * contradiciéndose sin que nadie lo dijera.
 *
 * Se prueba mirando lo que llega al `UPDATE`, que es lo único que importa aquí:
 * si esas tres columnas no se vacían, el resto de la cadena da igual.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES del
// servicio, no las consultas. Mismo truco que `ultimo-gestor.spec.ts`.
jest.mock('../../db', () => ({ db: {} }));
// El espejo sale a la red; aquí solo interesa CON QUÉ se le llama.
jest.mock('../../common/espejo-membresias', () => ({
  espejarClub: jest.fn(),
  espejarRol: jest.fn(),
}));

import { OrganizationsService } from './organizations.service';
import { OrgNotificationsService } from './org-notifications.service';
import { espejarRol } from '../../common/espejo-membresias';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from '../auth/jwt.service';
import type { MailerService } from '../auth/mailer.service';

const CLUB = '33333333-3333-4333-8333-333333333333';
const ALUMNO = '11111111-1111-4111-8111-111111111111';

/**
 * `db` de mentira. Las lecturas van por una cola; `escrituras` guarda lo que se
 * le pasó a cada `.set()`, que es lo que se está comprobando.
 */
function armar(lecturas: unknown[][], devuelveUpdate: unknown[]) {
  const cola = [...lecturas];
  const escrituras: Record<string, unknown>[] = [];

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'where', 'limit', 'returning', 'orderBy']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.set = (valores: Record<string, unknown>) => {
      escrituras.push(valores);
      return eslabon;
    };
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => encadenar(() => cola.shift() ?? []);
  fake.update = () => encadenar(() => devuelveUpdate);

  const service = new OrganizationsService(
    {} as UsersService,
    {} as JwtTokenService,
    {} as MailerService,
    // La campana del club. Estos tests miden lo que se ESCRIBE en la base, y
    // un aviso no es una escritura de las que vigilan: se sustituye por uno
    // que no hace nada para que no cuente ni pida una base de verdad.
    avisosDeMentira(),
  );
  return { service, escrituras };
}

/**
 * Lo que lee `updateMemberRole`, en orden: la fila del miembro (para la regla
 * del mando), y después el correo de la cuenta para el aviso. La regla corta
 * antes de mirar el club porque `student` no manda en nada.
 */
const lecturas = [[{ role: 'student' }], [{ email: 'alguien@dinamyt.org' }]];

/** La fila que devuelve el UPDATE: ya con las columnas de app vacías. */
const filaActualizada = [
  {
    role: 'maestro',
    roleMembresias: null,
    roleCampeonatos: null,
    roleAcademy: null,
  },
];

/** Una campana que no hace nada: estos tests no la ejercitan. */
function avisosDeMentira(): OrgNotificationsService {
  return {
    avisar: async () => {},
    resolverPor: async () => {},
  } as unknown as OrgNotificationsService;
}

describe('Cambiar el rol general', () => {
  beforeEach(() => (espejarRol as jest.Mock).mockClear());

  it('vacía los tres roles por app', async () => {
    const { service, escrituras } = armar(lecturas, filaActualizada);
    await service.updateMemberRole(CLUB, ALUMNO, 'maestro');

    // ESTO es el arreglo. Sin las tres en `null`, el rol viejo de cada app
    // sigue mandando y el cambio no se nota en ninguna parte.
    expect(escrituras[0]).toEqual({
      role: 'maestro',
      roleMembresias: null,
      roleCampeonatos: null,
      // La lista de Campeonatos (F1) es la misma excepción en plural: si no se
      // vaciara, el rol nuevo no llegaría a Campeonatos.
      rolesCampeonatos: [],
      roleAcademy: null,
    });
  });

  it('a Membresías le llega el rol TRADUCIDO, no el del portal', async () => {
    const { service } = armar(lecturas, filaActualizada);
    await service.updateMemberRole(CLUB, ALUMNO, 'maestro');

    // `maestro` no existe en el catálogo de Membresías: allí esa persona es el
    // dueño de su club. Y va el correo, que es lo que rescata a la ficha que
    // nunca se enlazó con el ecosistema.
    expect(espejarRol).toHaveBeenCalledWith(
      ALUMNO,
      'owner',
      'alguien@dinamyt.org',
    );
  });

  it('un rol sin equivalente en Membresías no se manda', async () => {
    const { service } = armar(lecturas, [
      { role: 'judge', roleMembresias: null, roleCampeonatos: null, roleAcademy: null },
    ]);
    await service.updateMemberRole(CLUB, ALUMNO, 'judge');

    // El juez es de la federación y no es nada dentro de un club. `espejarRol`
    // recibe `null` y no manda nada: mejor callarse que degradar al azar.
    expect(espejarRol).toHaveBeenCalledWith(ALUMNO, null, 'alguien@dinamyt.org');
  });
});

/**
 * Los papeles de alguien en Campeonatos, marcados en casillas (F1).
 *
 * Lo que importa probar es el reparto: las casillas no pueden dar nada que el
 * desplegable de rol de al lado no pudiera ya dar, y a la vez no pueden
 * obligar a quitarle a nadie lo que ya tenía.
 */
describe('Fijar los papeles en Campeonatos', () => {
  const GESTOR = '22222222-2222-4222-8222-222222222222';
  const ES_CLUB = [{ type: 'CLUB' }];
  const ES_FEDERACION = [{ type: 'FEDERATION' }];
  const alumno = [
    { role: 'competitor', roleCampeonatos: null, rolesCampeonatos: [] },
  ];
  /** La fila que devolvería el UPDATE con esa lista puesta. */
  const queda = (role: string, lista: string[]) => [
    { role, roleCampeonatos: lista[0] ?? null, rolesCampeonatos: lista },
  ];

  it('un club le da a su alumno también el papel de maestro', async () => {
    const { service, escrituras } = armar(
      [ES_CLUB, alumno],
      queda('competitor', ['maestro', 'competitor']),
    );
    const r = await service.fijarRolesCampeonatos(
      CLUB,
      ALUMNO,
      ['competitor', 'maestro'],
      GESTOR,
    );

    // La lista, ordenada; y el singular, el de mayor rango, que es lo que
    // Campeonatos sigue leyendo hasta que sepa leer la lista.
    expect(escrituras[0]).toEqual({
      rolesCampeonatos: ['maestro', 'competitor'],
      roleCampeonatos: 'maestro',
    });
    expect(r.papelesCampeonatos).toEqual(['maestro', 'competitor']);
  });

  it('repetir lo que ya da su rol general no deja excepción', async () => {
    const { service, escrituras } = armar([ES_CLUB, alumno], queda('competitor', []));
    await service.fijarRolesCampeonatos(CLUB, ALUMNO, ['competitor'], GESTOR);

    // La regla de la 0020: una excepción que dice lo mismo que el general es
    // ruido, y deja a la persona marcada distinto a las demás.
    expect(escrituras[0]).toEqual({ rolesCampeonatos: [], roleCampeonatos: null });
  });

  it('sin marcar nada, vuelve a valer su rol general', async () => {
    const { service, escrituras } = armar(
      [ES_CLUB, [{ role: 'competitor', roleCampeonatos: 'maestro', rolesCampeonatos: ['maestro'] }]],
      queda('competitor', []),
    );
    const r = await service.fijarRolesCampeonatos(CLUB, ALUMNO, [], GESTOR);

    expect(escrituras[0]).toEqual({ rolesCampeonatos: [], roleCampeonatos: null });
    expect(r.papelesCampeonatos).toEqual(['competitor']);
  });

  it('un club no da jueces', async () => {
    const { service, escrituras } = armar([ES_CLUB, alumno], []);

    await expect(
      service.fijarRolesCampeonatos(CLUB, ALUMNO, ['competitor', 'judge'], GESTOR),
    ).rejects.toThrow(/un club da maestros/i);
    expect(escrituras).toHaveLength(0);
  });

  it('pero no obliga a quitarle el de juez a quien ya lo tenía', async () => {
    // Llegó con `judge` por la reconciliación. Su club le marca «maestro», y el
    // de juez sigue marcado: eso no es DAR un juez, es no quitarlo.
    const juezDeAntes = [
      { role: 'competitor', roleCampeonatos: 'judge', rolesCampeonatos: ['judge'] },
    ];
    const { service, escrituras } = armar(
      [ES_CLUB, juezDeAntes],
      queda('competitor', ['maestro', 'judge']),
    );
    await service.fijarRolesCampeonatos(CLUB, ALUMNO, ['judge', 'maestro'], GESTOR);

    expect(escrituras[0]).toEqual({
      rolesCampeonatos: ['maestro', 'judge'],
      roleCampeonatos: 'maestro',
    });
  });

  it('la federación sí da jueces y administradores', async () => {
    const juez = [{ role: 'judge', roleCampeonatos: null, rolesCampeonatos: [] }];
    const { service, escrituras } = armar(
      [ES_FEDERACION, juez],
      queda('judge', ['admin', 'judge']),
    );
    await service.fijarRolesCampeonatos(CLUB, ALUMNO, ['judge', 'admin'], GESTOR);

    expect(escrituras[0]).toEqual({
      rolesCampeonatos: ['admin', 'judge'],
      roleCampeonatos: 'admin',
    });
  });

  it('y no da maestros: esos los da cada club', async () => {
    const juez = [{ role: 'judge', roleCampeonatos: null, rolesCampeonatos: [] }];
    const { service, escrituras } = armar([ES_FEDERACION, juez], []);

    await expect(
      service.fijarRolesCampeonatos(CLUB, ALUMNO, ['maestro'], GESTOR),
    ).rejects.toThrow(/una organización da administradores y jueces/i);
    expect(escrituras).toHaveLength(0);
  });

  it('lo que no es un papel de Campeonatos se rechaza antes de mirar nada', async () => {
    const { service, escrituras } = armar([], []);

    await expect(
      service.fijarRolesCampeonatos(CLUB, ALUMNO, ['sensei'], GESTOR),
    ).rejects.toThrow(/no es un papel de Campeonatos/);
    expect(escrituras).toHaveLength(0);
  });

  it('nadie se cambia sus propios papeles', async () => {
    const { service, escrituras } = armar([], []);

    await expect(
      service.fijarRolesCampeonatos(CLUB, GESTOR, ['admin'], GESTOR),
    ).rejects.toThrow(/no los cambias tú/);
    expect(escrituras).toHaveLength(0);
  });
});
