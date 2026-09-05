import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  absolutaMedia,
  esRutaMedia,
  estaEncendido,
  guardarImagen,
  ErrorImagen,
  MEDIA_PREFIJO,
} from './almacen-imagenes';
import { validarAvatar, validarLogo } from './validacion';

// ── Imágenes de verdad, las más pequeñas que existen ────────────────────────
//
// Tienen que ser válidas de verdad y no `Buffer.from('loquesea')`: media
// función de este archivo es comprobar la FIRMA, y una prueba con bytes
// inventados pasaría por el motivo contrario al que dice.

/** PNG de 1×1 transparente. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
/** JPEG de 1×1. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const duPng = `data:image/png;base64,${PNG.toString('base64')}`;
const duJpeg = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

let dir: string;
const entornoOriginal = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dinamyt-media-'));
  process.env.MEDIA_DIR = dir;
  process.env.MEDIA_PUBLIC_URL = 'https://id.dinamyt.org';
});

afterEach(() => {
  process.env = { ...entornoOriginal };
});

describe('almacén de imágenes · el interruptor', () => {
  it('apagado, la imagen se sigue guardando incrustada', async () => {
    // Es el estado de hoy en producción, y tiene que seguir funcionando
    // exactamente igual mientras nadie ponga la variable.
    delete process.env.MEDIA_PUBLIC_URL;
    expect(estaEncendido()).toBe(false);
    expect(await guardarImagen(duPng)).toBe(duPng);
  });

  it('encendido, la imagen se va al disco', async () => {
    expect(estaEncendido()).toBe(true);
    const ruta = await guardarImagen(duPng);
    expect(ruta).toMatch(/^\/media\/[a-f0-9]{32}\.png$/);
    expect(existsSync(join(dir, ruta!.replace(MEDIA_PREFIJO, '')))).toBe(true);
  });

  it('lo que no es una imagen incrustada pasa sin tocarse', async () => {
    // Un club puede alojar su escudo donde quiera, y una ruta que ya está en
    // el almacén no se vuelve a guardar.
    await expect(
      guardarImagen('https://cdn.club.com/escudo.png'),
    ).resolves.toBe('https://cdn.club.com/escudo.png');
    await expect(guardarImagen('/media/abc.png')).resolves.toBe(
      '/media/abc.png',
    );
    await expect(guardarImagen(null)).resolves.toBeNull();
    await expect(guardarImagen(undefined)).resolves.toBeUndefined();
  });
});

describe('almacén de imágenes · el nombre es el contenido', () => {
  it('los mismos bytes dan el mismo nombre', async () => {
    const a = await guardarImagen(duPng);
    const b = await guardarImagen(duPng);
    expect(a).toBe(b);
  });

  it('bytes distintos dan nombres distintos', async () => {
    expect(await guardarImagen(duPng)).not.toBe(await guardarImagen(duJpeg));
  });

  it('guarda los bytes exactos, no el base64', async () => {
    // Si esto fallara, la caché de un año estaría sirviendo un archivo que el
    // navegador no sabe pintar.
    const ruta = await guardarImagen(duPng);
    const enDisco = readFileSync(join(dir, ruta!.replace(MEDIA_PREFIJO, '')));
    expect(enDisco.equals(PNG)).toBe(true);
  });

  it('no reescribe lo que ya está', async () => {
    // La pantalla de perfil reenvía la misma foto cada vez que se guarda
    // cualquier otro campo: ese es el caso normal, no el raro.
    const ruta = await guardarImagen(duPng);
    const abs = join(dir, ruta!.replace(MEDIA_PREFIJO, ''));
    writeFileSync(abs, 'CENTINELA');
    await guardarImagen(duPng);
    expect(readFileSync(abs, 'utf8')).toBe('CENTINELA');
  });

  it('la extensión sale del formato, no de quien sube', async () => {
    expect(await guardarImagen(duJpeg)).toMatch(/\.jpg$/);
    expect(await guardarImagen(duPng)).toMatch(/\.png$/);
  });
});

describe('almacén de imágenes · lo que NO entra', () => {
  it('un formato que no está en la lista', async () => {
    // SVG queda fuera a propósito: puede llevar scripts.
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    await expect(guardarImagen(svg)).rejects.toThrow(ErrorImagen);
  });

  it('un PNG que por dentro no es un PNG', async () => {
    // La cabecera del data-URL es una PROMESA de quien sube, y el nombre que
    // acabamos escribiendo lleva esa extensión. Por eso se mira la firma.
    const mentira = `data:image/png;base64,${JPEG.toString('base64')}`;
    await expect(guardarImagen(mentira)).rejects.toThrow(
      /no corresponde a su formato/,
    );
  });

  it('una imagen vacía', async () => {
    await expect(guardarImagen('data:image/png;base64,')).rejects.toThrow(
      ErrorImagen,
    );
  });

  it('nada de lo rechazado deja archivos sueltos en el disco', async () => {
    const mentira = `data:image/png;base64,${JPEG.toString('base64')}`;
    await expect(guardarImagen(mentira)).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('almacén de imágenes · la dirección para el espejo', () => {
  it('convierte la ruta del disco en absoluta', () => {
    // Membresías acepta `data:` o `https://` y nada más. Un `/media/…`
    // relativo lo rechazaría, y ese rechazo no lo ve nadie: la foto quedaría
    // bien en el portal y dejaría de llegar al carnet.
    expect(absolutaMedia('/media/abc.jpg')).toBe(
      'https://id.dinamyt.org/media/abc.jpg',
    );
  });

  it('no toca lo que ya es absoluto ni lo incrustado', () => {
    expect(absolutaMedia('https://cdn.club.com/x.png')).toBe(
      'https://cdn.club.com/x.png',
    );
    expect(absolutaMedia(duPng)).toBe(duPng);
  });

  it('deja pasar el null y el undefined con su significado', () => {
    // En el espejo son dos cosas distintas: `null` es «quítala», `undefined`
    // es «no la toques». Confundirlos borraría fotos.
    expect(absolutaMedia(null)).toBeNull();
    expect(absolutaMedia(undefined)).toBeUndefined();
  });

  it('sin base configurada devuelve la ruta tal cual', () => {
    delete process.env.MEDIA_PUBLIC_URL;
    expect(absolutaMedia('/media/abc.jpg')).toBe('/media/abc.jpg');
  });

  it('aguanta una base con barra al final', () => {
    process.env.MEDIA_PUBLIC_URL = 'https://id.dinamyt.org/';
    expect(absolutaMedia('/media/abc.jpg')).toBe(
      'https://id.dinamyt.org/media/abc.jpg',
    );
  });

  it('reconoce una ruta del almacén', () => {
    expect(esRutaMedia('/media/abc.jpg')).toBe(true);
    expect(esRutaMedia(duPng)).toBe(false);
    expect(esRutaMedia(null)).toBe(false);
  });
});

describe('validación · las tres formas de una imagen', () => {
  it('acepta la ruta del disco', () => {
    // ⚠️ Esta es la que faltaba. OPERAR.md §6.2 daba por hecho que la columna
    // ya aceptaba las tres formas; la columna sí (es `text`), pero
    // `validarAvatar` no: un `/media/…` se iba por el primer `if` con «La foto
    // debe subirse desde tu dispositivo». El pendiente entero chocaba, en su
    // primer paso, con la única línea que lo tenía que dejar pasar.
    const ruta = `/media/${'a'.repeat(32)}.jpg`;
    expect(validarAvatar(ruta)).toBe(ruta);
    expect(validarLogo(ruta)).toBe(ruta);
  });

  it('acepta lo incrustado y lo externo, como siempre', () => {
    expect(validarAvatar(duPng)).toBe(duPng);
    expect(validarAvatar('https://cdn.club.com/x.png')).toBe(
      'https://cdn.club.com/x.png',
    );
  });

  it('rechaza un texto cualquiera — el escudo también', () => {
    // El escudo NO tenía ninguna validación: `organizations.controller.ts` no
    // llamaba a un solo `validar*`. Comprobado el 4 de septiembre de 2026
    // mandando `logoUrl: "esto-no-es-una-imagen-ni-una-url"`, que entró con un
    // 200 y se quedó guardado.
    expect(() => validarAvatar('esto-no-es-una-imagen')).toThrow(/La foto/);
    expect(() => validarLogo('esto-no-es-una-imagen')).toThrow(/El escudo/);
  });

  it('una ruta con forma de ruta pero que no es del almacén no cuela', () => {
    // El nombre es un hash de 32 hexadecimales y nada más: sin esto, un
    // `/media/../../etc/passwd` sería un valor válido en la columna.
    expect(() => validarAvatar('/media/../../etc/passwd')).toThrow();
    expect(() => validarAvatar('/media/cualquier-cosa.jpg')).toThrow();
  });

  it('sigue parando lo que pesa demasiado', () => {
    expect(() =>
      validarAvatar(`data:image/png;base64,${'A'.repeat(700_001)}`),
    ).toThrow(/demasiado grande/);
  });
});
