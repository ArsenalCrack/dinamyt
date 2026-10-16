// Capturas de cada pantalla, con el motor de playwright-cli
// (`npm install -g @playwright/cli`) y el Chrome instalado. Uso:
//   node auditoria/herramientas/capturar.mjs <portal|membresias|campeonatos|academy> <antes|despues> [solo-ruta]
// `<app>.json` dice la web, cómo se entra con cada rol y qué pantallas ve
// cada uno. Las cuentas de prueba salen de `cuentas.json` (fuera de git, lo
// escribe `cuentas.mjs`). Las capturas van a `auditoria/capturas/<app>/<fase>/`.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const motor = join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(motor).href);

const aqui = dirname(fileURLToPath(import.meta.url));
const [, , app, fase = 'antes', soloRuta] = process.argv;
const cfg = JSON.parse(readFileSync(join(aqui, `${app}.json`), 'utf8'));
const cuentas = JSON.parse(readFileSync(join(aqui, 'cuentas.json'), 'utf8'));
const salida = join(aqui, '..', 'capturas', cfg.app, fase);
mkdirSync(salida, { recursive: true });

const VISTAS = [
  { nombre: 'movil', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { nombre: 'escritorio', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];
const TEMAS = ['oscuro', 'claro'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const informe = [];

function archivo(rol, ruta, vista, tema) {
  const r = ruta === '/' ? 'inicio' : ruta.replace(/^\//, '').replace(/[/:[\]]+/g, '_');
  return `${r}__${rol}__${vista}-${tema}.png`;
}

async function entrar(rol) {
  const cuenta = cuentas[cfg.app]?.[rol];
  if (!cuenta) throw new Error(`sin cuenta para ${cfg.app}/${rol}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const l = cfg.login;
  if (l.tipo === 'sso') {
    // El salto desde DINAMYT: el pase del ecosistema en `#token=`, como lo
    // entrega el botón del portal.
    const r = await fetch(l.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cuenta.correo, password: cuenta.clave, recordar: true }),
    });
    if (!r.ok) throw new Error(`login del ecosistema: ${r.status}`);
    const { access_token } = await r.json();
    await page.goto(`${cfg.base}${l.ruta}#token=${access_token}`);
    await page.waitForURL((u) => !u.pathname.startsWith(l.ruta), { timeout: 45000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    const estado = await ctx.storageState();
    await ctx.close();
    return estado;
  }
  await page.goto(cfg.base + l.ruta, { waitUntil: 'networkidle' });
  await page.fill(l.correo, cuenta.correo);
  await page.fill(l.clave, cuenta.clave);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith(l.ruta), { timeout: 30000 }),
    page.click(l.enviar),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

async function descubrir(estado, d) {
  const ctx = await browser.newContext({ storageState: estado ?? undefined });
  const page = await ctx.newPage();
  await page.goto(cfg.base + d.desde, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  const href = await page.evaluate((patron) => {
    const a = [...document.querySelectorAll('a[href]')].find((x) => x.getAttribute('href').includes(patron));
    return a ? a.getAttribute('href') : null;
  }, d.patron);
  await ctx.close();
  return href;
}

async function fotografiar(estado, rol, ruta, url) {
  for (const vista of VISTAS) {
    for (const tema of TEMAS) {
      const ctx = await browser.newContext({
        viewport: vista.viewport,
        isMobile: vista.isMobile ?? false,
        hasTouch: vista.hasTouch ?? false,
        deviceScaleFactor: vista.deviceScaleFactor,
        colorScheme: tema === 'claro' ? 'light' : 'dark',
        reducedMotion: 'reduce',
        locale: 'es-CO',
        timezoneId: 'America/Bogota',
        storageState: estado ?? undefined,
      });
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      let codigo = null;
      try {
        const r = await page.goto(cfg.base + url, { waitUntil: 'networkidle', timeout: 30000 });
        codigo = r?.status() ?? null;
      } catch (e) {
        errores.push(`goto: ${e.message.split('\n')[0]}`);
      }
      await page.waitForTimeout(700);
      // El tema que pide la captura, aunque la cuenta tenga otro guardado.
      // Y sin el botón flotante del modo desarrollo de Next, que no existe en
      // producción.
      await page.evaluate((claro) => {
        if (claro) document.documentElement.dataset.theme = 'light';
        else delete document.documentElement.dataset.theme;
        document.querySelectorAll('nextjs-portal').forEach((e) => e.remove());
      }, tema === 'claro');
      await page.waitForTimeout(250);
      const nombre = archivo(rol, ruta, vista.nombre, tema);
      await page.screenshot({ path: join(salida, nombre), fullPage: true });
      informe.push({ ruta, url, rol, vista: vista.nombre, tema, final: new URL(page.url()).pathname, codigo, errores, archivo: nombre });
      await ctx.close();
    }
  }
}

const estados = {};
for (const p of cfg.pantallas) {
  if (soloRuta && p.ruta !== soloRuta) continue;
  for (const rol of p.roles) {
    try {
      if (rol !== 'anon' && !estados[rol]) estados[rol] = await entrar(rol);
      const estado = rol === 'anon' ? null : estados[rol];
      let url = p.url ?? p.ruta;
      if (p.descubrir) {
        url = await descubrir(estado, p.descubrir);
        if (!url) { informe.push({ ruta: p.ruta, rol, error: 'no se encontró enlace' }); process.stdout.write(`SIN ENLACE ${rol} ${p.ruta}\n`); continue; }
        url = url.replace(/\/$/, '') + (p.descubrir.sufijo ?? '');
      }
      await fotografiar(estado, rol, p.ruta, url);
      process.stdout.write(`ok ${rol} ${p.ruta}\n`);
    } catch (e) {
      informe.push({ ruta: p.ruta, rol, error: e.message.split('\n')[0] });
      process.stdout.write(`FALLÓ ${rol} ${p.ruta}: ${e.message.split('\n')[0]}\n`);
    }
  }
}
await browser.close();
// Con una sola ruta, el informe conserva lo de las demás.
const rutaInforme = join(salida, 'informe.json');
const anterior = soloRuta && existsSync(rutaInforme)
  ? JSON.parse(readFileSync(rutaInforme, 'utf8')).filter((i) => i.ruta !== soloRuta)
  : [];
writeFileSync(rutaInforme, JSON.stringify([...anterior, ...informe], null, 1));
const raros = informe.filter((i) => i.error || (i.errores && i.errores.length) || (i.final && i.url && i.final !== i.url.split('?')[0]));
console.log(`\n${informe.length} capturas/entradas · ${raros.length} con algo raro (ver informe.json)`);
