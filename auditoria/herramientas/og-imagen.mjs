// La imagen que sale al compartir un enlace de dinamyt.org (WhatsApp, Google,
// redes): 1200 × 630 con el titular de la portada. Antes era el ícono
// cuadrado de 512, y en WhatsApp salía solo el escudo (auditoría 003, nº 17).
//
// Se dibuja en HTML con las fuentes de la marca y se fotografía con el Chrome
// instalado, con el motor de playwright-cli. Si cambia el titular o la marca:
//   node auditoria/herramientas/og-imagen.mjs
// y se sube el `apps/ecosystem-portal/public/og.png` que deja.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const motor = join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(motor).href);

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const logo = readFileSync(join(raiz, 'apps/ecosystem-portal/public/logo.png')).toString('base64');
const salida = join(raiz, 'apps/ecosystem-portal/public/og.png');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@118,800&family=Instrument+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #0e0e15; color: #f3f1e8; font-family: 'Instrument Sans', sans-serif; position: relative; overflow: hidden; }
  .caja { position: absolute; inset: 72px 80px 96px; display: flex; flex-direction: column; justify-content: space-between; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .marca img { width: 56px; height: 56px; }
  .marca span { font-family: 'Archivo'; font-weight: 800; font-stretch: 118%; font-size: 34px; letter-spacing: -0.015em; color: #f0b800; }
  .eyebrow { font-family: 'IBM Plex Mono'; font-weight: 500; font-size: 20px; letter-spacing: 0.22em; text-transform: uppercase; color: #f0b800; margin-bottom: 18px; }
  h1 { font-family: 'Archivo'; font-weight: 800; font-stretch: 118%; font-size: 92px; line-height: 0.96; letter-spacing: -0.015em; text-transform: uppercase; }
  h1 em { font-style: normal; color: #f0b800; }
  p { font-size: 28px; color: #a19db8; margin-top: 22px; }
  .web { position: absolute; right: 80px; top: 86px; font-family: 'IBM Plex Mono'; font-size: 22px; color: #a19db8; }
  .franja { position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
    background: linear-gradient(90deg, #f3f1e8 0 16.66%, #f0b800 16.66% 33.33%, #3ecf8e 33.33% 50%, #2266ff 50% 66.66%, #e8002a 66.66% 83.33%, #454545 83.33% 100%); }
</style></head><body>
  <div class="caja">
    <div class="marca"><img src="data:image/png;base64,${logo}" alt=""><span>DINAMYT</span></div>
    <div>
      <div class="eyebrow">Hapkido · Colombia</div>
      <h1>Se acabó<br><em>el cuaderno</em><br>del club.</h1>
      <p>Mensualidades, asistencia y campeonatos en un solo sitio.</p>
    </div>
  </div>
  <div class="web">dinamyt.org</div>
  <div class="franja"></div>
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: salida, type: 'png' });
await browser.close();
console.log('og.png →', salida);
