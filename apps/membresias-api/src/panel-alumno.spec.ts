import { describe, it, expect, beforeEach } from 'vitest';
import { clubSchedule, scheduleExceptions } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';

/**
 * Lo que el alumno ve —y lo que NO puede tocar— en su panel.
 *
 * Las dos mitades de este archivo responden a la misma idea: el panel del
 * alumno es para consultar su club, no para administrarlo. Se le contesta
 * cuándo hay clase y cómo viene viniendo, y se le impide reescribir su propio
 * nombre, que es lo que sale en su carnet y en el recibo de sus pagos.
 */

/** Día de la semana (0=domingo) de una fecha `YYYY-MM-DD`, en UTC. */
function diaDe(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

/**
 * El «hoy» del test tiene que ser el MISMO que el de la API.
 *
 * Antes esto era `toISOString().slice(0, 10)`, que da la fecha en UTC, mientras
 * que la API calcula el día en hora local (`todayStr`). En Colombia (UTC−5) las
 * dos coinciden veinte horas al día y discrepan las otras cuatro: de siete de
 * la tarde a medianoche, estos tests fallaban solos y volvían a pasar al día
 * siguiente por la mañana. Reusando la función de producción no pueden
 * separarse.
 */
const hoyISO = todayStr;

describe('membresias-api — panel del alumno', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  async function miPanel(userId: string) {
    const r = await e.app.inject({ method: 'GET', url: '/mi', headers: e.auth(userId) });
    expect(r.statusCode).toBe(200);
    return r.json();
  }

  it('sin calendario configurado no afirma que hoy hay clase', async () => {
    // Antes contestaba que sí —la API da por abierto el club sin horario para
    // no bloquearle el check-in—, y el alumno leía «Hoy hay clase» los 365 días
    // del año. La respuesta honesta es que todavía no se sabe: por eso
    // `configurado`.
    const mi = await miPanel(e.ids.alumno);
    expect(mi.clases.configurado).toBe(false);
    expect(mi.clases.hoy).toBe(false);
    expect(mi.clases.proxima).toBeNull();
    expect(mi.clases.dias).toEqual([]);
  });

  it('un día de la semana apagado no cuenta como día de clase', async () => {
    // El check-in ya filtraba `is_active`; el panel del alumno no, así que un
    // día desactivado le seguía diciendo que fuera al salón.
    await e.db
      .insert(clubSchedule)
      .values({ orgId: e.orgId, weekday: diaDe(hoyISO()), isActive: false });

    const mi = await miPanel(e.ids.alumno);
    expect(mi.clases.hoy).toBe(false);
    expect(mi.clases.dias).toEqual([]);
  });

  it('contesta si hoy hay clase según los días del club', async () => {
    // El club abre justo el día de la semana en que NO cae hoy.
    const otroDia = (diaDe(hoyISO()) + 2) % 7;
    await e.db.insert(clubSchedule).values({ orgId: e.orgId, weekday: otroDia });

    const mi = await miPanel(e.ids.alumno);
    expect(mi.clases.hoy).toBe(false);
    expect(mi.clases.dias).toEqual([otroDia]);
    // Y le dice cuándo vuelve, que es la otra mitad de la pregunta.
    expect(diaDe(mi.clases.proxima)).toBe(otroDia);
  });

  it('un cierre de hoy manda sobre el día de la semana, y explica por qué', async () => {
    await e.db
      .insert(clubSchedule)
      .values({ orgId: e.orgId, weekday: diaDe(hoyISO()) });
    await e.db.insert(scheduleExceptions).values({
      orgId: e.orgId,
      date: hoyISO(),
      isClosed: true,
      note: 'Festivo',
    });

    const mi = await miPanel(e.ids.alumno);
    expect(mi.clases.hoy).toBe(false);
    expect(mi.clases.motivo).toBe('Festivo');
  });

  it('resume su asistencia contándola en la base, no sobre las últimas quince', async () => {
    const hoy = hoyISO();
    // Se marca dos veces a propósito: la segunda la rechaza la API, y el
    // resumen tiene que reflejar UNA clase, no dos.
    for (let i = 0; i < 2; i++) {
      await e.app.inject({
        method: 'POST',
        url: '/checkin',
        headers: e.auth(e.ids.owner),
        payload: { identifier: { type: 'manual', value: e.ids.alumno } },
      });
    }

    const mi = await miPanel(e.ids.alumno);
    expect(mi.asistencia.total).toBe(1);
    expect(mi.asistencia.esteMes).toBe(1);
    expect(mi.asistencia.ultima).toBe(hoy);
  });

  it('el panel de quien todavía no tiene membresía trae las mismas piezas', async () => {
    // Sin esto la pantalla reventaba al leer `mi.clases.hoy` de un `undefined`.
    const mi = await miPanel(e.ids.alumno2);
    expect(mi.clases).toBeTruthy();
    expect(mi.desde).toBeTruthy();
    expect(mi.asistencia).toEqual({ total: 0, esteMes: 0, ultima: null });
  });

  it('dice desde cuándo está en el club, que es cuando le crearon la cuenta', async () => {
    const mi = await miPanel(e.ids.alumno);
    expect(new Date(mi.desde).getTime()).toBeLessThanOrEqual(Date.now());
    // No es la fecha de la membresía: esa se crea la primera vez que se le
    // pone un plan, meses después de que empezó a entrenar.
    expect(new Date(mi.desde).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('trae el PIN de respaldo, que es el plan B cuando el QR no lee', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '4821' },
    });

    const mi = await miPanel(e.ids.alumno);
    expect(mi.checkinPin).toBe('4821');
  });

  // ── El PIN se genera solo ──────────────────────────────────────────────────

  it('quien acaba de ser inscrito ya tiene PIN, sin que nadie lo teclee', async () => {
    const alta = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'nuevo@club.com',
        fullName: 'Alumno Nuevo',
        password: 'Prueba1234',
        role: 'student',
      },
    });
    expect(alta.statusCode).toBe(201);

    const roster = await e.app.inject({
      method: 'GET',
      url: '/memberships',
      headers: e.auth(e.ids.owner),
    });
    const suyo = roster
      .json()
      .items.find((m: { userId: string }) => m.userId === alta.json().id);
    expect(suyo.checkinPin).toMatch(/^\d{4}$/);
  });

  it('dos alumnos del mismo club nunca comparten PIN', async () => {
    // Si lo compartieran, uno marcaría la asistencia del otro: el kiosco busca
    // la membresía por club + PIN y se queda con la primera que encuentre.
    const pins = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const alta = await e.app.inject({
        method: 'POST',
        url: '/users',
        headers: e.auth(e.ids.owner),
        payload: {
          email: `masivo${i}@club.com`,
          // Sin el número dentro: un nombre de persona no lleva cifras (ver
          // `nombreCompleto`). Lo que distingue a estos seis es el correo.
          fullName: 'Alumno Masivo',
          password: 'Prueba1234',
          role: 'student',
        },
      });
      const mem = await e.app.inject({
        method: 'PATCH',
        url: `/memberships/${alta.json().id}`,
        headers: e.auth(e.ids.owner),
        payload: {},
      });
      pins.add(mem.json().checkinPin);
    }
    expect(pins.size).toBe(6);
  });

  it('el maestro puede reemplazar el PIN generado por el que quiera', async () => {
    const puesto = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '1234' },
    });
    expect(puesto.json().checkinPin).toBe('1234');
  });

  it('si el PIN ya es de otro alumno, lo dice con nombre y apellido', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '1234' },
    });

    // El índice único de la base ya lo impedía, pero llegaba como un 500 sin
    // explicación: el maestro veía «error del servidor» donde tenía que leer
    // de quién es ese PIN.
    const choque = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno2}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '1234' },
    });
    expect(choque.statusCode).toBe(409);
    expect(choque.json().error).toContain('Alumno Uno');
  });

  it('repetir el PIN que uno ya tiene no es un choque consigo mismo', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '5555' },
    });
    const otraVez = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '5555', status: 'activo' },
    });
    expect(otraVez.statusCode).toBe(200);
  });

  it('dos clubes distintos sí pueden repetir PIN: el kiosco filtra por club', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { checkinPin: '7777' },
    });
    const vecino = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumnoAjeno}`,
      headers: e.auth(e.ids.ownerAjeno),
      payload: { checkinPin: '7777' },
    });
    expect(vecino.statusCode).toBe(200);
  });

  it('un correo sin arroba no crea una cuenta con la que nadie puede entrar', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'pepito',
        fullName: 'Pepito Sin Correo',
        password: 'Prueba1234',
        role: 'student',
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('nombre@dominio.com');
  });

  // ── Ficha de seguridad ─────────────────────────────────────────────────────

  it('el maestro registra sangre, contacto de emergencia y antigüedad real', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: {
        bloodType: 'o+',
        emergencyName: 'María Restrepo',
        emergencyPhone: '3001234567',
        trainsSince: '2019-03-15',
      },
    });
    expect(r.statusCode).toBe(200);
    // Se normaliza a mayúsculas: «o+» y «O+» son el mismo grupo sanguíneo.
    expect(r.json().bloodType).toBe('O+');
    expect(r.json().emergencyName).toBe('María Restrepo');
    expect(r.json().trainsSince).toBe('2019-03-15');

    // Y esa antigüedad es la que ve el alumno, no la de su cuenta.
    const mi = await miPanel(e.ids.alumno);
    expect(mi.desde).toBe('2019-03-15');
  });

  it('rechaza un grupo sanguíneo inventado y una antigüedad futura', async () => {
    const sangre = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { bloodType: 'Z+' },
    });
    expect(sangre.statusCode).toBe(422);

    const manana = todayStr(new Date(Date.now() + 86_400_000));
    const futuro = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { trainsSince: manana },
    });
    expect(futuro.statusCode).toBe(422);
  });

  it('el alumno mantiene su contacto de emergencia, pero no su antigüedad', async () => {
    const suyo = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { emergencyPhone: '3009998877', bloodType: 'AB-' },
    });
    expect(suyo.statusCode).toBe(200);
    expect(suyo.json().emergencyPhone).toBe('3009998877');
    expect(suyo.json().bloodType).toBe('AB-');

    // La antigüedad la fija el maestro: es un dato del club, no del alumno.
    await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { trainsSince: '1999-01-01' },
    });
    const mi = await miPanel(e.ids.alumno);
    expect(mi.desde).not.toBe('1999-01-01');
  });

  // ── El nombre no es de quien lo lleva ──────────────────────────────────────

  it('el alumno no se cambia el nombre', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { fullName: 'El Dragón' },
    });
    expect(r.statusCode).toBe(403);

    const yo = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
    });
    expect(yo.json().user.fullName).toBe('Alumno Uno');
  });

  it('el auxiliar tampoco: por encima de él está el maestro', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.staff),
      payload: { fullName: 'Otro Nombre' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('el alumno sí mantiene su teléfono y su foto', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { phone: '3001234567' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().phone).toBe('3001234567');
  });

  it('el maestro sí mantiene el suyo, y el de sus alumnos', async () => {
    const propio = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'Maestro Corregido' },
    });
    expect(propio.statusCode).toBe(200);
    expect(propio.json().fullName).toBe('Maestro Corregido');

    const ajeno = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'Alumno Corregido' },
    });
    expect(ajeno.statusCode).toBe(200);
    expect(ajeno.json().fullName).toBe('Alumno Corregido');
  });
});
