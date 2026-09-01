import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { plans } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **Un plan borrado no se ofrece, no se asigna y no se cobra.**
 *
 * ── Qué estaba roto ──
 *
 * Borrar un plan es apagarlo (`DELETE /plans/:id` pone `is_active = false`),
 * porque los pagos ya registrados lo referencian y un borrado duro se llevaría
 * la contabilidad por delante. Pero `GET /plans` los devolvía TODOS, así que el
 * desplegable de «asignar plan» de la ficha del alumno se llenaba de tarifas
 * que el maestro había borrado hacía meses — y elegir una funcionaba.
 *
 * El resultado no era un error visible: era un alumno cobrando por un precio
 * que el club ya no ofrece, y un panel de recaudo descuadrado. Lo esperado SÍ
 * filtraba los planes muertos (ver `/reports/revenue`), así que el dinero que
 * entraba por una tarifa borrada no tenía contra qué compararse.
 *
 * ── Las tres puertas ──
 *
 * No basta con quitarlos del desplegable: una pantalla vieja que siguiera
 * abierta, o un id copiado de otra pestaña, entraban igual. Se cierran las
 * tres — listar, asignar y cobrar—, y por eso hay una prueba de cada una.
 */

describe('membresias-api — un plan borrado ya no se usa', () => {
  let e: Escenario;
  let vivo: string;
  let muerto: string;

  beforeEach(async () => {
    e = await crearEscenario();
    vivo = await crearPlan('Mensual', '60000');
    muerto = await crearPlan('Mensual viejo', '45000');
    const r = await e.app.inject({
      method: 'DELETE',
      url: `/plans/${muerto}`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(200);
  });

  async function crearPlan(name: string, price: string) {
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name, type: 'mensual', price },
    });
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  }

  it('borrar un plan lo apaga, no lo borra: los pagos viejos lo siguen encontrando', async () => {
    const [fila] = await e.db.select().from(plans).where(eq(plans.id, muerto));
    expect(fila).toBeTruthy();
    expect(fila.isActive).toBe(false);
  });

  // ── Puerta 1 · listar ──────────────────────────────────────────────────
  it('`GET /plans` no lo ofrece', async () => {
    const r = await e.app.inject({
      method: 'GET',
      url: '/plans',
      headers: e.auth(e.ids.owner),
    });
    const ids = r.json().map((p: { id: string }) => p.id);
    expect(ids).toContain(vivo);
    expect(ids).not.toContain(muerto);
  });

  it('`?todos=1` sí, que es como la pantalla de planes enseña los apagados', async () => {
    const r = await e.app.inject({
      method: 'GET',
      url: '/plans?todos=1',
      headers: e.auth(e.ids.owner),
    });
    const ids = r.json().map((p: { id: string }) => p.id);
    expect(ids).toContain(vivo);
    expect(ids).toContain(muerto);
  });

  // ── Puerta 2 · asignar ─────────────────────────────────────────────────
  it('no se le puede asignar a un alumno, aunque se mande el id a mano', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { currentPlanId: muerto },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toMatch(/ya no existe/i);
  });

  it('el que sigue vivo se asigna sin problema', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { currentPlanId: vivo },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().currentPlanId).toBe(vivo);
  });

  it('quitarle el plan a alguien (`null`) sigue valiendo', async () => {
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { currentPlanId: null },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().currentPlanId).toBeNull();
  });

  it('un plan de OTRO club tampoco se asigna', async () => {
    // El id existe y está vivo, pero no es de este club. Sin la comprobación,
    // esto metía a un alumno cobrando la tarifa de un club ajeno.
    const [ajeno] = await e.db
      .insert(plans)
      .values({ orgId: e.otroOrgId, name: 'Del rival', type: 'mensual', price: '99000' })
      .returning();

    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { currentPlanId: ajeno.id },
    });
    expect(r.statusCode).toBe(422);
  });

  // ── Puerta 3 · cobrar ──────────────────────────────────────────────────
  it('no se le puede registrar un pago', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: `/memberships/${e.ids.alumno}/payments`,
      headers: e.auth(e.ids.owner),
      payload: { planId: muerto, amount: '45000', method: 'efectivo' },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toMatch(/ya no existe/i);
  });

  it('con el plan vivo, el cobro entra como siempre', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: `/memberships/${e.ids.alumno}/payments`,
      headers: e.auth(e.ids.owner),
      payload: { planId: vivo, amount: '60000', method: 'efectivo' },
    });
    expect(r.statusCode).toBe(201);
    await e.app.close();
  });
});
