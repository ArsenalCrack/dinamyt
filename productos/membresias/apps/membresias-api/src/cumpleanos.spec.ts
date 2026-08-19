import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';

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
