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
