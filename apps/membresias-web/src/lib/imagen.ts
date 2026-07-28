'use client';

/**
 * Las imágenes que sube la gente —la foto del alumno y el escudo del club—,
 * preparadas en el navegador antes de mandarlas.
 *
 * Un celular actual saca fotos de 4 000×3 000 y 5 MB. Esa foto no cabe en la
 * base, no hace falta para un carnet de 22 mm de ancho y tardaría en subir por
 * el dato del club. Así que aquí se recorta a un cuadrado, se reduce a
 * {@link LADO} píxeles y se recomprime en JPEG hasta que quepa en
 * {@link MAX_CARACTERES}. Lo que sale son unas decenas de KB.
 *
 * Por qué en el navegador y no en la API: el plan gratuito de Render tiene 512
 * MB de RAM y redimensionar imágenes ahí es la forma más rápida de tumbarlo.
 * Aquí el trabajo lo pone el aparato de quien sube la foto, que además ve el
 * resultado al instante.
 *
 * El recorte es CENTRADO y cuadrado a propósito: es lo que hace que todas las
 * fotos del roster se vean iguales y que en el carnet la cara quede donde tiene
 * que quedar, sin pedirle a nadie que encuadre nada.
 */

/** Lado del cuadrado final. 400 px dan ~360 ppp impresos en el carnet. */
export const LADO = 400;

/**
 * Tope del data-URL en caracteres. 45 000 son ~33 KB de imagen; la API acepta
 * hasta el doble (`MAX_IMAGEN` en `lib/imagenes.ts`), que es el margen para
 * quien suba una imagen con mucho detalle.
 */
export const MAX_CARACTERES = 45_000;

/**
 * Lado del escudo del club. Más grande que una foto porque no se recorta: un
 * logo apaisado cabe entero dentro del cuadrado y le sobra alto.
 */
export const LADO_LOGO = 512;

/**
 * Lo más grande que se acepta ABRIR. Por encima, ni se intenta decodificar.
 *
 * Este número está escrito también en los textos de ayuda y de error
 * (`foto.ayuda`, `logo.ayuda`, `foto.errorPesoArchivo` en `lib/i18n.tsx`): si
 * cambia aquí, hay que cambiarlo allí.
 */
export const MAX_ARCHIVO = 20 * 1024 * 1024;

/** Calidades que se prueban, de mejor a peor, hasta que la foto quepa. */
const CALIDADES = [0.82, 0.72, 0.62, 0.52, 0.42];

/**
 * Error con la clave del texto que hay que enseñar. La pantalla hace `t(clave)`
 * en vez de inventarse un mensaje: los idiomas viven en un solo sitio.
 */
export class ErrorFoto extends Error {
  constructor(
    readonly clave:
      | 'foto.errorTipo'
      | 'foto.errorLeer'
      /** El archivo no cabe ni para abrirlo: pasa de {@link MAX_ARCHIVO}. */
      | 'foto.errorPesoArchivo'
      /** Se abrió, pero no hay forma de dejarlo bajo {@link MAX_CARACTERES}. */
      | 'foto.errorPeso',
  ) {
    super(clave);
    this.name = 'ErrorFoto';
  }
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
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ErrorFoto('foto.errorLeer'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Convierte el archivo que eligió el usuario en un data-URL listo para guardar.
 *
 * Lanza `ErrorFoto` con la clave del aviso si el archivo no es una imagen, no
 * se puede abrir, o no hay forma de que quepa ni con la peor calidad.
 */
export async function fotoDesdeArchivo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ErrorFoto('foto.errorTipo');
  if (file.size > MAX_ARCHIVO) throw new ErrorFoto('foto.errorPesoArchivo');

  const fuente = await decodificar(file);
  const ancho = fuente.width;
  const alto = fuente.height;
  if (!ancho || !alto) throw new ErrorFoto('foto.errorLeer');

  // Recorte centrado: el cuadrado más grande que cabe en la foto original.
  const recorte = Math.min(ancho, alto);
  const x = (ancho - recorte) / 2;
  const y = (alto - recorte) / 2;

  try {
    // Primero se intenta a tamaño completo con la mejor calidad, y se va
    // cediendo. Una foto muy detallada (mucho grano, mucho fondo) puede no
    // caber ni al mínimo de calidad: antes que rechazarla, se hace más pequeña.
    for (const lado of [LADO, 320, 256]) {
      const lienzo = document.createElement('canvas');
      lienzo.width = lado;
      lienzo.height = lado;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new ErrorFoto('foto.errorLeer');

      ctx.imageSmoothingQuality = 'high';
      // Fondo blanco: lo que era transparente acaba en un JPEG, que no tiene
      // transparencia, y sin esto saldría negro.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(fuente, x, y, recorte, recorte, 0, 0, lado, lado);

      for (const calidad of CALIDADES) {
        const url = lienzo.toDataURL('image/jpeg', calidad);
        if (url.length <= MAX_CARACTERES) return url;
      }
    }
    throw new ErrorFoto('foto.errorPeso');
  } finally {
    if ('close' in fuente) fuente.close();
  }
}

/**
 * El escudo del club. Se parece a lo de arriba, pero las tres diferencias
 * importan y por eso no es la misma función:
 *
 * 1. **No se recorta.** A una cara le sobra el fondo; a un escudo con el nombre
 *    del club escrito alrededor, recortarlo le corta el nombre. Entra entero y
 *    se centra dentro del cuadrado.
 * 2. **Sale en PNG.** La mayoría de los logos llegan con el fondo transparente,
 *    y en JPEG ese fondo se vuelve un rectángulo blanco que en el carnet —cuya
 *    cabecera es negra— se ve como un parche.
 * 3. **Se prueba primero pequeño.** Un PNG no tiene calidad que bajar: lo único
 *    que se puede ceder es tamaño. Como los logos son planos y de pocos
 *    colores, 512 px suele pesar poco; si no cabe, se baja de escalón.
 */
export async function logoDesdeArchivo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ErrorFoto('foto.errorTipo');
  if (file.size > MAX_ARCHIVO) throw new ErrorFoto('foto.errorPesoArchivo');

  const fuente = await decodificar(file);
  const ancho = fuente.width;
  const alto = fuente.height;
  if (!ancho || !alto) throw new ErrorFoto('foto.errorLeer');

  try {
    for (const lado of [LADO_LOGO, 384, 256, 192]) {
      const lienzo = document.createElement('canvas');
      lienzo.width = lado;
      lienzo.height = lado;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new ErrorFoto('foto.errorLeer');

      // Encaje sin recorte: se escala hasta que el lado más largo toca el
      // borde, y lo que sobra queda transparente.
      const escala = Math.min(lado / ancho, lado / alto);
      const w = Math.round(ancho * escala);
      const h = Math.round(alto * escala);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fuente, 0, 0, ancho, alto, (lado - w) / 2, (lado - h) / 2, w, h);

      const url = lienzo.toDataURL('image/png');
      if (url.length <= MAX_CARACTERES) return url;
    }
    throw new ErrorFoto('foto.errorPeso');
  } finally {
    if ('close' in fuente) fuente.close();
  }
}
