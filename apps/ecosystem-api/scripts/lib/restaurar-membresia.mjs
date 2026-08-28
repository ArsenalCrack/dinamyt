/**
 * Devolver a alguien a su organización — la lógica.
 *
 * Vive separada del guion que la ejecuta por la misma razón que la
 * reconciliación: para poder ENSAYARLA. `probar-restauracion.mjs` la corre
 * entera contra un PostgreSQL de verdad (PGlite) con las migraciones reales,
 * incluida la avería que la hizo falta. Un guion que solo se prueba apuntando a
 * producción no se prueba nunca.
 *
 * Este archivo no sabe conectarse ni imprimir: recibe `tx` y devuelve el
 * informe. `tx` es una plantilla etiquetada al estilo de postgres.js:
 *
 *     await tx`SELECT * FROM ecosystem.users WHERE id = ${id}`
 */

/**
 * El rol de la persona en Membresías, deducido del general.
 *
 * El club en Membresías tiene un `owner` —su maestro— y no un «maestro»: los
 * catálogos son distintos y el que manda aquí no se llama igual allí. Es el
 * mismo reparto que hace el portal al aceptar una solicitud de entrada.
 */
export const ROL_EN_MEMBRESIAS = {
  maestro: 'owner',
  owner: 'owner',
  admin: 'owner',
  staff: 'staff',
  coach: 'staff',
  guardian: 'guardian',
  student: 'student',
  competitor: 'student',
};

/** Los roles que mandan en una organización (el catálogo de `common/roles.ts`). */
export const ROLES_GESTOR = ['admin', 'owner', 'maestro'];

/**
 * Las tildes que se aplanan y en qué se aplanan. **Los dos del mismo largo**:
 * `translate()` los empareja carácter a carácter.
 */
export const CON_TILDE = 'áàäâãéèëêíìïîóòöôõúùüûñç';
export const SIN_TILDE = 'aaaaaeeeeiiiiooooouuuunc';

/**
 * Sin tildes, sin dobles espacios y en minúsculas.
 *
 * ── Por qué las comparaciones llevan `translate()` al lado ──
 *
 * Esto aplana LO QUE SE BUSCA. Si la base se compara con `lower()` a secas, el
 * resultado es peor que no normalizar nada: buscar «Hapkido del Condor Cúcuta»
 * se convierte en «...cucuta», que ya no cuadra con el «Cúcuta» que hay
 * guardado — y el guion contesta «ninguna organización cuadra» sobre una
 * organización que existe. Pasó a la primera.
 *
 * Por eso las dos mitades se aplanan: aquí con `normalize('NFD')` y allí con
 * `translate(lower(...), CON_TILDE, SIN_TILDE)`. Se usa `translate` y no la
 * extensión `unaccent` porque `unaccent` hay que instalarla, y un guion de
 * reparación no puede depender de que alguien se acordara.
 */
export const clave = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un fallo que ya trae escrito lo que hay que hacer. Lo imprime el guion. */
export class NoSePuede extends Error {}

/** Quién manda hoy en esa organización. Es lo que se compara antes y después. */
async function gestoresDe(tx, orgId) {
  return tx`
    SELECT u.full_name AS nombre, m.role AS rol
      FROM ecosystem.org_members m
      JOIN ecosystem.users u ON u.id = m.user_id
     WHERE m.org_id = ${orgId} AND m.role IN ${tx(ROLES_GESTOR)}
     ORDER BY u.full_name
  `;
}

/** Las palabras de tres letras para arriba. «del», «de», «la» no distinguen nada. */
const palabrasDe = (texto) => clave(texto).split(' ').filter((p) => p.length >= 3);

/**
 * Cuando no cuadra nada, enseñar lo que SÍ hay.
 *
 * Un «no cuadra» a secas deja al que lo lee adivinando si escribió mal el
 * nombre, si el club se llama de otra forma o si de verdad no existe. Con la
 * lista delante, las tres preguntas se contestan solas.
 *
 * Se ordena por cuántas palabras comparte, y si no comparte ninguna se enseña
 * el principio de la lista igual: en un despliegue real son unas pocas docenas.
 */
function ordenarPorParecido(filas, buscado) {
  const palabras = palabrasDe(buscado);
  return filas
    .map((f) => ({
      fila: f,
      puntos: palabras.filter((p) => clave(f.name ?? f.full_name).includes(p)).length,
    }))
    .sort((a, b) => b.puntos - a.puntos)
    .map((x) => x.fila);
}

/**
 * Busca a la persona y a la organización, y devuelve la fila de `org_members`
 * a su sitio.
 *
 * No elige por su cuenta: si lo tecleado cuadra con más de una persona o más de
 * una organización, lanza `NoSePuede` con la lista. Restaurar a quien no era es
 * peor que no restaurar a nadie.
 */
export async function restaurar(tx, opciones) {
  const {
    persona: buscadoPersona,
    club: buscadoClub,
    rol = 'maestro',
    rolMembresias,
    desde,
    forzarRol = false,
  } = opciones;

  // ── A quién ───────────────────────────────────────────────────────────────
  const b = clave(buscadoPersona);
  const personas = await tx`
    SELECT id, email, document_id, full_name
      FROM ecosystem.users
     WHERE lower(email) = ${b}
        OR lower(document_id) = ${b}
        OR (${UUID.test(buscadoPersona)} AND id::text = ${buscadoPersona})
        OR translate(lower(full_name), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${'%' + b + '%'}
     LIMIT 25
  `;

  if (personas.length === 0) {
    const cerca = await tx`
      SELECT id, email, full_name
        FROM ecosystem.users
       ORDER BY full_name
       LIMIT 60
    `;
    const sugeridas = ordenarPorParecido(cerca, buscadoPersona).slice(0, 10);
    throw new NoSePuede(
      `Nadie cuadra con «${buscadoPersona}».` +
        (sugeridas.length
          ? '\n  Por si acaso, algunas de las que hay:\n' +
            sugeridas
              .map((p) => `    ${p.full_name} · ${p.email ?? 'sin correo'} · ${p.id}`)
              .join('\n') +
            '\n  Si no está, búscala por correo o por documento.'
          : ''),
    );
  }
  if (personas.length > 1) {
    throw new NoSePuede(
      `«${buscadoPersona}» cuadra con ${personas.length} personas:\n` +
        personas
          .map((p) => `    ${p.full_name} · ${p.email ?? 'sin correo'} · ${p.id}`)
          .join('\n') +
        '\n  Repite con el correo exacto o con el id.',
    );
  }
  const persona = personas[0];

  // ── A qué organización ────────────────────────────────────────────────────
  const c = clave(buscadoClub);
  const clubes = await tx`
    SELECT id, name, slug, type, is_active
      FROM ecosystem.organizations
     WHERE lower(slug) = ${c}
        OR (${UUID.test(buscadoClub)} AND id::text = ${buscadoClub})
        OR translate(lower(name), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${'%' + c + '%'}
     LIMIT 25
  `;

  if (clubes.length === 0) {
    const cerca = await tx`
      SELECT id, name, slug, type
        FROM ecosystem.organizations
       ORDER BY name
       LIMIT 60
    `;
    const sugeridas = ordenarPorParecido(cerca, buscadoClub).slice(0, 15);
    throw new NoSePuede(
      `Ninguna organización cuadra con «${buscadoClub}».` +
        (sugeridas.length
          ? '\n  Estas son las que hay (las más parecidas primero):\n' +
            sugeridas
              .map((o) => `    ${o.name} · ${o.slug ?? 'sin slug'} · ${o.type} · ${o.id}`)
              .join('\n') +
            '\n  Copia el id de la buena y repite con --club <id>.'
          : ''),
    );
  }
  if (clubes.length > 1) {
    throw new NoSePuede(
      `«${buscadoClub}» cuadra con ${clubes.length} organizaciones:\n` +
        clubes
          .map((o) => `    ${o.name} · ${o.slug ?? 'sin slug'} · ${o.type} · ${o.id}`)
          .join('\n') +
        '\n  Repite con el slug exacto o con el id.',
    );
  }
  const club = clubes[0];

  const rolAllá = rolMembresias ?? ROL_EN_MEMBRESIAS[rol] ?? null;
  const gestoresAntes = await gestoresDe(tx, club.id);

  // ── ¿Ya está dentro? ──────────────────────────────────────────────────────
  const [ya] = await tx`
    SELECT id, role, role_membresias, joined_at
      FROM ecosystem.org_members
     WHERE org_id = ${club.id} AND user_id = ${persona.id}
     LIMIT 1
  `;

  const informe = {
    persona,
    club,
    rol,
    rolMembresias: rolAllá,
    gestoresAntes,
    gestoresDespues: gestoresAntes,
    rolAnterior: ya?.role ?? null,
    accion: 'sin-cambios',
  };

  // Idempotente: correrlo dos veces no hace nada la segunda.
  if (ya && ya.role === rol) return informe;

  if (ya && !forzarRol) {
    throw new NoSePuede(
      `Ya es miembro de «${club.name}», pero como «${ya.role}» y no como «${rol}».\n` +
        '  No se pisa un rol que alguien puso a propósito. Si de verdad quieres\n' +
        '  cambiarlo, repite con --forzar-rol.',
    );
  }

  // ── Escribir ──────────────────────────────────────────────────────────────
  if (ya) {
    await tx`
      UPDATE ecosystem.org_members
         SET role = ${rol},
             role_membresias = COALESCE(${rolAllá}, role_membresias)
       WHERE id = ${ya.id}
    `;
    informe.accion = 'corregida';
  } else {
    // `joined_at` original se fue con la fila borrada; si no se dice otra cosa,
    // entra con la de hoy. Lo fiel de verdad es sacarla del respaldo.
    const entrada = desde ? new Date(`${desde}T12:00:00Z`) : new Date();
    await tx`
      INSERT INTO ecosystem.org_members (org_id, user_id, role, role_membresias, joined_at)
      VALUES (${club.id}, ${persona.id}, ${rol}, ${rolAllá}, ${entrada})
    `;
    informe.accion = 'creada';
  }

  informe.gestoresDespues = await gestoresDe(tx, club.id);
  return informe;
}
