#!/usr/bin/env node
/**
 * Borrar la cuenta de alguien que lo pidió por correo (admin@), sin que entre.
 *
 *   pnpm --filter @dinamyt/ecosystem-api suprimir:persona --correo ana@x.com                   # mirar
 *   pnpm --filter @dinamyt/ecosystem-api suprimir:persona --correo ana@x.com --programar       # en 7 días
 *   pnpm --filter @dinamyt/ecosystem-api suprimir:persona --correo ana@x.com --programar --ya  # en el próximo barrido
 *   pnpm --filter @dinamyt/ecosystem-api suprimir:persona --correo ana@x.com --cancelar
 *   pnpm --filter @dinamyt/ecosystem-api suprimir:persona --id <uuid> …    # si el correo da varias
 *
 * Hace lo mismo que el botón de Configuración —poner `borrar_el` y cerrar sus
 * sesiones—, salvo escribirle al correo: la persona ya lo pidió por escrito.
 * El borrado de verdad lo hace el barrido diario de las 08:00
 * (`SupresionService.ejecutarVencidas`). No hay una segunda copia de qué se
 * borra: esto solo programa. `--ya` es para una solicitud ya confirmada por
 * escrito, que no necesita los siete días.
 *
 * Sin `--programar` ni `--cancelar` solo enseña el estado.
 *
 * Antes de programarlo, comprueba lo mismo que la pantalla: que no sea la
 * única persona que administra un club, ni un super administrador. Y como la
 * pantalla, no cancela con el plazo vencido: el barrido puede estar a medias.
 *
 * Por correo puede salir más de una cuenta: la migración 0015 dejó a propósito
 * las que solo se distinguen en mayúsculas (`Ana@x.com` y `ana@x.com`). Entonces
 * las lista y pide `--id`.
 */

import 'dotenv/config';
import postgres from 'postgres';

const args = process.argv.slice(2);
const valor = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const correo = (valor('--correo') ?? '').trim().toLowerCase();
const idPedido = (valor('--id') ?? '').trim();
const programar = args.includes('--programar');
const ya = args.includes('--ya');
const cancelar = args.includes('--cancelar');
const url =
  args.find((a) => a.startsWith('--url='))?.slice(6) ?? process.env.DATABASE_URL ?? '';
const esquema = process.env.DB_SCHEMA || 'ecosystem';

if (!correo && !idPedido) {
  console.error('Falta --correo con la dirección de la cuenta (o --id).');
  process.exit(1);
}
if (programar && cancelar) {
  console.error('O --programar o --cancelar, no los dos.');
  process.exit(1);
}
if (!url) {
  console.error('Falta la cadena de conexión. Ponla en DATABASE_URL o pásala con --url=…');
  process.exit(1);
}

// Igual que `fotos:al-disco`: sin host en la cadena se habla por el socket.
const autoridad = /^[a-z+]+:\/\/([^/?]*)/i.exec(url)?.[1] ?? '';
const host = autoridad.slice(autoridad.indexOf('@') + 1);
const sql = postgres(url, {
  onnotice: () => {},
  max: 1,
  ...(host ? {} : { host: process.env.PGHOST ?? '/var/run/postgresql' }),
});
const t = (tabla) => sql(`${esquema}.${tabla}`.split('.'));

try {
  const cuentas = await sql`
    SELECT id, email, full_name, is_super_admin, borrar_el, borrada_el
      FROM ${t('users')}
     WHERE ${idPedido ? sql`id::text = ${idPedido}` : sql`lower(email) = ${correo}`}`;
  if (cuentas.length === 0) {
    console.log(`\nNo hay ninguna cuenta con ${idPedido || correo}.\n`);
    process.exit(0);
  }
  if (cuentas.length > 1) {
    console.error(`\n  ✗ Con ${correo} hay ${cuentas.length} cuentas. Repite con --id:\n`);
    for (const c of cuentas) console.error(`    ${c.id} · ${c.email} · ${c.full_name}`);
    console.error('');
    process.exit(1);
  }
  const [p] = cuentas;
  const solas = await sql`
    SELECT o.name
      FROM ${t('org_members')} m
      JOIN ${t('organizations')} o ON o.id = m.org_id
     WHERE m.user_id = ${p.id}
       -- Los de ROLES_GESTOR (src/common/roles.ts).
       AND m.role IN ('admin', 'owner', 'maestro')
       AND o.is_active IS NOT FALSE
       AND NOT EXISTS (
         SELECT 1 FROM ${t('org_members')} otro
          WHERE otro.org_id = m.org_id AND otro.user_id <> m.user_id
            AND otro.role IN ('admin', 'owner', 'maestro'))`;

  console.log(`\n  Cuenta:  ${p.id} · ${p.full_name}`);
  console.log(
    `  Estado:  ${
      p.borrada_el
        ? `borrada el ${p.borrada_el.toISOString()}`
        : p.borrar_el
          ? `se borrará el ${p.borrar_el.toISOString()}`
          : 'sin borrado pedido'
    }`,
  );
  if (solas.length) console.log(`  ⚠ Es la única que administra: ${solas.map((s) => s.name).join(', ')}`);

  if (p.borrada_el && (programar || cancelar)) {
    console.log('\n  Ya está borrada: no hay nada que programar ni que cancelar.\n');
  } else if (cancelar) {
    const filas = await sql`
      UPDATE ${t('users')} SET borrar_el = NULL, updated_at = now()
       WHERE id = ${p.id} AND (borrar_el IS NULL OR borrar_el > now())
   RETURNING id`;
    if (filas.length === 0) {
      console.error('\n  ✗ El plazo ya venció: el barrido puede estar a medias y no se cancela.\n');
      process.exitCode = 1;
    } else {
      console.log('\n  ✓ Borrado cancelado.\n');
    }
  } else if (programar) {
    if (p.is_super_admin) {
      console.error('\n  ✗ Es super administrador: quítale ese permiso antes.\n');
      process.exitCode = 1;
    } else if (solas.length) {
      console.error('\n  ✗ Nombra antes a otra persona que administre esos clubes.\n');
      process.exitCode = 1;
    } else if (p.borrar_el && p.borrar_el <= new Date()) {
      console.error('\n  ✗ Ya se está borrando: no se vuelve a programar.\n');
      process.exitCode = 1;
    } else {
      const [{ cuando }] = await sql`
        UPDATE ${t('users')}
           -- Los 7 son DIAS_DE_GRACIA (supresion.service.ts).
           SET borrar_el = ${ya ? sql`now()` : sql`now() + interval '7 days'`}, updated_at = now()
         WHERE id = ${p.id}
     RETURNING borrar_el AS cuando`;
      await sql`
        UPDATE ${t('sessions')} SET revoked_at = now(), revoked_reason = 'borrado'
         WHERE user_id = ${p.id} AND revoked_at IS NULL`;
      console.log(`\n  ✓ Programado para ${cuando.toISOString()}; sus sesiones quedaron cerradas.`);
      console.log('    Lo hace el barrido diario de las 08:00 (OPERAR §4.15).\n');
    }
  } else {
    console.log('\n  Solo mirar. Usa --programar (y --ya) o --cancelar para cambiarlo.\n');
  }
} finally {
  await sql.end();
}
