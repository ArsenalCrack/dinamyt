/**
 * Subida SEGURA de archivos (defensa en profundidad):
 *   1. Allowlist de extensiones por clase (nada de .exe, .svg, .html, macros).
 *   2. Límite de tamaño POR CLASE, aplicado durante el streaming (no después).
 *   3. Nombre aleatorio (UUID) + extensión fija → sin path traversal ni
 *      nombres controlados por el usuario.
 *   4. Verificación de FIRMA (magic bytes): el contenido debe ser lo que la
 *      extensión dice; si no, el archivo se borra y se rechaza.
 *   5. Al servirse (/files) van con X-Content-Type-Options: nosniff y una CSP
 *      que impide ejecutar cualquier cosa (ver app.ts).
 */
import { createWriteStream } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { config } from '../config';

export type ClaseArchivo = 'video' | 'imagen' | 'documento';

const MB = 1024 * 1024;
const REGLAS: Record<ClaseArchivo, { exts: string[]; maxBytes: number }> = {
  // MediaRecorder produce .webm; los celulares .mp4/.mov.
  video: { exts: ['.mp4', '.webm', '.mov'], maxBytes: 300 * MB },
  // SVG queda fuera a propósito: puede llevar scripts (XSS).
  imagen: { exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'], maxBytes: 10 * MB },
  // Solo PDF: los formatos de Office pueden llevar macros.
  documento: { exts: ['.pdf'], maxBytes: 25 * MB },
};

export class ErrorSubida extends Error {}

export function claseDeExtension(ext: string): ClaseArchivo | null {
  const e = ext.toLowerCase();
  for (const [clase, r] of Object.entries(REGLAS)) {
    if (r.exts.includes(e)) return clase as ClaseArchivo;
  }
  return null;
}

/** ¿Los primeros bytes corresponden al formato que la extensión declara? */
async function firmaValida(abs: string, ext: string): Promise<boolean> {
  const fh = await open(abs, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    if (bytesRead < 8) return false;
    switch (ext) {
      case '.mp4':
      case '.mov':
        return buf.subarray(4, 8).toString('latin1') === 'ftyp';
      case '.webm':
        return buf.readUInt32BE(0) === 0x1a45dfa3; // EBML
      case '.jpg':
      case '.jpeg':
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      case '.png':
        return buf.readUInt32BE(0) === 0x89504e47;
      case '.webp':
        return (
          buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
          buf.subarray(8, 12).toString('latin1') === 'WEBP'
        );
      case '.gif':
        return buf.subarray(0, 4).toString('latin1') === 'GIF8';
      case '.pdf':
        return buf.subarray(0, 4).toString('latin1') === '%PDF';
      default:
        return false;
    }
  } finally {
    await fh.close();
  }
}

export interface ParteArchivo {
  filename?: string;
  file: Readable;
}

/**
 * Guarda un archivo de multipart con TODAS las validaciones. Devuelve la ruta
 * relativa (posix) dentro del almacén y la clase detectada. Lanza ErrorSubida
 * con un mensaje apto para el usuario si algo no cumple.
 */
export async function guardarArchivoSeguro(
  parte: ParteArchivo,
  subcarpeta: string,
  clasesPermitidas: ClaseArchivo[],
): Promise<{ rel: string; clase: ClaseArchivo; ext: string }> {
  const ext = extname(parte.filename ?? '').toLowerCase();
  const clase = claseDeExtension(ext);
  if (!clase || !clasesPermitidas.includes(clase)) {
    parte.file.resume(); // descartar el stream sin colgar la request
    const permitidas = clasesPermitidas
      .flatMap((c) => REGLAS[c].exts)
      .join(', ');
    throw new ErrorSubida(`Tipo de archivo no permitido. Acepta: ${permitidas}.`);
  }

  const maxBytes = REGLAS[clase].maxBytes;
  const rel = join(subcarpeta, `${randomUUID()}${ext}`).replaceAll('\\', '/');
  const abs = join(config.uploadsDir, rel);
  await mkdir(join(config.uploadsDir, subcarpeta), { recursive: true });

  // Límite de tamaño DURANTE el streaming: se corta apenas se supera.
  let bytes = 0;
  const contador = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        cb(new ErrorSubida(`El archivo supera el máximo de ${Math.round(maxBytes / MB)} MB.`));
        return;
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(parte.file, contador, createWriteStream(abs));
  } catch (err) {
    await unlink(abs).catch(() => undefined);
    if (err instanceof ErrorSubida) throw err;
    throw new ErrorSubida('No se pudo guardar el archivo.');
  }

  if (bytes === 0 || !(await firmaValida(abs, ext))) {
    // El contenido no corresponde al formato declarado: fuera.
    await unlink(abs).catch(() => undefined);
    throw new ErrorSubida(
      'El contenido del archivo no corresponde a su extensión (archivo rechazado por seguridad).',
    );
  }

  return { rel, clase, ext };
}
