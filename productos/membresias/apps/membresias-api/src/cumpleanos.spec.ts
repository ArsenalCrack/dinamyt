import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { memberships, notifications, scheduleExceptions, users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';
import { diaDeCelebracion, nacimientosQueSeCelebran } from './lib/cumpleanos';
import { felicitacion, resumenParaElClub } from './lib/notifications';
import { vigentes } from './routes/notifications';

/**
 * La fecha de nacimiento y el aviso de cumpleaños.
 *
 * Lo que este archivo defiende es la regla asimétrica del campo, que es la
 * única parte de la ficha que se comporta así: **el alumno la puede poner, pero
 * no volver a tocarla**. Se le deja rellenarla porque él es quien mejor sabe
 * cuándo nació —y así el club no acaba con media ficha vacía—, pero una vez
 * escrita decide qué día lo felicita el club, y eso no puede quedar al alcance
 * de quien tenga una tarde aburrida.
 */

/** El «hoy» del test tiene que ser el mismo que el de la API. Ver `todayStr`. */
const hoy = todayStr;

/** Una fecha con el mismo mes y día que hoy, `anos` años atrás. */
function mismoDiaHaceAnos(anos: number): string {
  const h = hoy();
  return `${Number(h.slice(0, 4)) - anos}${h.slice(4)}`;
}

describe('membresias-api — fecha de nacimiento y cumpleaños', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  async function ponerMiFecha(userId: string, birthDate: string | null) {
    return e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(userId),
      payload: { birthDate },
    });
  }

  it('el alumno pone su fecha una vez; la segunda ya no es suya', async () => {
    const primera = await ponerMiFecha(e.ids.alumno, '2005-03-14');
    expect(primera.statusCode).toBe(200);
    expect(primera.json().birthDate).toBe('2005-03-14');

    // Y aquí está la regla. No es un 422 de validación: la fecha es
    // perfectamente válida, lo que ya no es suyo es el permiso.
    const segunda = await ponerMiFecha(e.ids.alumno, '1999-01-01');
    expect(segunda.statusCode).toBe(403);
    expect(segunda.json().error).toMatch(/maestro/i);

    const [fila] = await e.db
      .select({ birthDate: users.birthDate })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(fila.birthDate).toBe('2005-03-14');
  });

  it('el maestro sí la corrige, que es de lo que sirve la regla', async () => {
    await ponerMiFecha(e.ids.alumno, '2005-03-14');

    const r = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { birthDate: '2005-04-14' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().birthDate).toBe('2005-04-14');
  });

  it('el auxiliar no la toca: lleva el día a día, no corrige documentos', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.staff),
      payload: { birthDate: '2005-03-14' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('el maestro sí puede rehacer la suya propia', async () => {
    // Por encima de él solo está el superadmin, y no se le va a molestar por
    // una fecha mal tecleada.
    expect((await ponerMiFecha(e.ids.owner, '1988-06-02')).statusCode).toBe(200);
    const otra = await ponerMiFecha(e.ids.owner, '1988-06-03');
    expect(otra.statusCode).toBe(200);
    expect(otra.json().birthDate).toBe('1988-06-03');
  });

  it('no se acepta una fecha del futuro ni una de 1899', async () => {
    // El tope de abajo importa tanto como el de arriba: la validación de fechas
    // por defecto arranca en el año 2000, que en un campo de nacimiento dejaría
    // fuera a cualquiera que pase de los veintiséis.
    const manana = new Date(`${hoy()}T00:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const futuro = await ponerMiFecha(e.ids.alumno, manana.toISOString().slice(0, 10));
    expect(futuro.statusCode).toBe(422);

    expect((await ponerMiFecha(e.ids.alumno, '1899-12-31')).statusCode).toBe(422);

    // Y una de los ochenta sí entra, que es lo que el tope por defecto rompía.
    expect((await ponerMiFecha(e.ids.alumno, '1985-07-20')).statusCode).toBe(200);
  });

  it('se puede inscribir a alguien SIN fecha de nacimiento', async () => {
    // Lo importante del campo es que no bloquea un alta: quien está de pie
    // delante del maestro no se queda sin inscribir porque nadie recuerde el año.
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'nuevo@club.com',
        fullName: 'Pedro Ramirez',
        password: 'Prueba1234',
        role: 'student',
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().birthDate).toBeNull();
  });

  it('el cumpleaños de hoy sale en el reporte, con los años que cumple', async () => {
    await e.db
      .update(users)
      .set({ birthDate: mismoDiaHaceAnos(12) })
      .where(eq(users.id, e.ids.alumno));

    const r = await e.app.inject({
      method: 'GET',
      url: '/reports/birthdays',
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(200);
    const lista = r.json();
    expect(lista).toHaveLength(1);
    expect(lista[0].userId).toBe(e.ids.alumno);
    expect(lista[0].cumple).toBe(12);
  });

  it('quien cumple otro día no sale, aunque sea el mismo día de otro mes', async () => {
    const h = hoy();
    // Mismo día, mes distinto: es el error que cometería una comparación por
    // día del mes en vez de por mes y día.
    const otroMes = `2010-${h.slice(5, 7) === '01' ? '02' : '01'}-${h.slice(8, 10)}`;
    await e.db
      .update(users)
      .set({ birthDate: otroMes })
      .where(eq(users.id, e.ids.alumno));

    const r = await e.app.inject({
      method: 'GET',
      url: '/reports/birthdays',
      headers: e.auth(e.ids.owner),
    });
    expect(r.json()).toEqual([]);
  });

  it('el cumpleaños del club de al lado no es asunto de este maestro', async () => {
    await e.db
      .update(users)
      .set({ birthDate: mismoDiaHaceAnos(20) })
      .where(eq(users.id, e.ids.alumnoAjeno));

    const r = await e.app.inject({
      method: 'GET',
      url: '/reports/birthdays',
      headers: e.auth(e.ids.owner),
    });
    expect(r.json()).toEqual([]);
  });

  it('el alumno no consulta los cumpleaños del club', async () => {
    const r = await e.app.inject({
      method: 'GET',
      url: '/reports/birthdays',
      headers: e.auth(e.ids.alumno),
    });
    expect(r.statusCode).toBe(403);
  });
});

/**
 * ── El 29 de febrero ─────────────────────────────────────────────────────────
 *
 * Lo prueba la función pura porque la API usa el «hoy» real y no se le puede
 * decir que hoy es 28 de febrero de 2027.
 */
describe('cumpleaños — qué día se celebra', () => {
  it('el 28 de febrero de un año no bisiesto celebra también a los del 29', () => {
    expect(nacimientosQueSeCelebran('2027-02-28')).toEqual(['02-28', '02-29']);
    expect(nacimientosQueSeCelebran('2028-02-28')).toEqual(['02-28']);
    expect(nacimientosQueSeCelebran('2028-02-29')).toEqual(['02-29']);
    // 2100 no es bisiesto aunque sea múltiplo de 4.
    expect(nacimientosQueSeCelebran('2100-02-28')).toEqual(['02-28', '02-29']);
  });

  it('en el calendario, el 29 de febrero cae el 28 los años que no existe', () => {
    expect(diaDeCelebracion('2004-02-29', 2027)).toBe('2027-02-28');
    expect(diaDeCelebracion('2004-02-29', 2028)).toBe('2028-02-29');
    expect(diaDeCelebracion('1990-12-31', 2026)).toBe('2026-12-31');
  });
});

/**
 * ── El aviso de cumpleaños ───────────────────────────────────────────────────
 *
 * Tres cosas: que llegue (al alumno su felicitación, al club en su campana),
 * que llegue UNA vez aunque se generen los avisos dos veces, y que se vaya
 * solo al día siguiente sin que nadie tenga que descartarlo.
 */
describe('cumpleaños — el aviso de la mañana', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  async function cumpleHoy(userId: string, anos = 12) {
    await e.db.update(users).set({ birthDate: mismoDiaHaceAnos(anos) }).where(eq(users.id, userId));
  }
  const generar = () =>
    e.app.inject({ method: 'POST', url: '/notifications/run', headers: e.auth(e.ids.owner) });

  it('el alumno recibe su felicitación en la campana, una sola vez', async () => {
    await e.db
      .insert(memberships)
      .values({ orgId: e.orgId, userId: e.ids.alumno, venceEl: '2099-12-31' });
    await cumpleHoy(e.ids.alumno);

    expect((await generar()).json().creados).toBe(1);
    // Dos pulsaciones del botón no son dos «feliz cumpleaños».
    expect((await generar()).json().creados).toBe(0);

    const suya = await e.app.inject({
      method: 'GET',
      url: '/notifications',
      headers: e.auth(e.ids.alumno),
    });
    expect(suya.json().map((a: { type: string }) => a.type)).toEqual(['cumple']);
  });

  it('y el club lo ve en su campana, con los años que cumple', async () => {
    await e.db
      .insert(memberships)
      .values({ orgId: e.orgId, userId: e.ids.alumno, venceEl: '2099-12-31' });
    await cumpleHoy(e.ids.alumno, 12);
    await generar();

    const club = await e.app.inject({
      method: 'GET',
      url: '/notifications?all=1',
      headers: e.auth(e.ids.owner),
    });
    const avisos = club.json();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ type: 'cumple', userId: e.ids.alumno });
    expect(avisos[0].birthDate).toBe(mismoDiaHaceAnos(12));
  });

  it('el auxiliar y el maestro no generan aviso: la campana del club es de sus alumnos', async () => {
    await e.db.insert(memberships).values([
      { orgId: e.orgId, userId: e.ids.staff, venceEl: '2099-12-31' },
      { orgId: e.orgId, userId: e.ids.owner, venceEl: '2099-12-31' },
    ]);
    await cumpleHoy(e.ids.staff);
    await cumpleHoy(e.ids.owner);
    expect((await generar()).json().creados).toBe(0);
  });

  it('quien tiene el acceso cortado no recibe felicitación del club', async () => {
    await e.db
      .insert(memberships)
      .values({ orgId: e.orgId, userId: e.ids.alumno, venceEl: '2099-12-31' });
    await cumpleHoy(e.ids.alumno);
    await e.db.update(users).set({ isActive: false }).where(eq(users.id, e.ids.alumno));
    expect((await generar()).json().creados).toBe(0);
  });

  it('el de ayer ya no se enseña, ni al alumno ni al club', async () => {
    const [m] = await e.db
      .insert(memberships)
      .values({ orgId: e.orgId, userId: e.ids.alumno, venceEl: '2099-12-31' })
      .returning();
    const ayer = new Date(`${hoy()}T00:00:00.000Z`);
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    await e.db.insert(notifications).values({
      userId: e.ids.alumno,
      membershipId: m.id,
      type: 'cumple',
      channel: 'inapp',
      scheduledFor: ayer,
      sentAt: ayer,
      status: 'ENVIADA',
    });

    for (const [quien, url] of [
      [e.ids.alumno, '/notifications'],
      [e.ids.owner, '/notifications?all=1'],
    ] as const) {
      const r = await e.app.inject({ method: 'GET', url, headers: e.auth(quien) });
      expect(r.json()).toEqual([]);
    }
    // Sigue en la base: se deja de ENSEÑAR, no se borra.
    const filas = await e.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, e.ids.alumno), eq(notifications.type, 'cumple')));
    expect(filas).toHaveLength(1);
  });

  it('`vigentes` deja un cumple solo el día para el que se escribió', () => {
    const hoyUtc = new Date(`${hoy()}T00:00:00.000Z`);
    const aviso = { type: 'cumple', venceEl: null, clasesRestantes: null };
    expect(vigentes([{ ...aviso, scheduledFor: hoyUtc }], hoy())).toHaveLength(1);
    expect(vigentes([{ ...aviso, scheduledFor: null }], hoy())).toHaveLength(0);
  });
});

describe('cumpleaños — lo que dicen los push', () => {
  it('la felicitación dice de parte de qué club, sin gritar el nombre del alumno', () => {
    expect(felicitacion('Club Central')).toBe(
      '¡Feliz cumpleaños! Todo Club Central te desea un gran día. 🎂',
    );
    expect(felicitacion(null)).toContain('Todo el club');
  });

  it('solo cumpleaños: el resumen del maestro los dice a ellos', () => {
    const r = resumenParaElClub([], 'Club Norte', [{ fullName: 'ANA PÉREZ', cumple: 12 }]);
    expect(r).toEqual({
      title: 'DINAMYT · Club Norte',
      body: '🎂 Hoy cumple años ANA PÉREZ (12).',
    });
  });

  it('con cobros pendientes, el cumpleaños va después y en plural si toca', () => {
    const r = resumenParaElClub([{ type: 'venc' }], null, [
      { fullName: 'ANA', cumple: 12 },
      { fullName: 'JUAN', cumple: 30 },
    ]);
    expect(r?.body).toBe(
      'Hoy: 1 alumno con la mensualidad vencida. 🎂 Cumplen años ANA (12) y JUAN (30).',
    );
  });

  it('más de tres nombres no caben en la pantalla bloqueada: se cuentan', () => {
    const gente = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ fullName: n, cumple: 10 }));
    expect(resumenParaElClub([], null, gente)?.body).toBe(
      '🎂 Hoy cumplen años A (10), B (10), C (10) y 2 más.',
    );
  });
});

/**
 * ── El calendario del mes ────────────────────────────────────────────────────
 */
describe('GET /calendar — el mes del club', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });
  const mes = () => hoy().slice(0, 7);
  const pedir = (userId: string, q = `?mes=${mes()}`) =>
    e.app.inject({ method: 'GET', url: `/calendar${q}`, headers: e.auth(userId) });

  it('trae los cumpleaños del mes de TODO el club, con el día y los años de este año', async () => {
    await e.db.update(users).set({ birthDate: mismoDiaHaceAnos(12) }).where(eq(users.id, e.ids.alumno));
    await e.db.update(users).set({ birthDate: mismoDiaHaceAnos(35) }).where(eq(users.id, e.ids.staff));
    // El del club de al lado, el mismo día: no es asunto de este maestro.
    await e.db
      .update(users)
      .set({ birthDate: mismoDiaHaceAnos(20) })
      .where(eq(users.id, e.ids.alumnoAjeno));

    const r = await pedir(e.ids.owner);
    expect(r.statusCode).toBe(200);
    const { cumpleanos } = r.json();
    expect(cumpleanos.map((c: { userId: string }) => c.userId).sort()).toEqual(
      [e.ids.alumno, e.ids.staff].sort(),
    );
    const delAlumno = cumpleanos.find((c: { userId: string }) => c.userId === e.ids.alumno);
    expect(delAlumno).toMatchObject({ fecha: hoy(), cumple: 12 });
  });

  it('trae los días cerrados y los vencimientos del mes, y los días que abre', async () => {
    await e.db.insert(scheduleExceptions).values({
      orgId: e.orgId,
      date: hoy(),
      isClosed: true,
      note: 'Festivo',
    });
    await e.db.insert(memberships).values([
      { orgId: e.orgId, userId: e.ids.alumno, venceEl: hoy() },
      // El auxiliar no es alumno: su membresía no se cobra.
      { orgId: e.orgId, userId: e.ids.staff, venceEl: hoy() },
    ]);

    const cuerpo = (await pedir(e.ids.owner)).json();
    expect(cuerpo.excepciones).toHaveLength(1);
    expect(cuerpo.excepciones[0]).toMatchObject({ date: hoy(), isClosed: true, note: 'Festivo' });
    expect(cuerpo.vencimientos).toHaveLength(1);
    expect(cuerpo.vencimientos[0]).toMatchObject({ fecha: hoy(), userId: e.ids.alumno });
    // El escenario abre los siete días.
    expect(cuerpo.abre).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('sin mes, el de hoy; con un mes que no existe, 422', async () => {
    expect((await pedir(e.ids.owner, '')).json().mes).toBe(mes());
    expect((await pedir(e.ids.owner, '?mes=2026-13')).statusCode).toBe(422);
    expect((await pedir(e.ids.owner, '?mes=hoy')).statusCode).toBe(422);
  });

  it('el alumno no ve el calendario del club: trae cumpleaños y cobros ajenos', async () => {
    expect((await pedir(e.ids.alumno)).statusCode).toBe(403);
  });

  it('el auxiliar sí: lleva el día a día', async () => {
    expect((await pedir(e.ids.staff)).statusCode).toBe(200);
  });
});
