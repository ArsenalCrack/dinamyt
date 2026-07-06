import { BadRequestException } from '@nestjs/common';

/**
 * Validaciones de datos de la persona (se aplican en registro y perfil).
 * El frontend también valida, pero la última palabra la tiene el servidor.
 */

// Nombres: solo letras (con tildes/ñ/ü), espacios, apóstrofo, punto y guion.
export const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]+$/;
// Teléfonos: dígitos con separadores usuales (+, espacios, guiones, paréntesis).
export const RE_TELEFONO = /^\+?[0-9 ()\-]{7,20}$/;
// Documentos de identidad: solo dígitos (CC/TI/NIT sin puntos).
export const RE_DOCUMENTO = /^[0-9]{4,20}$/;

export const EDAD_MINIMA = 3;
export const EDAD_MAXIMA = 100;

export function validarNombre(nombre: string, campo = 'nombre') {
  const limpio = (nombre ?? '').trim();
  if (!limpio) throw new BadRequestException(`El ${campo} es obligatorio.`);
  if (!RE_NOMBRE.test(limpio)) {
    throw new BadRequestException(
      `El ${campo} solo puede contener letras y espacios (sin números ni símbolos).`,
    );
  }
  return limpio;
}

export function validarTelefono(telefono: string, campo = 'teléfono') {
  const limpio = (telefono ?? '').trim();
  if (!RE_TELEFONO.test(limpio)) {
    throw new BadRequestException(
      `El ${campo} solo puede contener números (y +, espacios o guiones).`,
    );
  }
  return limpio;
}

export function validarDocumento(doc: string) {
  const limpio = (doc ?? '').trim();
  if (!RE_DOCUMENTO.test(limpio)) {
    throw new BadRequestException(
      'El documento solo puede contener números (sin puntos ni letras).',
    );
  }
  return limpio;
}

// La fecha de nacimiento debe corresponder a una edad entre 3 y 100 años.
export function validarFechaNacimiento(fecha: Date) {
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException('La fecha de nacimiento no es válida.');
  }
  const hoy = new Date();
  const min = new Date(hoy);
  min.setFullYear(min.getFullYear() - EDAD_MAXIMA); // hace 100 años
  const max = new Date(hoy);
  max.setFullYear(max.getFullYear() - EDAD_MINIMA); // hace 3 años
  if (fecha < min || fecha > max) {
    throw new BadRequestException(
      `La fecha de nacimiento debe corresponder a una edad entre ${EDAD_MINIMA} y ${EDAD_MAXIMA} años.`,
    );
  }
  return fecha;
}

// La foto se guarda como data-URL (subida desde el dispositivo y comprimida en
// el cliente) o como URL http(s). Límite ~700 KB para no inflar la fila.
export function validarAvatar(avatar: string) {
  const esDataUrl = avatar.startsWith('data:image/');
  const esHttp = /^https?:\/\//.test(avatar);
  if (!esDataUrl && !esHttp) {
    throw new BadRequestException('La foto debe subirse desde tu dispositivo.');
  }
  if (avatar.length > 700_000) {
    throw new BadRequestException('La foto es demasiado grande (máx. ~500 KB).');
  }
  return avatar;
}
