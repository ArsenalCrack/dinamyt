/**
 * El camino C (§2.1): entrar a un club tecleando su código.
 *
 * Lo que se prueba aquí es lo que se paga caro si se rompe:
 *
 *  · Que un código válido y uno inventado respondan LO MISMO cuando el club
 *    está suspendido. Si el mensaje cambia, el código se puede adivinar a
 *    fuerza de probar, y son solo ocho caracteres.
 *  · Que tecleando el código NADIE entre directo: queda en espera. El código
 *    viaja por WhatsApp y acaba donde no debe.
 *  · Que las letras que se confunden al dictarlo no existan en el alfabeto.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES del
// servicio, no las consultas. Va antes del import del servicio a propósito —
// `jest.mock` se eleva, pero el orden deja claro qué depende de qué.
jest.mock('../../db', () => ({ db: {} }));

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from '../auth/jwt.service';
import type { MailerService } from '../auth/mailer.service';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const CLUB = '22222222-2222-4222-8222-222222222222';

/**
 * Un `db.select()…` de mentira que devuelve, en orden, lo que se le diga.
 *
 * Drizzle encadena (`select().from().where().limit()`) y solo al final se
 * resuelve. Con que cada eslabón se devuelva a sí mismo y el objeto sea
 * `then`-able basta para el camino que recorren estos casos.
 */
function encadenar(resultados: unknown[][]) {
  const cola = [...resultados];
  const eslabon: Record<string, unknown> = {};
  for (const metodo of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'values', 'returning', 'set']) {
    eslabon[metodo] = () => eslabon;
  }
  eslabon.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(cola.shift() ?? []).then(resolver);
  return eslabon;
}

function armar(resultados: unknown[][]) {
  const fake = db as unknown as Record<string, unknown>;
  const cadena = encadenar(resultados);
  fake.select = () => cadena;
  fake.insert = () => cadena;
  fake.update = () => cadena;
  return new OrganizationsService(
    {} as UsersService,
    {} as JwtTokenService,
    {} as MailerService,
  );
}

describe('Código de club · pedir entrar', () => {
  it('un código que no existe no dice que no existe: dice lo mismo que uno suspendido', async () => {
    const service = armar([[]]);
    await expect(service.solicitarEntrada(USUARIO, 'ABCD2345')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('un club suspendido responde IGUAL que un código inventado', async () => {
    const service = armar([[{ id: CLUB, name: 'Dojang Sur', isActive: false }]]);
    // Mismo tipo y mismo texto: si aquí se colara un mensaje distinto, probar
    // códigos al azar diría cuáles son de verdad.
    await expect(service.solicitarEntrada(USUARIO, 'ABCD2345')).rejects.toThrow(
      /no corresponde a ningún club/i,
    );
  });

  it('sin código no se pregunta a la base siquiera', async () => {
    const service = armar([]);
    await expect(service.solicitarEntrada(USUARIO, '   ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('tecleando el código NADIE entra: queda en espera', async () => {
    const service = armar([
      [{ id: CLUB, name: 'Dojang Sur', isActive: true }], // el club
      [], // no es miembro
      [], // no tiene solicitud pendiente
      [{ id: 'sol-1', orgId: CLUB, userId: USUARIO, status: 'PENDIENTE' }],
    ]);

    const res = await service.solicitarEntrada(USUARIO, 'abcd-2345', 'entreno los martes');

    expect(res.estado).toBe('EN_ESPERA');
    expect(res.org).toEqual({ id: CLUB, name: 'Dojang Sur' });
  });

  it('quien ya es miembro no abre una solicitud que nadie quiere leer', async () => {
    const service = armar([
      [{ id: CLUB, name: 'Dojang Sur', isActive: true }],
      [{ id: 'miembro-1' }],
    ]);

    const res = await service.solicitarEntrada(USUARIO, 'ABCD2345');

    expect(res.estado).toBe('YA_ERES_MIEMBRO');
  });

  it('pulsar dos veces no duplica la solicitud', async () => {
    const service = armar([
      [{ id: CLUB, name: 'Dojang Sur', isActive: true }],
      [], // no es miembro
      [{ id: 'sol-1' }], // ya hay una en espera
    ]);

    const res = await service.solicitarEntrada(USUARIO, 'ABCD2345');

    expect(res.estado).toBe('YA_SOLICITADO');
  });

  it('el código se teclea como sea: minúsculas, guiones y espacios sobran', async () => {
    // Cuatro escrituras de lo mismo tienen que llegar idénticas a la consulta.
    const normalizar = (
      OrganizationsService as unknown as {
        normalizarCodigo: (v: string) => string;
      }
    ).normalizarCodigo;

    for (const escrito of ['abcd2345', 'ABCD-2345', ' abcd 2345 ', 'AbCd-23 45']) {
      expect(normalizar(escrito)).toBe('ABCD2345');
    }
  });
});

describe('Código de club · cómo se genera', () => {
  const alfabeto = (
    OrganizationsService as unknown as { ALFABETO_CODIGO: string }
  ).ALFABETO_CODIGO;

  it('no contiene las letras que se confunden al dictarlo en voz alta', () => {
    // I/1 y O/0 son el mismo garabato en un cartel del dojang, y quien lo
    // teclea mal no ve un error suyo: ve que la aplicación no funciona.
    for (const confusa of ['I', 'O', '0', '1']) {
      expect(alfabeto).not.toContain(confusa);
    }
  });

  it('son ocho caracteres, todos del alfabeto', () => {
    const service = armar([]);
    const generar = (
      service as unknown as { generarCodigo: () => string }
    ).generarCodigo.bind(service);

    for (let i = 0; i < 50; i++) {
      const codigo = generar();
      expect(codigo).toHaveLength(8);
      expect(codigo).toMatch(new RegExp(`^[${alfabeto}]{8}$`));
    }
  });
});
