import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **El rol que cambia en el portal, visto desde este lado.**
 *
 * ── Qué defiende, y por qué hacía falta un archivo aparte ──
 *
 * Que el rol LLEGA ya estaba probado — pero en el otro repositorio y del otro
 * lado: `cambiar-rol.spec.ts` del ecosystem comprueba que el portal MANDA el
 * rol traducido y que no manda el que aquí no existe. Eso no dice nada de qué
 * hace esta aplicación con lo que le llega, que es donde están las decisiones
 * de verdad: a quién ata, a quién no toca, y a quién se niega a degradar.
 *
 * ── Por qué este archivo se pudo escribir por fin ──
 *
 * Porque `/sync/rol` ya está en la lista `SIN_CONTEXTO` de `plugins/rls`. Se
 * quedó fuera cuando se escribió la ruta, y contra PGlite —una sola conexión—
 * la transacción que abre su `sinFiltroDeClub` caía dentro de la del plugin y
 * se bloqueaba contra sí misma: la petición no volvía nunca. No era el arnés,
 * era la ruta.
 *
 * ── Las cuatro familias, y ninguna sobra ──
 *
 * 1. **La puerta.** Sin secreto no entra nadie, y sin secreto CONFIGURADO la
 *    función no existe (404, no 401): es el mismo criterio que el correo.
 * 2. **A quién alcanza.** Por `eco_sub`, y por correo sobre una ficha sin
 *    enlazar —a la que ata de paso—. La ficha sin correo del alumno de carnet
 *    QR no la alcanza por ninguno de los dos caminos.
 * 3. **A quién NO toca.** La que ya tiene OTRO `eco_sub` es de otra persona:
 *    atarla por correo sería robarle la ficha a alguien.
 * 4. **El club no se queda sin dueño.** La regla de allá mira `org_members`,
 *    que es otra tabla: un club puede quedarse sin `owner` aquí mientras la
 *    organización del portal sigue teniendo tres administradores.
 */

const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_SUB_AJENO = '00000000-0000-4000-8000-0000000000dd';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const SECRETO = 'secreto-del-espejo-para-las-pruebas';

let secretoOriginal: string | undefined;

beforeEach(() => {
  secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
  process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
});
afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
  else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
});

/** Ata a alguien (y a su club) con el ecosistema, como hace la reconciliación. */
async function enlazar(e: Escenario, userId: string, ecoSub = ECO_SUB) {
  await e.db.update(users).set({ ecoSub }).where(eq(users.id, userId));
  await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
}

/**
 * El aviso del portal: «a esta persona le cambié el rol».
 *
 * `secreto: null` manda la petición SIN la cabecera. Tiene que ser `null` y no
 * `undefined`: pasar `undefined` a un parámetro con valor por defecto activa el
 * valor por defecto, así que la prueba de «sin secreto» mandaría el bueno y
 * pasaría por el motivo contrario al que dice.
 */
function cambiarRol(
  e: Escenario,
  cuerpo: Record<string, unknown>,
  secreto: string | null = SECRETO,
) {
  return e.app.inject({
    method: 'POST',
    url: '/sync/rol',
    headers: secreto ? { 'x-dinamyt-sync': secreto } : {},
    payload: cuerpo,
  });
}

async function ficha(e: Escenario, userId: string) {
  const [u] = await e.db
    .select({
      role: users.role,
      ecoSub: users.ecoSub,
      email: users.email,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(users)
    .where(eq(users.id, userId));
  return u;
}

describe('membresias-api — el rol que llega del portal', () => {
  // ── 1 · La puerta ──────────────────────────────────────────────────────────

  it('sin el secreto no entra nadie', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'staff' }, null);
    expect(r.statusCode).toBe(401);
    // Y lo que importa: no cambió nada.
    expect((await ficha(e, e.ids.alumno)).role).toBe('student');
    await e.app.close();
  });

  it('con un secreto equivocado tampoco, y da el mismo 401', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'staff' }, 'otro-secreto-cualquiera');
    expect(r.statusCode).toBe(401);
    expect((await ficha(e, e.ids.alumno)).role).toBe('student');
    await e.app.close();
  });

  it('sin secreto CONFIGURADO la función no existe: 404, no 401', async () => {
    // Es el mismo criterio que el correo (`MailerService`): una instalación que
    // no participa del espejo no tiene esta ruta, y decirlo con un 401 haría
    // pensar que el secreto está mal cuando lo que falta es la variable.
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const e = await crearEscenario();

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'staff' }, 'lo-que-sea');
    expect(r.statusCode).toBe(404);
    await e.app.close();
  });

  // ── 2 · Lo que se rechaza antes de tocar la base ───────────────────────────

  it('un rol que aquí no existe se rechaza: reventaría el INSERT', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    // `judge` existe en el portal y en Campeonatos, no en el enum de esta base.
    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'judge' });
    expect(r.statusCode).toBe(422);
    expect((await ficha(e, e.ids.alumno)).role).toBe('student');
    await e.app.close();
  });

  it('un `ecoSub` que no tiene forma de UUID se rechaza', async () => {
    const e = await crearEscenario();

    const r = await cambiarRol(e, { ecoSub: 'no-soy-un-uuid', role: 'staff' });
    expect(r.statusCode).toBe(422);
    await e.app.close();
  });

  // ── 3 · A quién alcanza ────────────────────────────────────────────────────

  it('llega el rol y se aplica', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'staff' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true, de: 'student', a: 'staff' });

    expect((await ficha(e, e.ids.alumno)).role).toBe('staff');
    await e.app.close();
  });

  it('quien ya lo tenía no se toca, y se dice por qué', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'student' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: false, motivo: 'Ya lo tenía.' });
    await e.app.close();
  });

  it('la ficha SIN enlazar se ata por correo, y por eso el rol le llega', async () => {
    // Éste es el fallo que dejaba el botón del portal sin efecto: todo el
    // espejo busca por `eco_sub`, y una ficha creada por su club y nunca
    // enlazada no la encontraba ninguno de los cuatro avisos. Contestaba 200
    // sin más, así que tampoco había forma de enterarse.
    const e = await crearEscenario();
    expect((await ficha(e, e.ids.alumno)).ecoSub).toBeNull();

    const r = await cambiarRol(e, {
      ecoSub: ECO_SUB,
      role: 'staff',
      email: 'alumno1@club.com',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true, enlazada: true });

    const u = await ficha(e, e.ids.alumno);
    expect(u.role).toBe('staff');
    // Y queda atada: a partir de aquí le llegan también la foto, el escudo y
    // la contraseña, que es la mitad silenciosa de este arreglo.
    expect(u.ecoSub).toBe(ECO_SUB);
    await e.app.close();
  });

  it('el correo se compara en minúsculas, como el login', async () => {
    const e = await crearEscenario();

    const r = await cambiarRol(e, {
      ecoSub: ECO_SUB,
      role: 'staff',
      email: 'Alumno1@Club.COM',
    });
    expect(r.json()).toMatchObject({ encontrada: true, enlazada: true });
    await e.app.close();
  });

  it('sin ficha aquí no es un error: ese club del portal no usa Membresías', async () => {
    const e = await crearEscenario();

    const r = await cambiarRol(e, {
      ecoSub: ECO_SUB,
      role: 'staff',
      email: 'nadie@enningunsitio.com',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: false, aplicado: false });
    await e.app.close();
  });

  it('sin correo y sin `eco_sub` no la alcanza: es el alumno del carnet QR', async () => {
    // Su rol es asunto de su club y de nadie más: no hay cuenta del portal
    // detrás, así que no hay nada que espejar.
    const e = await crearEscenario();

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'staff' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: false });
    expect((await ficha(e, e.ids.alumno)).role).toBe('student');
    await e.app.close();
  });

  // ── 4 · A quién NO toca ────────────────────────────────────────────────────

  it('NO ata por correo una ficha que ya es de otra persona del ecosistema', async () => {
    // Atar por correo solo vale sobre una ficha sin enlace. Si ya tiene otro
    // `eco_sub`, pisarlo le daría a alguien la ficha —los pagos, la
    // asistencia— de otro.
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno, ECO_SUB_AJENO);

    const r = await cambiarRol(e, {
      ecoSub: ECO_SUB,
      role: 'staff',
      email: 'alumno1@club.com',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: false });

    const u = await ficha(e, e.ids.alumno);
    expect(u.ecoSub).toBe(ECO_SUB_AJENO);
    expect(u.role).toBe('student');
    await e.app.close();
  });

  it('al superadmin se le cambia el rol, pero no deja de ser superadmin', async () => {
    // El `role` se imprime en el carnet y se cambia como el de cualquiera. El
    // `is_super_admin` atraviesa todos los clubes y se concede a mano: por esta
    // ruta no se toca nunca.
    const e = await crearEscenario();
    await enlazar(e, e.ids.superadmin);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'student' });
    expect(r.statusCode).toBe(200);

    const u = await ficha(e, e.ids.superadmin);
    expect(u.role).toBe('student');
    expect(u.isSuperAdmin).toBe(true);
    await e.app.close();
  });

  // ── 5 · El club no se queda sin dueño ──────────────────────────────────────

  it('al ÚNICO dueño del club no se le baja el rol, y se dice qué hacer', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.owner);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'student' });
    expect(r.statusCode).toBe(200);
    const cuerpo = r.json();
    expect(cuerpo).toMatchObject({ encontrada: true, aplicado: false });
    // El motivo no es decorativo: el portal lo registra, y es lo único que
    // explica por qué el cambio que se pidió no se ve aquí.
    expect(cuerpo.motivo).toContain('único dueño');

    expect((await ficha(e, e.ids.owner)).role).toBe('owner');
    await e.app.close();
  });

  it('con otro dueño en el club, bajarle el rol es normal y corriente', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.owner);
    await e.db.update(users).set({ role: 'owner' }).where(eq(users.id, e.ids.alumno2));

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'student' });
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true, a: 'student' });
    expect((await ficha(e, e.ids.owner)).role).toBe('student');
    await e.app.close();
  });

  it('la regla es sobre el mando: a un alumno no lo protege nadie', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'guardian' });
    expect(r.json()).toMatchObject({ aplicado: true, a: 'guardian' });
    await e.app.close();
  });

  it('SUBIR a dueño no pide permiso a nadie: la regla protege al último, no al primero', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await cambiarRol(e, { ecoSub: ECO_SUB, role: 'owner' });
    expect(r.json()).toMatchObject({ aplicado: true, a: 'owner' });
    expect((await ficha(e, e.ids.alumno)).role).toBe('owner');
    await e.app.close();
  });
});
