/**
 * Reconciliación de identidades — la lógica (§2.4 del plan maestro).
 *
 * Vive separada del guion que la ejecuta para poder ENSAYARLA: el plan pide
 * «guion escrito y ensayado sobre una copia antes de tocar nada», y
 * `probar-reconciliacion.mjs` la corre entera contra un PostgreSQL de mentira
 * (PGlite) con datos de los tres censos.
 *
 * Todo el trabajo ocurre dentro de una transacción que abre quien llama. Este
 * archivo no sabe conectarse ni imprimir: recibe `tx` y devuelve el informe.
 *
 * `tx` es una plantilla etiquetada al estilo de postgres.js:
 *     await tx`SELECT * FROM ecosystem.users WHERE id = ${id}`
 *     await tx`UPDATE ecosystem.users SET ${tx({ phone })} WHERE id = ${id}`
 */

import { randomUUID } from 'node:crypto';

// ── Normalización ───────────────────────────────────────────────────────────

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export const HASH_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const correoDe = (v) => String(v ?? '').trim().toLowerCase();

export const mayus = (v) =>
  String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es');

/** Sin tildes, sin dobles espacios y en mayúsculas: para cruzar nombres de club. */
export const claveNombre = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

/** Nombre corto y estable para `organizations.slug`. */
export const slugificar = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || null;

// ── Roles ───────────────────────────────────────────────────────────────────
//
// El rol GENERAL (`org_members.role`) es el del portal: decide quién gestiona
// el club. Los roles por app son la verdad de cada producto y viajan en el
// token como `role_membresias` / `role_campeonatos`.

export const ROL_GENERAL_MEMBRESIAS = {
  owner: 'maestro', // el dueño del club lo gestiona también en el portal
  staff: 'staff',
  guardian: 'guardian',
  student: 'student',
};

export const ROL_CAMPEONATOS = { admin: 'admin', maestro: 'maestro', juez: 'judge' };

// Un juez no gestiona el club al que pertenece: entra como miembro a secas.
export const ROL_GENERAL_CAMPEONATOS = {
  admin: 'admin',
  maestro: 'maestro',
  juez: 'member',
};

// ── Informe ─────────────────────────────────────────────────────────────────

export function nuevoInforme(aplicar) {
  return {
    fecha: new Date().toISOString(),
    modo: aplicar ? 'aplicado' : 'ensayo en seco',
    clubes: { creados: [], enlazados: [], campeonatosSinCruce: [] },
    personas: {
      creadas: [],
      enlazadas: [],
      sinCorreo: [],
      sinContrasena: [],
      superadminsDetectados: [],
      rolesEnConflicto: [],
    },
    pertenencias: { creadas: [], actualizadas: [], sinClub: [] },
    avisos: [],
  };
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

async function existeTabla(tx, esquema, tabla) {
  const filas = await tx`
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = ${esquema} AND table_name = ${tabla} LIMIT 1`;
  return filas.length > 0;
}

async function existeColumna(tx, esquema, tabla, columna) {
  const filas = await tx`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = ${esquema} AND table_name = ${tabla}
       AND column_name = ${columna} LIMIT 1`;
  return filas.length > 0;
}

/** Los dojangs de una fila de Campeonatos, en forma canónica. */
export function clubesDeFila(u) {
  const crudo = typeof u.clubes === 'string' ? seguroJson(u.clubes) : u.clubes;
  const lista = Array.isArray(crudo) ? crudo : [];
  const normalizados = lista
    .map((c) =>
      typeof c === 'string'
        ? { nombre: c, ciudad: null, pais: null }
        : { nombre: c?.nombre, ciudad: c?.ciudad ?? null, pais: c?.pais ?? null },
    )
    .filter((c) => c.nombre && String(c.nombre).trim());
  if (normalizados.length) return normalizados;
  return u.club ? [{ nombre: u.club, ciudad: u.delegacion, pais: u.pais_delegacion }] : [];
}

function seguroJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// ── El trabajo ──────────────────────────────────────────────────────────────

/**
 * @param {Function} tx    plantilla etiquetada al estilo postgres.js
 * @param {object}   opts  { crearClubesCampeonatos, sinSuperusuario, aplicar, log }
 * @returns informe
 */
export async function reconciliar(tx, opts = {}) {
  const informe = nuevoInforme(opts.aplicar);
  const log = opts.log ?? (() => {});

  // ── 0. Comprobaciones previas ─────────────────────────────────────────────
  const [rol] = await tx`
    SELECT current_user AS usuario, current_database() AS base,
           (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super`;
  log(`Base ${rol.base}, conectado como ${rol.usuario}.`);

  if (!rol.super && !opts.sinSuperusuario) {
    throw new Error(
      `El rol "${rol.usuario}" no es superusuario. Las tablas de Membresías y ` +
        'Campeonatos tienen RLS en modo FORCE: un rol normal vería solo una parte ' +
        'de las filas, y el guion daría por reconciliado lo que nunca vio.\n' +
        'Córrelo como el usuario `postgres` (o pasa --sin-superusuario si sabes lo que haces).',
    );
  }

  if (!(await existeTabla(tx, 'ecosystem', 'users'))) {
    throw new Error(
      'No existe `ecosystem.users`. ¿Corriste `pnpm db:migrate` del ecosystem?',
    );
  }
  if (!(await existeColumna(tx, 'ecosystem', 'users', 'origen'))) {
    throw new Error(
      'A `ecosystem.users` le falta la columna `origen`. Aplica antes la migración ' +
        '0004_identidad_importada (`pnpm --filter @dinamyt/ecosystem-api db:migrate`).',
    );
  }

  const hayMembresias = await existeTabla(tx, 'membresias', 'users');
  const hayCampeonatos = await existeTabla(tx, 'campeonatos', 'usuarios');
  if (!hayMembresias) informe.avisos.push('No hay esquema `membresias`: se salta esa parte.');
  if (!hayCampeonatos) informe.avisos.push('No hay esquema `campeonatos`: se salta esa parte.');

  // ── 1. Anclajes: las columnas espejo (§9 del plan) ────────────────────────
  //
  // `IF NOT EXISTS` en todo: correrlo dos veces no molesta a nadie. Se añaden
  // aquí y no con una migración de cada app porque el guion tiene que poder
  // correr ANTES de que las apps sepan de ellas.
  if (hayMembresias) {
    await tx`ALTER TABLE membresias.orgs  ADD COLUMN IF NOT EXISTS eco_org_id uuid`;
    await tx`ALTER TABLE membresias.users ADD COLUMN IF NOT EXISTS eco_sub    uuid`;
    await tx`CREATE UNIQUE INDEX IF NOT EXISTS ux_membresias_users_eco_sub
               ON membresias.users (eco_sub) WHERE eco_sub IS NOT NULL`;
  }
  if (hayCampeonatos) {
    await tx`ALTER TABLE campeonatos.usuarios ADD COLUMN IF NOT EXISTS eco_sub uuid`;
    await tx`CREATE UNIQUE INDEX IF NOT EXISTS ux_campeonatos_usuarios_eco_sub
               ON campeonatos.usuarios (eco_sub) WHERE eco_sub IS NOT NULL`;
    if (await existeTabla(tx, 'campeonatos', 'campeonatos')) {
      await tx`ALTER TABLE campeonatos.campeonatos ADD COLUMN IF NOT EXISTS eco_org_id uuid`;
    }
  }

  // ── 2. El censo de organizaciones que ya hay ──────────────────────────────
  const orgsEco = await tx`SELECT id, name, slug FROM ecosystem.organizations`;
  const porSlug = new Map();
  const porNombre = new Map();
  const recordarOrg = (fila) => {
    if (fila.slug) porSlug.set(fila.slug, fila);
    porNombre.set(claveNombre(fila.name), fila);
  };
  for (const o of orgsEco) recordarOrg(o);

  /** Crea la organización y la deja registrada en los dos índices. */
  async function crearOrg({ nombre, slug, city, country, logoUrl, isActive }) {
    // El slug es único: si otro club ya lo tomó, se le añade un sufijo corto.
    let candidato = slug;
    if (candidato && porSlug.has(candidato)) {
      candidato = `${candidato}-${randomUUID().slice(0, 4)}`.slice(0, 60);
    }
    const [fila] = await tx`
      INSERT INTO ecosystem.organizations (name, slug, type, city, country, logo_url, is_active)
      VALUES (${nombre}, ${candidato}, 'CLUB', ${city ?? null}, ${country ?? 'Colombia'},
              ${logoUrl ?? null}, ${isActive ?? true})
      RETURNING id, name, slug`;
    recordarOrg(fila);
    return fila;
  }

  // ── 3. Clubes de Membresías ───────────────────────────────────────────────
  const orgsMembresias = hayMembresias
    ? await tx`SELECT id, name, slug, city, country, logo_url, is_active, eco_org_id
                 FROM membresias.orgs ORDER BY created_at NULLS LAST, name`
    : [];

  /** id de `membresias.orgs` → organización del ecosistema */
  const ecoDeOrgMembresias = new Map();

  for (const org of orgsMembresias) {
    let eco = null;

    if (org.eco_org_id) {
      const [ya] = await tx`
        SELECT id, name, slug FROM ecosystem.organizations
         WHERE id = ${org.eco_org_id} LIMIT 1`;
      if (ya) eco = ya;
      else
        informe.avisos.push(
          `El club «${org.name}» apuntaba a una organización que ya no existe (${org.eco_org_id}); se vuelve a enlazar.`,
        );
    }

    if (!eco) eco = porSlug.get(org.slug) ?? porNombre.get(claveNombre(org.name)) ?? null;

    if (eco) {
      informe.clubes.enlazados.push({ membresias: org.name, ecosystem: eco.id });
    } else {
      eco = await crearOrg({
        nombre: org.name,
        slug: org.slug ?? slugificar(org.name),
        city: org.city,
        country: org.country,
        logoUrl: org.logo_url,
        isActive: org.is_active,
      });
      informe.clubes.creados.push({ origen: 'membresias', nombre: org.name, id: eco.id });
    }

    if (org.eco_org_id !== eco.id) {
      await tx`UPDATE membresias.orgs SET eco_org_id = ${eco.id} WHERE id = ${org.id}`;
    }
    ecoDeOrgMembresias.set(org.id, eco);
  }

  // ── 4. Los tres censos de personas ────────────────────────────────────────
  const usuariosEco = await tx`
    SELECT id, email, full_name, phone, birth_date, blood_type, origen,
           emergency_contact_name, emergency_contact_phone
      FROM ecosystem.users`;

  const usuariosMembresias = hayMembresias
    ? await tx`SELECT id, email, full_name, password_hash, phone, birth_date, blood_type,
                      emergency_name, emergency_phone, role, is_super_admin, is_active,
                      org_id, eco_sub
                 FROM membresias.users ORDER BY created_at NULLS LAST, email`
    : [];

  const usuariosCampeonatos = hayCampeonatos
    ? await tx`SELECT id, email, nombre, password_hash, rol, es_superadmin, activo,
                      club, clubes, delegacion, pais_delegacion, eco_sub
                 FROM campeonatos.usuarios
                WHERE eliminado_at IS NULL ORDER BY created_at NULLS LAST, email`
    : [];

  log(
    `Censos: ecosystem ${usuariosEco.length} · membresias ${usuariosMembresias.length} · campeonatos ${usuariosCampeonatos.length}`,
  );

  // ── 5. Clubes que solo conoce Campeonatos ─────────────────────────────────
  //
  // Ahí el club es texto libre dentro de `usuarios.clubes` (JSON). Se cruza por
  // nombre normalizado contra lo que ya existe; lo que no case NO se inventa:
  // se lista para que el maestro lo confirme (§2.4, paso 1).
  const clubesCampeonatos = new Map(); // clave → { nombre, ciudad, pais, maestros[] }

  for (const u of usuariosCampeonatos) {
    for (const club of clubesDeFila(u)) {
      const clave = claveNombre(club.nombre);
      if (!clubesCampeonatos.has(clave)) {
        clubesCampeonatos.set(clave, {
          nombre: String(club.nombre).trim(),
          ciudad: club.ciudad ?? null,
          pais: club.pais ?? null,
          maestros: [],
        });
      }
      clubesCampeonatos.get(clave).maestros.push(correoDe(u.email));
    }
  }

  /** clave de nombre → organización del ecosistema (solo las que cruzaron) */
  const ecoDeClubCampeonatos = new Map();

  for (const [clave, club] of clubesCampeonatos) {
    const eco = porNombre.get(clave) ?? porSlug.get(slugificar(club.nombre)) ?? null;
    if (eco) {
      ecoDeClubCampeonatos.set(clave, eco);
      informe.clubes.enlazados.push({ campeonatos: club.nombre, ecosystem: eco.id });
      continue;
    }
    if (opts.crearClubesCampeonatos) {
      const creado = await crearOrg({
        nombre: club.nombre,
        slug: slugificar(club.nombre),
        city: club.ciudad,
        country: club.pais,
      });
      ecoDeClubCampeonatos.set(clave, creado);
      informe.clubes.creados.push({
        origen: 'campeonatos',
        nombre: club.nombre,
        id: creado.id,
      });
    } else {
      informe.clubes.campeonatosSinCruce.push({
        nombre: club.nombre,
        ciudad: club.ciudad,
        pais: club.pais,
        maestros: club.maestros,
      });
    }
  }

  // ── 6. Personas: cruce por correo ─────────────────────────────────────────
  const personas = new Map(); // correo → { eco, memb, camp }
  const meter = (correo, clave, fila) => {
    if (!personas.has(correo)) personas.set(correo, { eco: null, memb: null, camp: null });
    personas.get(correo)[clave] = fila;
  };

  for (const u of usuariosEco) {
    const correo = correoDe(u.email);
    if (correo) meter(correo, 'eco', u);
  }
  for (const u of usuariosMembresias) {
    const correo = correoDe(u.email);
    if (!correo || !CORREO_VALIDO.test(correo)) {
      informe.personas.sinCorreo.push({
        app: 'membresias',
        id: u.id,
        nombre: u.full_name,
        email: u.email,
      });
      continue;
    }
    meter(correo, 'memb', u);
  }
  for (const u of usuariosCampeonatos) {
    const correo = correoDe(u.email);
    if (!correo || !CORREO_VALIDO.test(correo)) {
      informe.personas.sinCorreo.push({
        app: 'campeonatos',
        id: u.id,
        nombre: u.nombre,
        email: u.email,
      });
      continue;
    }
    meter(correo, 'camp', u);
  }

  /** correo → id de la cuenta del ecosistema */
  const subDe = new Map();

  for (const [correo, p] of personas) {
    if (!p.memb && !p.camp) continue; // ya estaba en el ecosistema y en ninguna app

    const hashMembresias = HASH_BCRYPT.test(String(p.memb?.password_hash ?? ''))
      ? p.memb.password_hash
      : null;
    const hashCampeonatos = HASH_BCRYPT.test(String(p.camp?.password_hash ?? ''))
      ? p.camp.password_hash
      : null;

    if (p.eco) {
      // Ya tiene cuenta: se enlaza y se rellenan huecos, nada más. Lo que la
      // persona escribió en el portal manda sobre lo que traiga el club.
      subDe.set(correo, p.eco.id);
      const huecos = {};
      if (!p.eco.phone && p.memb?.phone) huecos.phone = p.memb.phone;
      if (!p.eco.birth_date && p.memb?.birth_date) huecos.birth_date = p.memb.birth_date;
      if (!p.eco.blood_type && p.memb?.blood_type) huecos.blood_type = p.memb.blood_type;
      if (!p.eco.emergency_contact_name && p.memb?.emergency_name)
        huecos.emergency_contact_name = p.memb.emergency_name;
      if (!p.eco.emergency_contact_phone && p.memb?.emergency_phone)
        huecos.emergency_contact_phone = p.memb.emergency_phone;

      if (Object.keys(huecos).length) {
        await tx`UPDATE ecosystem.users SET ${tx(huecos)} WHERE id = ${p.eco.id}`;
      }
      informe.personas.enlazadas.push({
        correo,
        id: p.eco.id,
        huecosRellenados: Object.keys(huecos),
      });
    } else {
      // Cuenta nueva.
      const origen =
        p.memb && p.camp
          ? 'importado-ambas'
          : p.memb
            ? 'importado-membresias'
            : 'importado-campeonatos';
      const hash = hashMembresias ?? hashCampeonatos;
      const passwordOrigen = hashMembresias
        ? 'membresias'
        : hashCampeonatos
          ? 'campeonatos'
          : null;
      const nombre = mayus(p.memb?.full_name ?? p.camp?.nombre ?? correo.split('@')[0]);
      const activo = p.memb ? p.memb.is_active !== false : p.camp?.activo !== false;

      const [creado] = await tx`
        INSERT INTO ecosystem.users
          (email, full_name, phone, birth_date, password_hash, password_origen, origen,
           is_email_verified, is_active, blood_type,
           emergency_contact_name, emergency_contact_phone)
        VALUES
          (${correo}, ${nombre}, ${p.memb?.phone ?? null}, ${p.memb?.birth_date ?? null},
           ${hash}, ${passwordOrigen}, ${origen},
           true, ${activo}, ${p.memb?.blood_type ?? null},
           ${p.memb?.emergency_name ?? null}, ${p.memb?.emergency_phone ?? null})
        RETURNING id`;

      subDe.set(correo, creado.id);
      informe.personas.creadas.push({ correo, id: creado.id, origen, nombre });

      if (!hash) {
        informe.personas.sinContrasena.push({
          correo,
          motivo: 'el hash de origen no es un bcrypt legible',
        });
      }
    }

    const sub = subDe.get(correo);

    // El enlace, a los dos lados.
    if (p.memb && p.memb.eco_sub !== sub) {
      await tx`UPDATE membresias.users SET eco_sub = ${sub} WHERE id = ${p.memb.id}`;
    }
    if (p.camp && p.camp.eco_sub !== sub) {
      await tx`UPDATE campeonatos.usuarios SET eco_sub = ${sub} WHERE id = ${p.camp.id}`;
    }

    // Superadmins: se anotan, no se conceden.
    if (p.memb?.is_super_admin || p.camp?.es_superadmin) {
      informe.personas.superadminsDetectados.push({
        correo,
        id: sub,
        membresias: Boolean(p.memb?.is_super_admin),
        campeonatos: Boolean(p.camp?.es_superadmin),
      });
    }
  }

  // ── 7. Pertenencia: `ecosystem.org_members` ───────────────────────────────
  async function asegurarMiembro(orgId, userId, { general, membresias, campeonatos }) {
    const [ya] = await tx`
      SELECT id, role, role_membresias, role_campeonatos
        FROM ecosystem.org_members
       WHERE org_id = ${orgId} AND user_id = ${userId} LIMIT 1`;

    if (!ya) {
      await tx`
        INSERT INTO ecosystem.org_members (org_id, user_id, role, role_membresias, role_campeonatos)
        VALUES (${orgId}, ${userId}, ${general ?? 'member'},
                ${membresias ?? null}, ${campeonatos ?? null})`;
      informe.pertenencias.creadas.push({ orgId, userId, general, membresias, campeonatos });
      return;
    }

    // Existe: solo se llenan los roles por app que estén vacíos. Un rol puesto
    // a mano desde el portal manda sobre lo que traiga la importación.
    const cambios = {};
    if (membresias && !ya.role_membresias) cambios.role_membresias = membresias;
    if (campeonatos && !ya.role_campeonatos) cambios.role_campeonatos = campeonatos;
    if (Object.keys(cambios).length) {
      await tx`UPDATE ecosystem.org_members SET ${tx(cambios)} WHERE id = ${ya.id}`;
      informe.pertenencias.actualizadas.push({ orgId, userId, ...cambios });
    }
  }

  for (const [correo, p] of personas) {
    const sub = subDe.get(correo);
    if (!sub) continue;

    const rolMembresias = p.memb?.role ?? null;
    const rolCampeonatos = p.camp?.rol ? (ROL_CAMPEONATOS[p.camp.rol] ?? null) : null;

    if (rolMembresias && p.camp?.rol === 'admin' && rolMembresias !== 'owner') {
      informe.personas.rolesEnConflicto.push({
        correo,
        membresias: rolMembresias,
        campeonatos: p.camp.rol,
        resuelto: 'manda el de Membresías para el rol general del portal',
      });
    }

    const general = rolMembresias
      ? (ROL_GENERAL_MEMBRESIAS[rolMembresias] ?? 'member')
      : (ROL_GENERAL_CAMPEONATOS[p.camp?.rol] ?? 'member');

    // El club del lado de Membresías manda: ahí el club es una fila con
    // identidad propia y no un texto escrito a mano.
    const orgMembresias = p.memb?.org_id ? ecoDeOrgMembresias.get(p.memb.org_id) : null;

    // Clubes del lado de Campeonatos (un maestro puede dirigir varios).
    const orgsCampeonatos = [];
    if (p.camp) {
      for (const club of clubesDeFila(p.camp)) {
        const eco = ecoDeClubCampeonatos.get(claveNombre(club.nombre));
        if (eco) orgsCampeonatos.push(eco);
      }
    }

    const destinos = new Map();
    if (orgMembresias) {
      destinos.set(orgMembresias.id, {
        general,
        membresias: rolMembresias,
        campeonatos: null,
      });
    }
    for (const eco of orgsCampeonatos) {
      const ya = destinos.get(eco.id);
      if (ya) ya.campeonatos = rolCampeonatos;
      else
        destinos.set(eco.id, {
          general: orgMembresias ? 'member' : general,
          membresias: null,
          campeonatos: rolCampeonatos,
        });
    }

    if (destinos.size === 0) {
      informe.pertenencias.sinClub.push({
        correo,
        motivo: p.memb
          ? 'su usuario de Membresías no tiene club'
          : 'su club de Campeonatos no cruzó con ninguna organización',
      });
      continue;
    }

    for (const [orgId, roles] of destinos) {
      await asegurarMiembro(orgId, sub, roles);
    }
  }

  return informe;
}
