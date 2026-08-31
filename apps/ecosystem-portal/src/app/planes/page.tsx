'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listPlanesAPI, type Plan } from '@/lib/api';
import { CORREO_ADMIN } from '@/lib/contacto';
import { ACADEMY_EN_EL_PORTAL } from '@/lib/apps';

const NOMBRE_APP: Record<string, string> = {
  academy: 'Academy',
  campeonatos: 'Campeonatos',
  membresias: 'Membresías',
};

/**
 * Qué se lleva quien contrata cada aplicación. Es lo que sustituye a la cifra:
 * si la página ya no dice un precio, tiene que decir con mucha más precisión
 * qué se está comprando, o no dice nada.
 *
 * Cada línea dice **qué consigue**, no con qué mecanismo — nadie contrata un
 * carnet QR ni una notificación push; se contrata dejar de perseguir a quien
 * no pagó. Es la misma regla que la portada, y por el mismo motivo: el canal
 * y el formato son decisiones de ingeniería y cambian; lo que se promete, no.
 */
const QUE_INCLUYE: Record<string, string[]> = {
  membresias: [
    'Sabes quién está al día y quién debe',
    'Cobras, y el vencimiento se actualiza solo',
    'Pasas lista en la puerta, con o sin internet',
    'Tus alumnos se enteran antes de que se les venza',
    'Ves el recaudo y la asistencia del mes',
  ],
  campeonatos: [
    'Montas el campeonato y armas las llaves',
    'Los maestros inscriben a su gente y tú apruebas',
    'Cada juez puntúa desde su tatami',
    'El público sigue el marcador en vivo',
    'Al terminar, resultados publicados y reportes listos',
  ],
  academy: [
    'Cada alumno ve qué le falta para el próximo cinturón',
    'Sus evaluaciones de grado quedan guardadas',
  ],
};

/**
 * **Planes — sin precio publicado, a propósito.**
 *
 * ── Por qué esta página ya no enseña cifras ───────────────────────────────
 *
 * Los precios que había (`priceMonthly` / `priceAnnual` de la base) son tarifas
 * planas al mes, y **el cobro va a ser por usuario**: un club de 15 alumnos y
 * uno de 300 no pagan lo mismo, y esa fue siempre la intención. Publicar la
 * tarifa plana mientras tanto es la clase de error que no se puede deshacer
 * con un despliegue —quien la leyó ya la leyó, y con razón espera pagarla—.
 * Ver §6.1 de OPERAR y §10.1 del plan maestro, donde se decide dónde vive el
 * precio unitario, cuál es el mínimo facturable y **qué cuenta como usuario**.
 *
 * Los campos siguen en la base y siguen viajando en la API: esto es una
 * decisión de **qué se publica**, no un borrado. Cuando el modelo por usuario
 * esté cerrado, esta pantalla vuelve a enseñar números — los buenos.
 *
 * ── Y por qué no se apagó la página entera ──
 *
 * Porque el pie del `layout` enlaza aquí desde TODAS las pantallas, y porque
 * la pregunta que trae a alguien a `/planes` («¿qué me llevo y cómo se paga?»)
 * tiene respuesta hoy aunque la cifra no la tenga. Lo que se quitó es el
 * número; lo que se puso en su sitio es qué incluye cada aplicación y cómo se
 * activa una suscripción.
 *
 * ── Academy ──
 *
 * Los planes que la incluyen se ocultan mientras el producto no se ofrezca. Es
 * el **mismo interruptor** que apaga su botón en el dashboard
 * (`ACADEMY_EN_EL_PORTAL`, en `lib/apps.ts`): encenderlo devuelve las dos
 * cosas a la vez, sin tener que acordarse de esta pantalla. Los planes siguen
 * existiendo en la base y el super-admin los sigue pudiendo asignar desde
 * `/admin`; lo que se oculta es el escaparate.
 */
export default function PlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    listPlanesAPI()
      .then((p) => {
        const visibles = ACADEMY_EN_EL_PORTAL
          ? p
          : p.filter((plan) => !plan.appsIncluded.includes('academy'));
        // De lo más simple a lo más completo: quien llega buscando una sola app
        // la encuentra primero.
        setPlanes(
          [...visibles].sort(
            (a, b) =>
              a.appsIncluded.length - b.appsIncluded.length ||
              a.name.localeCompare(b.name, 'es'),
          ),
        );
        setEstado('ok');
      })
      .catch(() => setEstado('error'));
  }, []);

  const asunto = (nombre: string) =>
    encodeURIComponent(`DINAMYT — Cotización: ${nombre}`);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Suscripción por organización</p>
          <h1 className="display text-3xl">Planes</h1>
        </div>
        <Link href="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Inicio
        </Link>
      </header>

      {/* ── Cómo se cobra, antes de las tarjetas ─────────────────────────
          Es la pregunta real de quien entra aquí, y contestarla arriba evita
          que se recorran seis tarjetas buscando un número que ya no está.
          Cuatro líneas, no cuatro párrafos: quien llega a `/planes` quiere una
          respuesta, no un contrato. */}
      <section className="card mb-8 p-5 sm:p-6" style={{ borderColor: 'var(--gold-dim)' }}>
        <h2 className="text-lg font-bold">Cómo se cobra</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ['Por organización', 'club, liga o federación — no por persona'],
            ['La cuenta es gratis', 'se paga que el club use las apps'],
            ['El precio se cotiza', 'depende del tamaño del club'],
            ['Sin pasarela', 'efectivo, transferencia, Nequi o Daviplata'],
          ].map(([titulo, detalle]) => (
            <div key={titulo} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="font-bold" style={{ color: 'var(--text)' }}>
                {titulo}
              </dt>
              <dd className="m-0" style={{ color: 'var(--text-muted)' }}>
                {detalle}
              </dd>
            </div>
          ))}
        </dl>
        <a
          className="btn btn-gold mt-5"
          href={`mailto:${CORREO_ADMIN}?subject=${asunto('quiero una cotización')}`}
        >
          Pedir una cotización
        </a>
      </section>

      <h2 className="display mb-4 text-xl sm:text-2xl">Qué entra en cada plan</h2>

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'error' && (
        <p style={{ color: 'var(--danger)' }}>
          No se pudieron cargar los planes. Escríbenos a{' '}
          <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
            {CORREO_ADMIN}
          </a>{' '}
          y te contamos por correo.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {planes.map((plan) => (
          <li key={plan.id} className="card flex flex-col p-5">
            <div className="flex flex-wrap gap-1.5">
              {plan.appsIncluded.map((app) => (
                <span key={app} className="badge badge-gold">
                  {NOMBRE_APP[app] ?? app}
                </span>
              ))}
            </div>
            <h3 className="mt-3 text-xl font-semibold">{plan.name}</h3>
            {plan.description && (
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {plan.description}
              </p>
            )}

            <ul className="mt-4 flex-1 space-y-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {plan.appsIncluded.flatMap((app) =>
                (QUE_INCLUYE[app] ?? []).map((linea) => (
                  <li key={`${app}-${linea}`} className="flex gap-2">
                    <span aria-hidden="true" style={{ color: 'var(--ok)' }}>
                      ✓
                    </span>
                    <span>{linea}</span>
                  </li>
                )),
              )}
            </ul>

            {/* La etiqueta es corta y siempre la misma. Llevaba el nombre del
                plan dentro —«Cotizar Campeonatos + Membresías»— y `.btn` es
                `white-space: nowrap`, así que ese botón fijaba un ancho mínimo
                de 327 px y sacaba la página entera fuera de un celular de 320.
                El nombre del plan sigue viajando en el asunto del correo, que
                es donde hace falta. */}
            <a
              className="btn btn-outline mt-5 w-full"
              href={`mailto:${CORREO_ADMIN}?subject=${asunto(plan.name)}`}
            >
              Pedir cotización
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>
        ¿Dudas sobre cuál te conviene, o necesitas algo que no está en esta
        lista?{' '}
        <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
          {CORREO_ADMIN}
        </a>
        .
      </p>
    </main>
  );
}
