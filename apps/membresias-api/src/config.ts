import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3004', 10),

  // ── Identidad propia ───────────────────────────────────────────────────────
  /** Secreto con el que Membresías firma sus tokens (HS256). Mínimo 32 chars. */
  jwtSecret: process.env.JWT_SECRET ?? '',
  /** Vida del token en segundos (24 h por defecto). */
  jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '86400', 10),

  /** Superadmin sembrado al arrancar. Sin estas dos, no se siembra nadie. */
  superadminEmail: process.env.SUPERADMIN_EMAIL ?? '',
  superadminPassword: process.env.SUPERADMIN_PASSWORD ?? '',
  superadminNombre: process.env.SUPERADMIN_NOMBRE ?? 'Super administrador',

  // ── SSO opcional con el ecosistema DINAMYT ─────────────────────────────────
  // Si `ecosystemJwksUrl` está vacía, Membresías no habla con nadie: login
  // propio y punto. Con ella, además acepta tokens del ecosistema y resuelve
  // al usuario local por su correo.
  /** JWKS del ecosistema, para verificar sus tokens RS256. */
  ecosystemJwksUrl: process.env.ECOSYSTEM_JWKS_URL ?? '',
  /** Portal del ecosistema (para el botón de SSO en el login). */
  ecosystemPortalUrl: process.env.ECOSYSTEM_PORTAL_URL ?? '',

  /** URL pública de la web (para armar enlaces). */
  webUrl: process.env.MEMBRESIAS_WEB_URL ?? 'http://localhost:3006',

  /**
   * Proxies de confianza delante de la API (Render pone 1). Con 0 se ignora
   * X-Forwarded-For y se usa la IP del socket. Importa para el rate limit: sin
   * esto, detrás de Render todas las peticiones comparten la IP del proxy y el
   * tope por IP se convierte en un cupo global que cualquiera agota para todos.
   * Es un número de saltos y no `true` a propósito: X-Forwarded-For lo escribe
   * quien quiera, y confiar en toda la cadena deja falsear la IP a voluntad.
   */
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),

  /**
   * Cookie de sesión.
   *
   * `sameSite` decide si la sesión sobrevive al despliegue: con la web y la API
   * en el MISMO sitio (localhost, o `app.midominio.com` + `api.midominio.com`)
   * vale `lax` y todo funciona. Con dominios distintos —el caso de Vercel +
   * Render— hace falta `none`, y entonces la cookie es de terceros: Safari la
   * bloquea siempre y Firefox la aísla. Por eso el cliente conserva el token en
   * memoria como respaldo, y por eso lo suyo es servir ambos bajo un dominio.
   */
  cookieSameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',
  /** `none` exige `Secure`, así que ahí se fuerza aunque nadie lo pida. */
  cookieSecure:
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SAMESITE ?? 'lax') === 'none',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

/** `true` si el SSO con el ecosistema DINAMYT está configurado. */
export const ssoHabilitado = () => Boolean(config.ecosystemJwksUrl);

/**
 * Secreto del disparo diario de avisos (`POST /notifications/cron`).
 *
 * Sin él esa ruta responde 404: es la única que actúa sin sesión, y dejarla
 * abierta permitiría a cualquiera generar avisos y push para todos los clubes.
 * Debe valer lo mismo aquí (Render) y en la web (Vercel), que es quien la llama
 * desde su cron.
 *
 * Se lee en cada llamada, y no una vez al arrancar, para poder cambiarla sin
 * reconstruir el proceso — y para que las pruebas puedan ponerla y quitarla.
 */
export const cronSecret = () => process.env.CRON_SECRET ?? '';

/**
 * Secreto del espejo del ecosistema (`POST /sync/persona`, `POST /sync/club`).
 *
 * Lo manda el portal en la cabecera `x-dinamyt-sync` cuando alguien guarda una
 * ficha allí, y con él se actualiza la copia de aquí: la foto que el maestro
 * sube en DINAMYT tiene que salir en el carnet que imprime esta app, y el
 * carnet se pinta con `membresias.users`.
 *
 * Sin él esas dos rutas responden 404. Son las únicas que reescriben fichas sin
 * sesión, y dejarlas abiertas «por si acaso» sería regalar el roster entero.
 * Debe valer lo MISMO aquí y en `ecosystem-api`.
 *
 * Se lee en cada llamada, y no una vez al arrancar, para poder cambiarlo sin
 * reconstruir el proceso — y para que las pruebas puedan ponerlo y quitarlo.
 */
export const syncSecret = () => process.env.ECOSYSTEM_SYNC_SECRET ?? '';
