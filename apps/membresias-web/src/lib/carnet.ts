'use client';

import { cinturonPorNombre, fondoCinturon } from './cinturones';

/**
 * El carnet, como documento HTML independiente.
 *
 * Por qué no es un componente de React con `@media print`: lo que había antes
 * imprimía LA PÁGINA. Salía una hoja carta con la tarjeta estirada, los márgenes
 * del navegador y, según el día, la cabecera y el pie que Chrome añade. Nadie
 * puede llevarse eso en la billetera.
 *
 * Aquí el carnet es un documento aparte —se pinta en un iframe y se imprime ese
 * iframe—, así que:
 *
 * - Manda `@page`: la hoja mide 85,6 × 54 mm (la tarjeta ISO de toda la vida,
 *   la del carné y la tarjeta del banco) o carta/A4 con el recorte marcado.
 * - Los milímetros son milímetros. Un carnet que mide 8 cm no vale.
 * - El CSS de la app no puede colarse ni romperlo, y el de aquí no puede
 *   romper la app.
 *
 * La misma función sirve la vista previa y la impresión: lo que se ve en
 * pantalla es, literalmente, el papel.
 */

export interface DatosCarnet {
  /** Lo que lee la cámara en el check-in: el id del alumno. */
  id: string;
  nombre: string;
  club: string;
  rol: string;
  /** Data-URL del QR ya generado. */
  qr: string;
  /** Dirección de la foto (o data-URL). Sin ella van las iniciales. */
  foto?: string | null;
  cinturon?: string | null;
  /** Grupo sanguíneo. Va al FRENTE: es lo que hay que leer sin dar vuelta. */
  sangre?: string | null;
  /** A quién llamar y en qué número, si le pasa algo. */
  emergenciaNombre?: string | null;
  emergenciaTelefono?: string | null;
  /** Emisión y caducidad del CARNET, ya formateadas. Ver `vigencia`. */
  emitido: string;
  vigenteHasta: string;
  pin?: string | null;
  /** Escudo del club. Preside el frente. */
  logoClub: string;
  /** Logo de la aplicación. Va al pie, junto a la marca. */
  logoApp: string;
  /** Quién emite el carnet, para el pie del frente. */
  marca: string;
}

/** Cómo se va a imprimir. Cambia `@page`, no el carnet. */
export type FormatoCarnet = 'hoja' | 'tarjeta';

export interface TextosCarnet {
  /** «Carnet de alumno», «Carnet de maestro»… según el rol. */
  tipo: string;
  numero: string;
  emitido: string;
  vigenteHasta: string;
  sangre: string;
  emergencia: string;
  pin: string;
  instruccion: string;
  intransferible: string;
  recorta: string;
  frente: string;
  reverso: string;
}

/** Escapa lo que viene de la base: un nombre con `<` no puede abrir una etiqueta. */
function esc(valor: string | null | undefined): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Número de carnet: los últimos ocho caracteres del id, en mayúsculas y de
 * cuatro en cuatro. El uuid completo no lo dicta nadie por teléfono; esto sí, y
 * sigue siendo único dentro de un club.
 */
export function numeroCarnet(id: string): string {
  const limpio = id.replace(/-/g, '').slice(-8).toUpperCase();
  return `${limpio.slice(0, 4)} ${limpio.slice(4)}`;
}

/** Iniciales para cuando no hay foto (mismo criterio que el avatar de la app). */
function iniciales(nombre: string): string {
  return (nombre || '?')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Hoja de estilos del carnet. Todo en milímetros y con los colores forzados
 * (`print-color-adjust`), que si no las impresoras «ahorran tinta» y el carnet
 * sale con la cabecera en blanco.
 */
function estilos(formato: FormatoCarnet): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #e9e9ee;
  color: #14141e;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { padding: 6mm; }
.crn-hoja { display: flex; flex-wrap: wrap; justify-content: center; gap: 6mm; }
.crn-cara { flex: 0 0 auto; }

/* La tarjeta ISO/IEC 7810 ID-1: la del banco, la de la cédula. Que mida esto
   exactamente es TODO el punto de este archivo. */
.crn {
  position: relative;
  width: 85.6mm;
  height: 54mm;
  overflow: hidden;
  border-radius: 3mm;
  background: #ffffff;
  color: #14141e;
  box-shadow: 0 1mm 3mm rgba(0,0,0,0.25);
}

/* ── Frente ── */
.crn-cabecera {
  display: flex;
  align-items: center;
  gap: 2mm;
  height: 10.5mm;
  padding: 0 4mm;
  background: #14141e;
  color: #f0b800;
}
.crn-logo { width: 7mm; height: 7mm; object-fit: contain; flex: 0 0 auto; }
.crn-club {
  flex: 1;
  min-width: 0;
  font-size: 3.4mm;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.crn-tipo {
  flex: 0 0 auto;
  font-size: 2.1mm;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ffffff;
  opacity: 0.75;
}

/* Alto FIJO, y lo que no quepa se recorta. La tarjeta no crece: sin este
   tope, un nombre de dos líneas junto con vencimiento y plan acababa
   escribiéndose encima del pie. */
.crn-cuerpo {
  display: flex;
  gap: 3.5mm;
  height: 33mm;
  padding: 3.5mm 4mm 0;
  overflow: hidden;
}

.crn-foto {
  flex: 0 0 auto;
  width: 22mm;
  height: 29mm;
  border-radius: 1.2mm;
  border: 0.3mm solid #c9c9d4;
  object-fit: cover;
  background: #f1f1f5;
}
.crn-iniciales {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8mm;
  font-weight: 800;
  color: #9a9aa8;
  letter-spacing: 0.02em;
}

.crn-datos { flex: 1; min-width: 0; padding-top: 0.5mm; }
.crn-nombre {
  font-size: 4.3mm;
  font-weight: 800;
  line-height: 1.08;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  /* Un nombre largo baja a una segunda línea y se corta ahí: la tarjeta no
     crece, así que lo que no cabe no puede quedarse encima de lo de abajo. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.crn-grado {
  display: flex;
  align-items: center;
  gap: 1.4mm;
  margin-top: 1.4mm;
  font-size: 2.9mm;
  font-weight: 600;
}
.crn-punto {
  width: 3mm;
  height: 3mm;
  border-radius: 50%;
  border: 0.25mm solid #8b8b99;
  flex: 0 0 auto;
}
.crn-campos {
  margin-top: 2.2mm;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9mm 2.5mm;
  font-size: 2.5mm;
}
.crn-campos dt {
  color: #6b6b7b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 2.1mm;
  font-weight: 700;
  padding-top: 0.25mm;
}
.crn-campos dd {
  font-family: ui-monospace, "SF Mono", "Consolas", "Liberation Mono", monospace;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Pie del frente: quién emite el carnet. No es relleno — sin él, el frente se
   quedaba con casi un centímetro en blanco bajo la foto y parecía que el
   diseño se había caído hacia arriba. */
.crn-pieFrente {
  position: absolute;
  left: 4mm;
  right: 4mm;
  bottom: 3.4mm;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2mm;
  padding-top: 1.4mm;
  border-top: 0.2mm solid #dcdce4;
  font-size: 2mm;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8b8b99;
}
/* Marca de la app: su logo y su nombre. Los DOS logos están en el frente —el
   del club preside la cabecera, el de la app firma abajo—, que es como funciona
   cualquier carnet emitido por una entidad en nombre de otra. */
.crn-marca {
  display: flex;
  align-items: center;
  gap: 1.2mm;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crn-logoApp {
  width: 3.4mm;
  height: 3.4mm;
  object-fit: contain;
  flex: 0 0 auto;
  opacity: 0.75;
}
.crn-pieFrente span:last-child {
  flex: 0 0 auto;
  font-family: ui-monospace, "SF Mono", "Consolas", monospace;
  letter-spacing: 0.1em;
}

/* Franja de cinturones al pie: la firma visual del ecosistema. */
.crn-franja {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1.8mm;
  background: linear-gradient(90deg,
    #f3f1e8 0 16.66%, #f0b800 16.66% 33.33%, #3ecf8e 33.33% 50%,
    #2266ff 50% 66.66%, #e8002a 66.66% 83.33%, #454545 83.33% 100%);
}

/* ── Reverso ── */
.crn-reverso { display: flex; gap: 4mm; padding: 5mm 4.5mm; align-items: center; }
.crn-qr {
  width: 33mm;
  height: 33mm;
  flex: 0 0 auto;
  padding: 1.5mm;
  background: #ffffff;
  border: 0.3mm solid #d5d5de;
  border-radius: 1.5mm;
}
.crn-qr img { width: 100%; height: 100%; display: block; }
.crn-instrucciones { flex: 1; min-width: 0; }
.crn-instrucciones h2 {
  font-size: 3mm;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.crn-pin {
  margin-top: 2.5mm;
  padding: 1.6mm 2.2mm;
  border: 0.3mm dashed #8b8b99;
  border-radius: 1.2mm;
}
.crn-pin span {
  display: block;
  font-size: 2mm;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6b6b7b;
}
.crn-pin strong {
  font-family: ui-monospace, "SF Mono", "Consolas", monospace;
  font-size: 5mm;
  letter-spacing: 0.18em;
}
/* A quién llamar. Enmarcado en rojo porque el día que se lee no se está para
   buscar: se le da la vuelta al carnet y tiene que saltar a la vista. */
.crn-emergencia {
  margin-top: 2.2mm;
  padding: 1.4mm 2mm;
  border-left: 0.8mm solid #c4213f;
  background: #fdf2f4;
  border-radius: 0 1mm 1mm 0;
}
.crn-emergencia span {
  display: block;
  font-size: 1.9mm;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #c4213f;
}
.crn-emergencia b {
  display: block;
  font-size: 2.5mm;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crn-emergencia .crn-tel {
  font-family: ui-monospace, "SF Mono", "Consolas", monospace;
  letter-spacing: 0.04em;
}
.crn-legal { margin-top: 2.5mm; font-size: 2.1mm; line-height: 1.35; color: #55555f; }
.crn-pie {
  position: absolute;
  left: 4.5mm;
  right: 4.5mm;
  bottom: 3mm;
  display: flex;
  justify-content: space-between;
  font-size: 2mm;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b8b99;
}

/* Rótulo de cada cara. Solo en pantalla: en el papel estorba. */
.crn-rotulo {
  font-size: 2.6mm;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #6b6b7b;
  text-align: center;
  margin-bottom: 1.5mm;
}
.crn-nota { margin-top: 5mm; font-size: 3mm; color: #55555f; text-align: center; }

@media print {
  html, body { background: #ffffff; }
  body { padding: 0; }
  .crn-rotulo, .crn-nota { display: none; }
  .crn { box-shadow: none; page-break-inside: avoid; break-inside: avoid; }
  ${
    formato === 'tarjeta'
      ? `
  /* Impresora de tarjetas: la hoja ES la tarjeta. Sin márgenes, sin esquinas
     redondeadas (las pone el plástico) y una cara por tarjeta. */
  @page { size: 85.6mm 54mm; margin: 0; }
  .crn-hoja { display: block; gap: 0; }
  .crn { border-radius: 0; }
  .crn-cara { page-break-after: always; break-after: page; }
  .crn-cara:last-child { page-break-after: auto; break-after: auto; }`
      : `
  /* Hoja normal: la tarjeta sigue midiendo lo que mide y va con una línea de
     puntos JUSTO en el borde, para cortar por encima de ella. Las dos caras
     caben una al lado de la otra en carta y en A4. */
  @page { size: auto; margin: 12mm; }
  .crn { outline: 0.2mm dashed #999999; outline-offset: 0; }`
  }
}
`;
}

/**
 * El frente: quién es, de qué club, de qué grado y hasta cuándo vale el carnet.
 *
 * Lo que NO lleva: el número de carnet (está en el reverso, y repetirlo en las
 * dos caras solo gastaba la línea que necesitaba el tipo de sangre) ni el
 * vencimiento de la mensualidad. Ese cambiaba cada mes, así que obligaba a
 * reimprimir el carnet cada mes; lo que caduca aquí es el CARNET, y dura un año.
 */
function frente(d: DatosCarnet, txt: TextosCarnet): string {
  const grado = cinturonPorNombre(d.cinturon);
  const filas: [string, string][] = [];
  if (d.sangre) filas.push([txt.sangre, d.sangre]);
  filas.push([txt.vigenteHasta, d.vigenteHasta]);

  const retrato = d.foto
    ? `<img class="crn-foto" src="${esc(d.foto)}" alt="">`
    : `<div class="crn-foto crn-iniciales">${esc(iniciales(d.nombre))}</div>`;

  return `
<article class="crn">
  <header class="crn-cabecera">
    <img class="crn-logo" src="${esc(d.logoClub)}" alt="">
    <span class="crn-club">${esc(d.club)}</span>
    <span class="crn-tipo">${esc(txt.tipo)}</span>
  </header>
  <div class="crn-cuerpo">
    ${retrato}
    <div class="crn-datos">
      <p class="crn-nombre">${esc(d.nombre)}</p>
      ${
        grado
          ? `<p class="crn-grado">
               <span class="crn-punto" style="background:${fondoCinturon(grado)}"></span>
               ${esc(grado.nombre)}
             </p>`
          : `<p class="crn-grado">${esc(d.rol)}</p>`
      }
      <dl class="crn-campos">
        ${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl>
    </div>
  </div>
  <footer class="crn-pieFrente">
    <span class="crn-marca">
      <img class="crn-logoApp" src="${esc(d.logoApp)}" alt="">
      ${esc(d.marca)}
    </span>
    <span>${esc(d.rol)}</span>
  </footer>
  <div class="crn-franja"></div>
</article>`;
}

/**
 * El reverso: el QR que se escanea, el PIN de respaldo, a quién llamar si algo
 * pasa, y la letra pequeña.
 *
 * El contacto de emergencia va aquí y no al frente porque necesita dos líneas
 * —un nombre y un número— y porque no es lo que se enseña en la puerta; es lo
 * que alguien busca cuando le da la vuelta al carnet de quien está en el suelo.
 */
function reverso(d: DatosCarnet, txt: TextosCarnet): string {
  const emergencia = d.emergenciaNombre || d.emergenciaTelefono;

  return `
<article class="crn">
  <div class="crn-reverso">
    <div class="crn-qr"><img src="${esc(d.qr)}" alt=""></div>
    <div class="crn-instrucciones">
      <h2>${esc(txt.instruccion)}</h2>
      ${
        d.pin
          ? `<div class="crn-pin">
               <span>${esc(txt.pin)}</span>
               <strong>${esc(d.pin)}</strong>
             </div>`
          : ''
      }
      ${
        emergencia
          ? `<div class="crn-emergencia">
               <span>${esc(txt.emergencia)}</span>
               <b>${esc(d.emergenciaNombre)}</b>
               <b class="crn-tel">${esc(d.emergenciaTelefono)}</b>
             </div>`
          : `<p class="crn-legal">${esc(txt.intransferible)}</p>`
      }
    </div>
  </div>
  <div class="crn-pie">
    <span>${esc(txt.numero)} ${esc(numeroCarnet(d.id))}</span>
    <span>${esc(txt.emitido)} ${esc(d.emitido)}</span>
  </div>
  <div class="crn-franja"></div>
</article>`;
}

/** El documento completo, listo para meter en un iframe (`srcdoc`). */
export function documentoCarnet(
  d: DatosCarnet,
  txt: TextosCarnet,
  formato: FormatoCarnet,
  idioma: string,
): string {
  return `<!doctype html>
<html lang="${esc(idioma)}">
<head>
<meta charset="utf-8">
<title>${esc(d.nombre)} — ${esc(d.club)}</title>
<style>${estilos(formato)}</style>
</head>
<body>
  <div class="crn-hoja">
    <figure class="crn-cara">
      <figcaption class="crn-rotulo">${esc(txt.frente)}</figcaption>
      ${frente(d, txt)}
    </figure>
    <figure class="crn-cara">
      <figcaption class="crn-rotulo">${esc(txt.reverso)}</figcaption>
      ${reverso(d, txt)}
    </figure>
  </div>
  <p class="crn-nota">${esc(txt.recorta)}</p>
</body>
</html>`;
}
