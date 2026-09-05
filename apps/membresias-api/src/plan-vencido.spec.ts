import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **El club con el plan vencido no opera.**
 *
 * ── El agujero que esto tapa ──
 *
 * El portal DINAMYT calcula bien los `app_scopes` —los filtra por
 * `status = 'ACTIVE' AND ends_at > now()` al firmar el pase—, pero eso solo
 * gobierna a quien entra POR EL PORTAL. Membresías tiene login propio: quien ya
 * tiene ficha aquí entra por el formulario de siempre y no pasa por el
 * ecosistema nunca más.
 *
 * Así que el plan vencía, la tarjeta de «Entrar a Membresías» desaparecía del
 * portal, y el club seguía cobrando, pasando lista e imprimiendo carnets
 * indefinidamente. El candado estaba en una puerta y la otra no tenía cerradura.
 *
 * ── Lo que estas pruebas defienden, y por qué cada grupo ──
 *
 * 1. **Que de verdad cierra**, y a todo el club, no solo al maestro.
 * 2. **Que se puede volver**: `/sync/plan` con `alDia: true` reabre en el acto.
 *    Sin esto el club queda encerrado con la llave dentro, que es peor que el
 *    problema original.
 * 3. **Que no cierra a quien no debe**: el club sin aviso (`NULL`) sigue
 *    entrando — es el caso de TODA instalación independiente de Membresías, y
 *    de todos los clubes existentes el día que se aplique la migración.
 * 4. **Que el superadmin pasa**, porque es quien tiene que poder mirar.
 * 5. **Que la fecha no se pisa**: el barrido del ecosistema repite el aviso
 *    cada mañana, y «desde cuándo» es el dato que dice si algo se perdió.
 */

const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const SECRETO = 'secreto-del-espejo-para-las-pruebas';
/** Un escudo cualquiera, con la forma que `imagenGuardada` acepta. */
const ESCUDO = 'data:image/png;base64,QUJDRA==';

let secretoOriginal: string | undefined;

beforeEach(() => {
  secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
  process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
});
afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
  else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
});

/** Ata el club con el ecosistema, que es lo que hace que le lleguen avisos. */
async function enlazarClub(e: Escenario) {
  await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
}

/** El aviso del ecosistema: «el plan de este club (no) está al día». */
function avisarPlan(e: Escenario, alDia: boolean, secreto: string | null = SECRETO) {
  return e.app.inject({
    method: 'POST',
    url: '/sync/plan',
    headers: secreto ? { 'x-dinamyt-sync': secreto } : {},
    payload: { ecoOrgId: ECO_ORG, alDia },
  });
}

/** Una petición cualquiera que exige sesión. Es la que tiene que cerrarse. */
function trabajar(e: Escenario, userId: string) {
  return e.app.inject({ method: 'GET', url: '/users', headers: e.auth(userId) });
}

async function bloqueoDe(e: Escenario) {
  const [o] = await e.db
    .select({ desde: orgs.planBloqueadoDesde })
    .from(orgs)
    .where(eq(orgs.id, e.orgId));
  return o.desde;
}

describe('membresias-api — el plan vencido cierra el club', () => {
  // ── 1 · Que de verdad cierra ───────────────────────────────────────────────

  it('con el plan vencido, el maestro no puede trabajar', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);

    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(200);

    const aviso = await avisarPlan(e, false);
    expect(aviso.statusCode).toBe(200);
    expect(aviso.json()).toMatchObject({ encontrado: true, aplicado: true, bloqueado: true });

    const r = await trabajar(e, e.ids.owner);
    expect(r.statusCode).toBe(402);
    // La marca es lo que deja a la web explicar en vez de decir «algo salió
    // mal», y la fecha, decir desde cuándo.
    expect(r.json()).toMatchObject({ planVencido: true });
    expect(r.json().desde).toBeTruthy();
    await e.app.close();
  });

  it('cierra a TODO el club, no solo a quien manda', async () => {
    // El alumno que consulta su mensualidad y el auxiliar que pasa lista están
    // usando el mismo servicio que no se ha pagado.
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    for (const id of [e.ids.owner, e.ids.staff, e.ids.alumno]) {
      expect((await trabajar(e, id)).statusCode).toBe(402);
    }
    await e.app.close();
  });

  it('el mensaje dice que no se ha perdido nada', async () => {
    // Es la mitad que importa: quien lee esto tiene delante a sus alumnos y la
    // primera pregunta no es «cuánto debo», es «¿perdí los pagos del mes?».
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    const r = await trabajar(e, e.ids.owner);
    expect(r.json().error).toMatch(/nada se ha perdido/i);
    // Y que nombra lo que sigue estando: «no se perdió nada» a secas es una
    // promesa; decir «los pagos y la asistencia» es una respuesta.
    expect(r.json().error).toMatch(/pagos/i);
    expect(r.json().error).toMatch(/asistencia/i);
    await e.app.close();
  });

  it('402 y no 403: es «hay que pagar», no «no te dejan»', async () => {
    // Son pantallas distintas y desenlaces distintos: del 403 no se sale sola
    // la persona, de esto sí, pagando.
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    expect((await trabajar(e, e.ids.owner)).statusCode).not.toBe(403);
    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(402);
    await e.app.close();
  });

  // ── 2 · Que se puede volver ────────────────────────────────────────────────

  it('renovar reabre el club EN EL ACTO', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);
    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(402);

    const vuelta = await avisarPlan(e, true);
    expect(vuelta.json()).toMatchObject({ encontrado: true, aplicado: true, bloqueado: false });

    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(200);
    expect(await bloqueoDe(e)).toBeNull();
    await e.app.close();
  });

  it('la puerta del ESPEJO no se cierra con el club: es por donde vuelve', async () => {
    // Si el bloqueo alcanzara a `/sync/*`, el club quedaría encerrado con la
    // llave dentro y no habría forma de reabrirlo desde el ecosistema.
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    expect((await avisarPlan(e, true)).statusCode).toBe(200);
    await e.app.close();
  });

  // ── 3 · Que no cierra a quien no debe ──────────────────────────────────────

  it('sin aviso ninguno el club trabaja: es toda instalación independiente', async () => {
    // `NULL` = «no consta», y es el valor de todos los clubes el día que se
    // aplique la migración. Bloquear por defecto sería cerrar el producto
    // entero al desplegar.
    const e = await crearEscenario();
    expect(await bloqueoDe(e)).toBeNull();
    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(200);
    await e.app.close();
  });

  it('un club SIN enlazar no se entera, y no es un error', async () => {
    // Esa organización del portal no usa Membresías. Contestar 404 haría que el
    // otro lado lo registrara como aviso fallido.
    const e = await crearEscenario();
    const r = await avisarPlan(e, false);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrado: false, aplicado: false });
    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(200);
    await e.app.close();
  });

  // ── 3-bis · El club que tiene plan y aquí no existía ───────────────────────

  it('un club con plan que aquí no existe SE CREA', async () => {
    // Era el otro medio agujero, y se veía todos los días: en Membresías solo
    // aparecían los clubes creados en Membresías. Una organización nacida en el
    // portal y con plan contratado no llegaba nunca — todos los avisos buscan
    // por `eco_org_id`, no encontraban fila y contestaban «no encontrado».
    const e = await crearEscenario();
    const antes = await e.db.select({ id: orgs.id }).from(orgs);

    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: {
        ecoOrgId: ECO_ORG,
        alDia: true,
        name: 'Club del Portal',
        city: 'Bogotá',
        country: 'Colombia',
      },
    });
    expect(r.json()).toMatchObject({ encontrado: true, creado: true, bloqueado: false });

    const despues = await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG));
    expect(despues).toHaveLength(1);
    expect(despues[0].name).toBe('Club del Portal');
    expect(despues[0].city).toBe('Bogotá');
    // Nace enlazado, que es todo el punto: si no, seguiría sin recibir nada.
    expect(despues[0].ecoOrgId).toBe(ECO_ORG);
    expect(despues[0].isActive).toBe(true);
    expect(despues[0].planBloqueadoDesde).toBeNull();
    expect(await e.db.select({ id: orgs.id }).from(orgs)).toHaveLength(antes.length + 1);
    await e.app.close();
  });

  // ── 3-ter · El escudo, que es lo que se veía roto desde fuera ─────────────
  //
  // El maestro pone el escudo en el portal y el panel de aquí sigue enseñando
  // el logo de la aplicación. Y no era un fallo de la pantalla: el escudo lo
  // copia `POST /sync/club`, que dispara al GUARDAR la ficha del club — así que
  // un club fundado con su escudo, cuyo alta llegó por este aviso, no lo
  // recibía jamás. Y ponerlo desde aquí tampoco se puede: esta app esconde su
  // botón de escudo cuando el club es del ecosistema, para que no haya dos.

  it('el club que nace desde el ecosistema nace CON su escudo', async () => {
    const e = await crearEscenario();
    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: true, name: 'Club del Portal', logoUrl: ESCUDO },
    });
    expect(r.json()).toMatchObject({ creado: true });

    const [nuevo] = await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG));
    expect(nuevo.logoUrl).toBe(ESCUDO);
    await e.app.close();
  });

  it('al club que ya existía SIN escudo se le rellena', async () => {
    // Son los que se crearon con este mismo aviso antes de que llevara el
    // logo. No hay pantalla desde donde arreglarlos uno a uno: los recoge el
    // barrido diario del ecosistema, que repite el aviso cada mañana.
    const e = await crearEscenario();
    await enlazarClub(e);
    await e.db.update(orgs).set({ logoUrl: null }).where(eq(orgs.id, e.orgId));

    await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: true, logoUrl: ESCUDO },
    });

    const [club] = await e.db.select().from(orgs).where(eq(orgs.id, e.orgId));
    expect(club.logoUrl).toBe(ESCUDO);
    await e.app.close();
  });

  it('el escudo que YA hay aquí no se pisa cada mañana', async () => {
    // Éste es el aviso de «el plan sigue al día», no el de «cambió el escudo»
    // —ése es `/sync/club`, y ése sí manda—. Si pisara, un club que llegó con
    // su escudo y luego se enlazó lo perdería en el primer barrido.
    const e = await crearEscenario();
    await enlazarClub(e);
    const suyo = 'data:image/png;base64,U1VZTw==';
    await e.db.update(orgs).set({ logoUrl: suyo }).where(eq(orgs.id, e.orgId));

    await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: true, logoUrl: ESCUDO },
    });

    const [club] = await e.db.select().from(orgs).where(eq(orgs.id, e.orgId));
    expect(club.logoUrl).toBe(suyo);
    await e.app.close();
  });

  it('un escudo inválido no impide que el club vuelva a operar', async () => {
    // El aviso vino a decir «este club está al día». Que el logo no pase la
    // validación no puede dejar cerrado a un club que pagó.
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);
    expect(await bloqueoDe(e)).not.toBeNull();

    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: true, logoUrl: 'esto-no-es-una-imagen' },
    });
    expect(r.statusCode).toBe(200);
    expect(await bloqueoDe(e)).toBeNull();
    await e.app.close();
  });

  it('el mismo aviso dos veces no crea dos clubes', async () => {
    const e = await crearEscenario();
    const crear = () =>
      e.app.inject({
        method: 'POST',
        url: '/sync/plan',
        headers: { 'x-dinamyt-sync': SECRETO },
        payload: { ecoOrgId: ECO_ORG, alDia: true, name: 'Club del Portal' },
      });

    await crear();
    const otra = await crear();
    // La segunda ya lo encuentra: no crea, y tampoco es un cambio.
    expect(otra.json()).toMatchObject({ encontrado: true, aplicado: false });
    expect(await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG))).toHaveLength(1);
    await e.app.close();
  });

  it('con el plan VENCIDO no se crea nada: no nace bloqueado, no nace', async () => {
    const e = await crearEscenario();
    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: false, name: 'Club del Portal' },
    });
    expect(r.json()).toMatchObject({ encontrado: false, aplicado: false });
    expect(await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG))).toHaveLength(0);
    await e.app.close();
  });

  it('sin nombre no se inventa un club', async () => {
    // El barrido manda todos los clubes cada mañana; uno sin nombre es un aviso
    // roto, y crear «(sin nombre)» sería peor que no crear nada.
    const e = await crearEscenario();
    const r = await avisarPlan(e, true);
    expect(r.json()).toMatchObject({ encontrado: false, aplicado: false });
    expect(await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG))).toHaveLength(0);
    await e.app.close();
  });

  it('un nombre que choca en el slug no tumba el alta', async () => {
    // Dos clubes «Dinamyt» en dos ciudades es un caso normal, y un alta que se
    // cae por eso deja al club pagado y sin existir — justo lo que se arregla.
    const e = await crearEscenario();
    const [existente] = await e.db
      .select({ name: orgs.name, slug: orgs.slug })
      .from(orgs)
      .where(eq(orgs.id, e.orgId));

    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, alDia: true, name: existente.name },
    });
    expect(r.json()).toMatchObject({ creado: true });

    const [nuevo] = await e.db.select().from(orgs).where(eq(orgs.ecoOrgId, ECO_ORG));
    expect(nuevo.name).toBe(existente.name);
    expect(nuevo.slug).not.toBe(existente.slug);
    await e.app.close();
  });

  it('el bloqueo es de UN club: el de al lado sigue trabajando', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    expect((await trabajar(e, e.ids.owner)).statusCode).toBe(402);
    expect((await trabajar(e, e.ids.ownerAjeno)).statusCode).toBe(200);
    await e.app.close();
  });

  // ── 4 · La puerta del secreto y el superadmin ──────────────────────────────

  it('sin el secreto no se bloquea a nadie', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);

    expect((await avisarPlan(e, false, null)).statusCode).toBe(401);
    expect((await avisarPlan(e, false, 'otro-cualquiera')).statusCode).toBe(401);
    expect(await bloqueoDe(e)).toBeNull();
    await e.app.close();
  });

  it('`alDia` tiene que venir explícito: un aviso a medias no decide nada', async () => {
    // Caer a `true` desbloquearía clubes por un aviso mal formado, y a `false`
    // los cerraría. Los dos silencios son peores que un 422.
    const e = await crearEscenario();
    await enlazarClub(e);

    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/plan',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG },
    });
    expect(r.statusCode).toBe(422);
    expect(await bloqueoDe(e)).toBeNull();
    await e.app.close();
  });

  it('el superadmin entra con el club cerrado: es quien tiene que arreglarlo', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    await avisarPlan(e, false);

    // Se le pone dentro del club para comprobar que lo que le deja pasar es ser
    // superadmin y no estar fuera de la organización.
    await e.db
      .update(users)
      .set({ orgId: e.orgId })
      .where(eq(users.id, e.ids.superadmin));

    expect((await trabajar(e, e.ids.superadmin)).statusCode).toBe(200);
    await e.app.close();
  });

  // ── 5 · La fecha no se pisa ────────────────────────────────────────────────

  it('repetir el aviso NO reinicia el reloj', async () => {
    // El barrido del ecosistema vuelve a avisar cada mañana. Si la fecha se
    // pisara, la pantalla diría «desde hoy» de algo que lleva tres semanas — y
    // ese dato es justo el que dice si un aviso se perdió por el camino.
    const e = await crearEscenario();
    await enlazarClub(e);

    await avisarPlan(e, false);
    const primera = await bloqueoDe(e);
    expect(primera).toBeTruthy();

    const otra = await avisarPlan(e, false);
    expect(otra.json()).toMatchObject({ bloqueado: true, aplicado: false });
    expect((await bloqueoDe(e))?.getTime()).toBe(primera?.getTime());
    await e.app.close();
  });

  it('decir «al día» a un club que ya lo estaba no es noticia', async () => {
    // El barrido manda TODOS los clubes cada mañana: si cada uno contara como
    // cambio, el registro sería inútil justo el día que haga falta leerlo.
    const e = await crearEscenario();
    await enlazarClub(e);

    const r = await avisarPlan(e, true);
    expect(r.json()).toMatchObject({ encontrado: true, aplicado: false, bloqueado: false });
    await e.app.close();
  });
});
