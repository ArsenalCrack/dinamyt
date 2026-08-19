import { describe, it, expect } from 'vitest';
import { users } from '@dinamyt/membresias-db';
import { crearEscenario, PASSWORD } from './testing/escenario';
import { hashPassword } from './lib/auth/passwords';

/**
 * Paginación y búsqueda de los listados de gente.
 *
 * Lo que estos tests protegen no es «que salgan 25 filas»: es que el buscador
 * y el paginador trabajen sobre el MISMO conjunto. Filtrar en el navegador
 * sobre una página ya recortada es lo que hacía que un alumno de la página
 * tres fuera inencontrable, y eso en una app donde se cobran mensualidades no
 * es un detalle de comodidad.
 */
describe('membresias-api — listados por páginas', () => {
  /** Mete `n` alumnos con nombres predecibles para poder contarlos. */
  async function sembrarAlumnos(e: Awaited<ReturnType<typeof crearEscenario>>, n: number) {
    const hash = await hashPassword(PASSWORD);
    await e.db.insert(users).values(
      Array.from({ length: n }, (_, i) => ({
        email: `masivo${i}@club.com`,
        fullName: `Masivo ${String(i).padStart(3, '0')}`,
        passwordHash: hash,
        role: 'student' as const,
        orgId: e.orgId,
      })),
    );
  }

  it('GET /memberships responde { items, total } y respeta limit y offset', async () => {
    const e = await crearEscenario();
    await sembrarAlumnos(e, 30); // + los 2 alumnos del escenario = 32
    const owner = e.auth(e.ids.owner);

    const p1 = await e.app.inject({
      method: 'GET',
      url: '/memberships?limit=25&offset=0',
      headers: owner,
    });
    expect(p1.statusCode).toBe(200);
    expect(p1.json().items).toHaveLength(25);
    // El total es de TODO el club, no de la página: es lo que deja escribir
    // «1–25 de 32» y saber que hay una página más.
    expect(p1.json().total).toBe(32);

    const p2 = await e.app.inject({
      method: 'GET',
      url: '/memberships?limit=25&offset=25',
      headers: owner,
    });
    expect(p2.json().items).toHaveLength(7);
    expect(p2.json().total).toBe(32);

    // Sin solaparse: la página dos no repite a nadie de la uno.
    const ids1 = p1.json().items.map((m: { userId: string }) => m.userId);
    const ids2 = p2.json().items.map((m: { userId: string }) => m.userId);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
    await e.app.close();
  });

  it('el maestro y los auxiliares no cuentan como alumnos del roster', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships',
      headers: e.auth(e.ids.owner),
    });
    // El escenario tiene maestro + auxiliar + 2 alumnos. Solo los alumnos.
    expect(res.json().total).toBe(2);
    expect(
      res.json().items.every((m: { userId: string }) =>
        [e.ids.alumno, e.ids.alumno2].includes(m.userId),
      ),
    ).toBe(true);
    await e.app.close();
  });

  it('la búsqueda encuentra a quien NO cabe en la primera página', async () => {
    const e = await crearEscenario();
    await sembrarAlumnos(e, 60);
    const owner = e.auth(e.ids.owner);

    // «Masivo 059» va el último por orden alfabético: en la primera página de
    // 25 no aparece ni de lejos. Este es exactamente el caso que rompía.
    const pagina = await e.app.inject({
      method: 'GET',
      url: '/memberships?limit=25&offset=0',
      headers: owner,
    });
    expect(
      pagina.json().items.some((m: { fullName: string }) => m.fullName === 'Masivo 059'),
    ).toBe(false);

    const busqueda = await e.app.inject({
      method: 'GET',
      url: '/memberships?limit=25&offset=0&q=Masivo%20059',
      headers: owner,
    });
    expect(busqueda.json().total).toBe(1);
    expect(busqueda.json().items[0].fullName).toBe('Masivo 059');
    await e.app.close();
  });

  it('la búsqueda mira nombre y correo, y no distingue mayúsculas', async () => {
    const e = await crearEscenario();
    const owner = e.auth(e.ids.owner);

    const porNombre = await e.app.inject({
      method: 'GET',
      url: '/memberships?q=alumno%20uno',
      headers: owner,
    });
    expect(porNombre.json().total).toBe(1);

    const porCorreo = await e.app.inject({
      method: 'GET',
      url: '/memberships?q=ALUMNO2@CLUB.COM',
      headers: owner,
    });
    expect(porCorreo.json().total).toBe(1);
    expect(porCorreo.json().items[0].userId).toBe(e.ids.alumno2);
    await e.app.close();
  });

  it('los comodines de SQL en la búsqueda son texto, no comodines', async () => {
    const e = await crearEscenario();
    // Sin escapar, un «%» solo devolvería el club entero.
    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?q=%25',
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().total).toBe(0);
    await e.app.close();
  });

  it('GET /memberships?userId= devuelve solo esa membresía', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: `/memberships?userId=${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].userId).toBe(e.ids.alumno);
    expect(res.json().total).toBe(1);
    await e.app.close();
  });

  it('un userId de OTRO club no devuelve nada', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: `/memberships?userId=${e.ids.alumnoAjeno}`,
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().items).toHaveLength(0);
    await e.app.close();
  });

  it('GET /users pagina y busca igual, y deja fuera al maestro', async () => {
    const e = await crearEscenario();
    const owner = e.auth(e.ids.owner);

    const todos = await e.app.inject({ method: 'GET', url: '/users', headers: owner });
    // Auxiliar + 2 alumnos. El maestro NO: la pantalla se llama «Alumnos» y él
    // no es alumno de su propio club. Su ficha sigue existiendo —se abre por
    // id—, pero verse a sí mismo en la lista, con el botón de desactivar
    // apagado, no le servía para nada y descuadraba la cuenta de páginas.
    expect(todos.json().total).toBe(3);
    expect(todos.json().items.some((u: { role: string }) => u.role === 'owner')).toBe(false);

    // Ni siquiera buscándolo por su nombre: el filtro es del servidor, así que
    // la búsqueda tampoco lo destapa.
    const buscado = await e.app.inject({
      method: 'GET',
      url: '/users?q=maestro',
      headers: owner,
    });
    expect(buscado.json().total).toBe(0);

    // Pedirlo a propósito sí lo trae: la puerta queda abierta para quien la
    // necesite (un panel de administración, un informe).
    const soloMaestro = await e.app.inject({
      method: 'GET',
      url: '/users?role=owner',
      headers: owner,
    });
    expect(soloMaestro.json().total).toBe(1);
    expect(soloMaestro.json().items[0].role).toBe('owner');

    const pagina = await e.app.inject({
      method: 'GET',
      url: '/users?limit=2&offset=0',
      headers: owner,
    });
    expect(pagina.json().items).toHaveLength(2);
    expect(pagina.json().total).toBe(3);
    await e.app.close();
  });

  it('el maestro llega a su propia ficha aunque no salga en la lista', async () => {
    // Es la mitad que hace justa a la otra: se le quita del listado, no el
    // acceso a sus datos. Desde la web se entra por `/alumnos/<su id>`.
    const e = await crearEscenario();
    const suya = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.owner}`,
      headers: e.auth(e.ids.owner),
    });
    expect(suya.statusCode).toBe(200);
    expect(suya.json().role).toBe('owner');

    // Y los edita: correo, cinturón y lo demás, igual que a un alumno.
    const cambio = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.owner}`,
      headers: e.auth(e.ids.owner),
      payload: { email: 'maestro.nuevo@club.com', belt: 'Negro' },
    });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json().email).toBe('maestro.nuevo@club.com');
    expect(cambio.json().belt).toBe('Negro');
    await e.app.close();
  });

  it('un limit desmedido se recorta al tope de la API', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?limit=999999',
      headers: e.auth(e.ids.owner),
    });
    // No revienta ni se lleva la base por delante: responde lo que hay.
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
    await e.app.close();
  });

  it('el club viaja con el nombre del maestro, que es quien firma el carnet', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().club.name).toBe('Club Central');
    expect(res.json().club.ownerName).toBe('Maestro Uno');
    await e.app.close();
  });
});
