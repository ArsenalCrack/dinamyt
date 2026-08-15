import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { attendances, clubSchedule, memberships } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';

/**
 * Las clases del club: horario propio, descripción, nota de la semana —y el
 * muro entre ellas.
 *
 * Lo que de verdad hay que demostrar aquí es lo último: **el alumno de una
 * clase no ve nada de la otra**. No basta con que la pantalla no lo dibuje; lo
 * que no puede es viajar. Por eso los asertos miran el JSON crudo de `GET /mi`
 * y no una vista montada.
 *
 * Y lo segundo, que es lo que se rompe sin querer: el club que NO divide sus
 * clases —que son casi todos— tiene que seguir comportándose exactamente igual
 * que antes de que esto existiera.
 */

const hoy = todayStr;

/** Día de la semana (0=domingo) de una fecha `YYYY-MM-DD`, en UTC. */
function diaDe(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

describe('membresias-api — clases del club', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  /** Crea una clase y devuelve su id. */
  async function crearClase(name: string, descripcion?: string) {
    const r = await e.app.inject({
      method: 'POST',
      url: '/schedule/groups',
      headers: e.auth(e.ids.owner),
      payload: { name, descripcion },
    });
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  }

  async function asignar(userId: string, groupId: string | null) {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${userId}`,
      headers: e.auth(e.ids.owner),
      payload: { groupId },
    });
    expect(r.statusCode).toBe(200);
    return r.json();
  }

  async function miPanel(userId: string) {
    const r = await e.app.inject({ method: 'GET', url: '/mi', headers: e.auth(userId) });
    expect(r.statusCode).toBe(200);
    return r.json();
  }

  /** Pone el horario del club entero, reemplazando el del escenario. */
  async function ponerHorario(dias: unknown[]) {
    const r = await e.app.inject({
      method: 'PUT',
      url: '/schedule',
      headers: e.auth(e.ids.owner),
      payload: { dias },
    });
    expect(r.statusCode).toBe(200);
  }

  it('el alumno de una clase no ve NADA de la otra', async () => {
    const manana = await crearClase('Infantil', 'Niños de 6 a 12 años');
    const tarde = await crearClase('Adultos', 'De cinturón azul en adelante');
    await asignar(e.ids.alumno, manana);
    await asignar(e.ids.alumno2, tarde);

    // Cada clase entrena días distintos, que es lo que hace la diferencia
    // observable: lunes la de la mañana, martes la de la tarde.
    await ponerHorario([
      { groupId: manana, weekday: 1, opensAt: '16:00', closesAt: '17:00' },
      { groupId: tarde, weekday: 2, opensAt: '18:00', closesAt: '19:30' },
    ]);

    // Y una nota para cada una.
    for (const [groupId, nota] of [
      [manana, 'Esta semana: rollos y caídas.'],
      [tarde, 'Esta semana: kata y examen el viernes.'],
    ] as const) {
      const r = await e.app.inject({
        method: 'PUT',
        url: '/schedule/notes',
        headers: e.auth(e.ids.owner),
        payload: { groupId, semana: hoy(), nota },
      });
      expect(r.statusCode).toBe(200);
    }

    const uno = await miPanel(e.ids.alumno);
    const dos = await miPanel(e.ids.alumno2);

    // Cada quien, la suya.
    expect(uno.clase.name).toBe('Infantil');
    expect(uno.clase.descripcion).toBe('Niños de 6 a 12 años');
    expect(uno.notaSemana).toBe('Esta semana: rollos y caídas.');
    expect(dos.clase.name).toBe('Adultos');
    expect(dos.notaSemana).toBe('Esta semana: kata y examen el viernes.');

    // Y de la otra, ni el nombre. Se mira el JSON entero a propósito: lo que
    // importa no es que la pantalla no lo pinte, es que no llegue.
    const deUno = JSON.stringify(uno);
    expect(deUno).not.toContain('Adultos');
    expect(deUno).not.toContain('kata');
    expect(deUno).not.toContain('18:00');
    const deDos = JSON.stringify(dos);
    expect(deDos).not.toContain('Infantil');
    expect(deDos).not.toContain('rollos');
    expect(deDos).not.toContain('16:00');
  });

  it('«hoy hay clase» se calcula con los días de SU clase', async () => {
    const suya = await crearClase('Adultos');
    const ajena = await crearClase('Infantil');
    await asignar(e.ids.alumno, suya);

    // La otra clase entrena HOY; la suya, no. Con el horario del club entero
    // —que es como se contestaba antes— saldría que sí hay clase.
    await ponerHorario([
      { groupId: ajena, weekday: diaDe(hoy()) },
      { groupId: suya, weekday: (diaDe(hoy()) + 3) % 7 },
    ]);

    const mi = await miPanel(e.ids.alumno);
    expect(mi.clases.configurado).toBe(true);
    expect(mi.clases.hoy).toBe(false);
    expect(mi.clases.dias).toEqual([(diaDe(hoy()) + 3) % 7]);
  });

  it('el check-in sella la clase y respeta su horario', async () => {
    const suya = await crearClase('Adultos');
    await asignar(e.ids.alumno, suya);
    await ponerHorario([{ groupId: suya, weekday: diaDe(hoy()) }]);

    const r = await e.app.inject({
      method: 'POST',
      url: '/checkin',
      headers: e.auth(e.ids.owner),
      payload: { identifier: { type: 'qr', value: e.ids.alumno } },
    });
    expect(r.statusCode).toBe(201);

    const [m] = await e.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, e.ids.alumno));
    const [a] = await e.db
      .select({ groupId: attendances.groupId })
      .from(attendances)
      .where(eq(attendances.membershipId, m.id));
    expect(a.groupId).toBe(suya);
  });

  it('un día que es de la OTRA clase no deja marcar asistencia', async () => {
    const suya = await crearClase('Adultos');
    const ajena = await crearClase('Infantil');
    await asignar(e.ids.alumno, suya);
    await ponerHorario([
      { groupId: ajena, weekday: diaDe(hoy()) },
      { groupId: suya, weekday: (diaDe(hoy()) + 3) % 7 },
    ]);

    const r = await e.app.inject({
      method: 'POST',
      url: '/checkin',
      headers: e.auth(e.ids.owner),
      payload: { identifier: { type: 'qr', value: e.ids.alumno } },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().codigo).toBe('SIN_CLASE');
  });

  it('el roster se puede filtrar por clase, y por «sin clase»', async () => {
    const suya = await crearClase('Adultos');
    await asignar(e.ids.alumno, suya);

    const conClase = await e.app.inject({
      method: 'GET',
      url: `/memberships?groupId=${suya}`,
      headers: e.auth(e.ids.owner),
    });
    expect(conClase.json().items.map((i: { userId: string }) => i.userId)).toEqual([
      e.ids.alumno,
    ]);
    expect(conClase.json().items[0].groupName).toBe('Adultos');

    // El filtro que necesita el maestro justo después de crear sus clases:
    // a quién le falta repartir.
    const sinClase = await e.app.inject({
      method: 'GET',
      url: '/memberships?groupId=ninguna',
      headers: e.auth(e.ids.owner),
    });
    const ids = sinClase.json().items.map((i: { userId: string }) => i.userId);
    expect(ids).toContain(e.ids.alumno2);
    expect(ids).not.toContain(e.ids.alumno);
  });

  it('no se puede meter a un alumno en la clase de otro club', async () => {
    const ajena = await e.app.inject({
      method: 'POST',
      url: '/schedule/groups',
      headers: e.auth(e.ids.ownerAjeno),
      payload: { name: 'Clase del rival' },
    });
    expect(ajena.statusCode).toBe(201);

    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { groupId: ajena.json().id },
    });
    expect(r.statusCode).toBe(422);
  });

  it('borrar una clase deja a sus alumnos sin clase, no rotos', async () => {
    const suya = await crearClase('Adultos');
    await asignar(e.ids.alumno, suya);
    await ponerHorario([{ groupId: suya, weekday: diaDe(hoy()) }]);

    const r = await e.app.inject({
      method: 'DELETE',
      url: `/schedule/groups/${suya}`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(200);

    const [m] = await e.db
      .select({ groupId: memberships.groupId })
      .from(memberships)
      .where(eq(memberships.userId, e.ids.alumno));
    expect(m.groupId).toBeNull();

    // Su horario también se va: si no, el club seguiría teniendo días de clase
    // colgando de una clase que ya no existe.
    const quedan = await e.db
      .select()
      .from(clubSchedule)
      .where(eq(clubSchedule.orgId, e.orgId));
    expect(quedan).toEqual([]);

    // Y el panel del alumno vuelve a lo de un club sin dividir.
    const mi = await miPanel(e.ids.alumno);
    expect(mi.clase).toBeNull();
  });

  it('una nota por clase y semana: la segunda corrige, no duplica', async () => {
    const suya = await crearClase('Adultos');

    for (const nota of ['Primera versión', 'Segunda versión']) {
      const r = await e.app.inject({
        method: 'PUT',
        url: '/schedule/notes',
        headers: e.auth(e.ids.owner),
        payload: { groupId: suya, semana: hoy(), nota },
      });
      expect(r.statusCode).toBe(200);
    }

    const r = await e.app.inject({
      method: 'GET',
      url: `/schedule?semana=${hoy()}`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.json().notas).toHaveLength(1);
    expect(r.json().notas[0].nota).toBe('Segunda versión');
  });

  it('la semana se normaliza al lunes: el martes y el sábado son la misma', async () => {
    const suya = await crearClase('Adultos');
    // Un lunes cualquiera y su sábado.
    const lunes = '2026-08-10';
    const sabado = '2026-08-15';

    await e.app.inject({
      method: 'PUT',
      url: '/schedule/notes',
      headers: e.auth(e.ids.owner),
      payload: { groupId: suya, semana: sabado, nota: 'Escrita el sábado' },
    });

    const r = await e.app.inject({
      method: 'GET',
      url: `/schedule?semana=${lunes}`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.json().semana).toBe(lunes);
    expect(r.json().notas).toHaveLength(1);
    expect(r.json().notas[0].nota).toBe('Escrita el sábado');
  });

  it('el club SIN clases funciona exactamente como antes', async () => {
    // Esto es lo que no puede romperse: es el caso de casi todos los clubes.
    const mi = await miPanel(e.ids.alumno);
    expect(mi.clase).toBeNull();
    expect(mi.clases.configurado).toBe(true);
    expect(mi.clases.hoy).toBe(true); // el escenario abre los siete días
    expect(mi.clases.dias).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Y su nota de la semana, la del club entero, le llega igual.
    await e.app.inject({
      method: 'PUT',
      url: '/schedule/notes',
      headers: e.auth(e.ids.owner),
      payload: { groupId: null, semana: hoy(), nota: 'Semana de examen.' },
    });
    expect((await miPanel(e.ids.alumno)).notaSemana).toBe('Semana de examen.');
  });

  it('el horario guarda las horas, que antes se borraban solas', async () => {
    // La web mandaba solo `{weekday}`, así que cualquier hora guardada
    // desaparecía en el siguiente guardado y la columna no servía de nada.
    await ponerHorario([{ weekday: 1, opensAt: '18:00', closesAt: '19:30' }]);

    const r = await e.app.inject({
      method: 'GET',
      url: '/schedule',
      headers: e.auth(e.ids.owner),
    });
    expect(r.json().dias).toHaveLength(1);
    expect(r.json().dias[0].opensAt).toBe('18:00');
    expect(r.json().dias[0].closesAt).toBe('19:30');
  });

  it('una clase no puede terminar antes de empezar', async () => {
    const r = await e.app.inject({
      method: 'PUT',
      url: '/schedule',
      headers: e.auth(e.ids.owner),
      payload: { dias: [{ weekday: 1, opensAt: '19:00', closesAt: '18:00' }] },
    });
    expect(r.statusCode).toBe(422);
  });

  it('dos clases con el mismo nombre no se distinguen: se rechaza la segunda', async () => {
    await crearClase('Adultos');
    const r = await e.app.inject({
      method: 'POST',
      url: '/schedule/groups',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Adultos' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('el auxiliar no crea ni borra clases: es del maestro', async () => {
    const crear = await e.app.inject({
      method: 'POST',
      url: '/schedule/groups',
      headers: e.auth(e.ids.staff),
      payload: { name: 'Inventada' },
    });
    expect(crear.statusCode).toBe(403);
  });

  it('las clases de un club no se ven desde el otro', async () => {
    await crearClase('Adultos');
    const r = await e.app.inject({
      method: 'GET',
      url: '/schedule',
      headers: e.auth(e.ids.ownerAjeno),
    });
    expect(r.json().grupos).toEqual([]);
  });
});
