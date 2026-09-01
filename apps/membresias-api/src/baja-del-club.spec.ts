import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **Una baja se da una vez, en un sitio.**
 *
 * ── Qué estaba roto ──
 *
 * El maestro quitaba a un alumno de su organización en el portal DINAMYT y aquí
 * no pasaba nada: seguía en el listado, seguía contando en el resumen del club
 * y seguía pudiendo entrar. Desde fuera se lee como que la aplicación no hace
 * caso —«lo eliminé y sigue ahí»—, y el apaño (desactivarlo también aquí)
 * obliga a repetir el gesto en dos aplicaciones y a acordarse de las dos para
 * siempre. `POST /sync/pertenencia` es la otra mitad de esa baja.
 *
 * ── Lo que estas pruebas defienden, y por qué cada una ──
 *
 * Que la baja LLEGA; que **no borra** —los pagos y la asistencia son la
 * contabilidad del club y no se van con la persona—; que no deja un club sin
 * maestro; que no toca la ficha de otro club de la misma persona; y que la
 * puerta del secreto está cerrada. Las cinco son formas distintas de que esto
 * salga mal en silencio.
 *
 * ── Por qué este archivo se pudo escribir ──
 *
 * Porque `/sync/pertenencia` está en la lista `SIN_CONTEXTO` de `plugins/rls`.
 * Su vecina `/sync/rol` no lo estaba, y ése es el motivo por el que sus pruebas
 * de punta a punta nunca se montaron: contra PGlite —una sola conexión— la
 * transacción que abre `sinFiltroDeClub` dentro de la del plugin se bloquea
 * contra sí misma y la petición no vuelve nunca. No era el arnés: era la ruta.
 */

const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const ECO_ORG_AJENO = '00000000-0000-4000-8000-0000000000cc';
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

/** El aviso del portal: «esta persona ya no pertenece a este club». */
function darDeBaja(
  e: Escenario,
  cuerpo: Record<string, unknown>,
  secreto: string | undefined = SECRETO,
) {
  return e.app.inject({
    method: 'POST',
    url: '/sync/pertenencia',
    headers: secreto ? { 'x-dinamyt-sync': secreto } : {},
    payload: cuerpo,
  });
}

async function ficha(e: Escenario, userId: string) {
  const [u] = await e.db
    .select({ isActive: users.isActive, ecoSub: users.ecoSub, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId));
  return u;
}

describe('membresias-api — la baja que llega del portal', () => {
  it('sale del club en DINAMYT y aquí se queda sin acceso', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true });

    expect((await ficha(e, e.ids.alumno)).isActive).toBe(false);
    await e.app.close();
  });

  it('deja de salir en el listado del club, que es lo que se venía a arreglar', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const antes = await e.app.inject({
      method: 'GET',
      url: '/users',
      headers: e.auth(e.ids.owner),
    });
    const nombresAntes = antes.json().items.map((u: { id: string }) => u.id);
    expect(nombresAntes).toContain(e.ids.alumno);

    await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });

    const despues = await e.app.inject({
      method: 'GET',
      url: '/users',
      headers: e.auth(e.ids.owner),
    });
    const cuerpo = despues.json();
    expect(cuerpo.items.map((u: { id: string }) => u.id)).not.toContain(e.ids.alumno);
    // Y aparece donde tiene que aparecer: contado como alguien sin acceso, no
    // desaparecido del club. Es la diferencia entre una baja y un borrado.
    expect(cuerpo.resumen.sinAcceso).toBe(1);
    await e.app.close();
  });

  it('NO borra la ficha: el enlace y el club siguen ahí para cuando vuelva', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });

    const u = await ficha(e, e.ids.alumno);
    expect(u).toBeTruthy();
    expect(u.ecoSub).toBe(ECO_SUB);
    expect(u.orgId).toBe(e.orgId);
    await e.app.close();
  });

  it('el club no se queda sin maestro', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.owner);

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    expect(r.statusCode).toBe(200);
    expect(r.json().aplicado).toBe(false);
    expect(r.json().motivo).toMatch(/único maestro/i);

    expect((await ficha(e, e.ids.owner)).isActive).toBe(true);
    await e.app.close();
  });

  /**
   * La baja es **de un club**, y el club viaja en el aviso.
   *
   * Sin ese filtro bastaría con acertar el `ecoSub` para apagar a alguien en
   * cualquier club que lo tuviera fichado: el aviso del club B daría de baja al
   * alumno del club A. Hoy `eco_sub` es único en toda la base —una cuenta del
   * portal, una sola ficha—, así que el caso no puede darse todavía; el filtro
   * está puesto para el día que deje de serlo, y esto lo vigila mientras tanto.
   */
  it('un aviso de OTRO club no apaga a nadie de éste', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);
    await e.db
      .update(orgs)
      .set({ ecoOrgId: ECO_ORG_AJENO })
      .where(eq(orgs.id, e.otroOrgId));

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG_AJENO });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: false, aplicado: false });

    expect((await ficha(e, e.ids.alumno)).isActive).toBe(true);
    await e.app.close();
  });

  it('un club sin espejo no es un error, pero se dice', async () => {
    const e = await crearEscenario();
    await e.db.update(users).set({ ecoSub: ECO_SUB }).where(eq(users.id, e.ids.alumno));
    // Sin `eco_org_id`: ese club del portal no usa Membresías.

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: false, aplicado: false });
    expect((await ficha(e, e.ids.alumno)).isActive).toBe(true);
    await e.app.close();
  });

  it('la ficha sin cuenta del portal —la del alumno sin correo— no se toca', async () => {
    const e = await crearEscenario();
    await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
    // Nadie tiene `eco_sub`: son fichas que solo existen aquí.

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    expect(r.json().encontrada).toBe(false);

    const activos = await e.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, e.orgId), eq(users.isActive, true)));
    expect(activos.length).toBeGreaterThan(0);
    await e.app.close();
  });

  it('sin secreto configurado la ruta no existe', async () => {
    const e = await crearEscenario();
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    await enlazar(e, e.ids.alumno);

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG }, undefined);
    expect(r.statusCode).toBe(404);
    expect((await ficha(e, e.ids.alumno)).isActive).toBe(true);
    await e.app.close();
  });

  it('con el secreto equivocado no da de baja a nadie', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG }, 'otro-cualquiera');
    expect(r.statusCode).toBe(401);
    expect((await ficha(e, e.ids.alumno)).isActive).toBe(true);
    await e.app.close();
  });

  it('sin `ecoOrgId` se rechaza: una baja es de UN club, no de todos', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    const r = await darDeBaja(e, { ecoSub: ECO_SUB });
    expect(r.statusCode).toBe(422);
    expect((await ficha(e, e.ids.alumno)).isActive).toBe(true);
    await e.app.close();
  });

  it('repetir el aviso no rompe nada y lo dice', async () => {
    const e = await crearEscenario();
    await enlazar(e, e.ids.alumno);

    await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    const otra = await darDeBaja(e, { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG });
    expect(otra.statusCode).toBe(200);
    expect(otra.json()).toMatchObject({ encontrada: true, aplicado: false });
    expect(otra.json().motivo).toMatch(/ya estaba/i);
    await e.app.close();
  });
});
