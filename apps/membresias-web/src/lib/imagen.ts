'use client';

/**
 * Las imágenes que sube la gente —la foto del alumno y el escudo del club—,
 * preparadas en el navegador antes de mandarlas.
 *
 * Un celular actual saca fotos de 4 000×3 000 y 5 MB. Esa foto no cabe en la
 * base, no hace falta para un carnet de 22 mm de ancho y tardaría en subir por
 * el dato del club. Aquí se encuadra, se reduce y se recomprime hasta dejarla
 * en unas decenas de KB.
 *
 * Por qué en el navegador y no en la API: el plan gratuito de Render tiene 512
 * MB de RAM y redimensionar imágenes ahí es la forma más rápida de tumbarlo.
 * Aquí el trabajo lo pone el aparato de quien sube la foto, que además ve el
 * resultado al instante.
 *
 * **Dos cosas cambiaron respecto de la primera versión, y las dos por lo mismo
 * —que la app decidía sola y a veces decidía mal:**
 *
 * 1. **El encuadre lo elige quien sube la imagen.** Antes se recortaba el
 *    cuadrado del CENTRO. En un retrato de celular (3 000×4 000) eso son 500 px
 *    menos por arriba, que es justo donde está la cabeza. Ahora el recorte
 *    llega hecho desde el editor (`components/AjustarImagen.tsx`) y esta capa
 *    solo lo dibuja: ver {@link Encuadre}.
 * 2. **Nunca se rechaza una imagen por peso.** Antes, si tras probar tres
 *    tamaños y cinco calidades no cabía, salía un error y el escudo se quedaba
 *    sin poner — cosa que pasaba de verdad con los escudos, porque un PNG no
 *    tiene calidad que bajar. Ahora se sigue bajando de escalón (y se cambia de
 *    formato) hasta que entra. Ver {@link codificar}.
 */

/** Lado del cuadrado final de la foto. 400 px dan ~360 ppp impresos. */
export const LADO = 400;

/**
 * Lado del escudo del club. Más grande que una foto porque no se recorta: un
 * logo apaisado cabe entero dentro del cuadrado y le sobra alto.
 */
export const LADO_LOGO = 512;

/**
 * Tope del data-URL de una foto, en caracteres. 60 000 en base64 son ~44 KB.
 * La API acepta hasta 90 000 (`MAX_IMAGEN` en `lib/imagenes.ts`); la diferencia
 * es el margen para que un redondeo no haga rebotar la petición.
 */
export const MAX_CARACTERES = 60_000;

/**
 * El mismo tope para el escudo, pero más holgado.
 *
 * Un escudo se guarda en PNG o WebP para no perder el fondo transparente, y
 * esos formatos pesan más que un JPEG de la misma imagen. Con el tope de la
 * foto, un escudo con degradados o con una foto dentro no entraba ni al tamaño
 * más pequeño y la app lo rechazaba.
 */
export const MAX_CARACTERES_LOGO = 80_000;

/** Lo más grande que se acepta ABRIR. Por encima, ni se intenta decodificar. */
export const MAX_ARCHIVO = 20 * 1024 * 1024;

/**
 * Tamaño de la copia de trabajo, en píxeles del lado más largo.
 *
 * No se arrastra la foto original por la pantalla: una de 12 megapíxeles hace
 * que el editor vaya a tirones en un celular. Esta copia además llega con la
 * orientación EXIF ya aplicada, así que lo que se ve encuadrando es exactamente
 * lo que se va a guardar.
 */
const TRABAJO = 1600;

/** Calidades de JPEG que se prueban, de mejor a peor. */
const CALIDADES = [0.86, 0.78, 0.7, 0.6, 0.5, 0.42];

/** Calidades de WebP para el escudo. Arriba se empieza casi sin pérdida. */
const CALIDADES_LOGO = [0.94, 0.88, 0.8, 0.7, 0.6, 0.5];

/**
 * Escalones de tamaño. Se baja de uno en uno hasta que la imagen entra en el
 * tope; el último es tan pequeño que siempre entra, y por eso no hace falta un
 * error de «no cupo».
 */
const ESCALONES = [LADO, 340, 288, 240, 200, 160, 128];
const ESCALONES_LOGO = [LADO_LOGO, 448, 384, 320, 256, 192, 128, 96];

/**
 * El hueco de la foto en el carnet: 22 × 29 mm (ver `.crn-foto` en
 * `lib/carnet.ts`), rellenado con `object-fit: cover`.
 *
 * Como lo que se guarda es un CUADRADO y el hueco es más alto que ancho, el
 * carnet enseña la franja central y se come los lados. El editor lo dibuja
 * encima del encuadre para que no sea una sorpresa al imprimir.
 */
export const CARNET_FOTO = { ancho: 22, alto: 29 };

/**
 * Error con la clave del texto que hay que enseñar. La pantalla hace `t(clave)`
 * en vez de inventarse un mensaje: los idiomas viven en un solo sitio.
 *
 * Ya no hay error de compresión: si una imagen se puede abrir, se guarda.
 */
export class ErrorFoto extends Error {
  constructor(
    readonly clave:
      | 'foto.errorTipo'
      | 'foto.errorLeer'
      /** El archivo no cabe ni para abrirlo: pasa de {@link MAX_ARCHIVO}. */
      | 'foto.errorPesoArchivo',
  ) {
    super(clave);
    this.name = 'ErrorFoto';
  }
}

/**
 * Una imagen ya abierta, normalizada y lista para encuadrar.
 *
 * `elemento` sirve a la vez de vista previa en el editor y de fuente al
 * dibujar: así no hay dos versiones de la misma imagen que puedan discrepar.
 */
export interface ImagenAbierta {
  elemento: HTMLImageElement;
  /** Para el `<img>` del editor. Se suelta con {@link ImagenAbierta.cerrar}. */
  url: string;
  ancho: number;
  alto: number;
  cerrar: () => void;
}

/**
 * El encuadre elegido: dónde quedó la imagen dentro del visor cuadrado del
 * editor, medido en píxeles de ESE visor. Guardarlo así —y no en píxeles de la
 * imagen— es lo que hace que dibujar el resultado sea la misma cuenta que
 * pintar la vista previa, sin conversiones que se puedan desalinear.
 */
export interface Encuadre {
  /** Esquina superior izquierda de la imagen dentro del visor. */
  x: number;
  y: number;
  /** Factor sobre el tamaño natural de la copia de trabajo. */
  escala: number;
  /** Lado del visor con el que se tomaron `x`, `y` y `escala`. */
  visor: number;
}

/**
 * Decodifica el archivo. `createImageBitmap` es lo rápido y lo que respeta la
 * orientación EXIF de las fotos de celular (`imageOrientation`); el `<img>` es
 * el respaldo para los navegadores que no lo traen.
 */
async function decodificar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* sigue por el camino del <img> */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await cargar(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Un `<img>` ya cargado, que es lo que `drawImage` sabe dibujar. */
function cargar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ErrorFoto('foto.errorLeer'));
    img.src = url;
  });
}

/**
 * Abre el archivo que eligió el usuario y devuelve la copia de trabajo.
 *
 * Aquí NO se recorta nada: eso lo decide después quien esté mirando la imagen.
 * Lo único que se hace es enderezarla (EXIF), bajarla a {@link TRABAJO} px y
 * dejarla en PNG, que conserva el fondo transparente de los escudos.
 *
 * Lanza `ErrorFoto` si el archivo no es una imagen, pesa demasiado para
 * abrirlo, o el navegador no consigue decodificarlo.
 */
export async function abrirImagen(file: File): Promise<ImagenAbierta> {
  if (!file.type.startsWith('image/')) throw new ErrorFoto('foto.errorTipo');
  if (file.size > MAX_ARCHIVO) throw new ErrorFoto('foto.errorPesoArchivo');

  const fuente = await decodificar(file);
  const anchoReal = fuente.width;
  const altoReal = fuente.height;
  if (!anchoReal || !altoReal) throw new ErrorFoto('foto.errorLeer');

  try {
    const factor = Math.min(1, TRABAJO / Math.max(anchoReal, altoReal));
    const ancho = Math.max(1, Math.round(anchoReal * factor));
    const alto = Math.max(1, Math.round(altoReal * factor));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new ErrorFoto('foto.errorLeer');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'));
    if (!blob) throw new ErrorFoto('foto.errorLeer');
    const url = URL.createObjectURL(blob);
    const elemento = await cargar(url);
    return { elemento, url, ancho, alto, cerrar: () => URL.revokeObjectURL(url) };
  } finally {
    if ('close' in fuente) fuente.close();
  }
}

/** Pinta el encuadre en un cuadrado de `lado` píxeles. */
function pintar(
  imagen: ImagenAbierta,
  encuadre: Encuadre,
  lado: number,
  esLogo: boolean,
): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new ErrorFoto('foto.errorLeer');
  ctx.imageSmoothingQuality = 'high';

  // La foto acaba en JPEG, que no tiene transparencia: sin este fondo, lo que
  // era transparente saldría negro. El escudo NO se rellena — su fondo
  // transparente es lo que le deja encajar sobre la cabecera negra del carnet.
  if (!esLogo) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lado, lado);
  }

  // Misma cuenta que la vista previa, solo que en píxeles de salida en vez de
  // píxeles de pantalla.
  const f = lado / encuadre.visor;
  ctx.drawImage(
    imagen.elemento,
    encuadre.x * f,
    encuadre.y * f,
    imagen.ancho * encuadre.escala * f,
    imagen.alto * encuadre.escala * f,
  );
  return lienzo;
}

/**
 * Convierte el lienzo en data-URL, o `null` si a ESE tamaño no hay formato ni
 * calidad que quepa (entonces quien llama baja un escalón).
 *
 * El escudo intenta PNG primero: un escudo plano —dos colores y una silueta—
 * pesa poquísimo en PNG y no pierde ni un píxel. Si no cabe, WebP con alfa, que
 * es lo que salva a los escudos con degradados o con una foto dentro. Si el
 * navegador no sabe WebP, `toDataURL` devuelve un PNG disimulado: por eso se
 * comprueba el prefijo en vez de fiarse.
 */
function codificar(lienzo: HTMLCanvasElement, esLogo: boolean, tope: number): string | null {
  if (!esLogo) {
    for (const calidad of CALIDADES) {
      const url = lienzo.toDataURL('image/jpeg', calidad);
      if (url.length <= tope) return url;
    }
    return null;
  }

  const png = lienzo.toDataURL('image/png');
  if (png.length <= tope) return png;

  for (const calidad of CALIDADES_LOGO) {
    const url = lienzo.toDataURL('image/webp', calidad);
    if (url.startsWith('data:image/webp') && url.length <= tope) return url;
  }
  return null;
}

/**
 * El resultado final: el encuadre elegido, ya recortado, reducido y comprimido.
 *
 * No falla por peso. Se prueban los escalones de arriba abajo y el último es lo
 * bastante pequeño como para caber siempre; si aun así no cupiera, se devuelve
 * igual y quien decide es la API, que sí tiene un motivo para negarse.
 */
export async function recortarImagen(
  imagen: ImagenAbierta,
  encuadre: Encuadre,
  variante: 'foto' | 'logo',
): Promise<string> {
  const esLogo = variante === 'logo';
  const escalones = esLogo ? ESCALONES_LOGO : ESCALONES;
  const tope = esLogo ? MAX_CARACTERES_LOGO : MAX_CARACTERES;

  for (const lado of escalones) {
    const url = codificar(pintar(imagen, encuadre, lado, esLogo), esLogo, tope);
    if (url) return url;
  }

  const minimo = pintar(imagen, encuadre, escalones[escalones.length - 1], esLogo);
  return esLogo ? minimo.toDataURL('image/png') : minimo.toDataURL('image/jpeg', 0.4);
}
