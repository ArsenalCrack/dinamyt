/**
 * Validación y saneo de inputs de la persona (se aplica mientras escribe).
 * El servidor valida de nuevo; esto es para que el usuario no pueda ni
 * teclear un número en el nombre o una letra en el teléfono.
 */

// Nombres: letras (tildes/ñ/ü), espacios, apóstrofo, punto y guion.
export function soloLetras(v: string): string {
  return v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]/g, '');
}

// Teléfonos: dígitos y separadores usuales (+ espacios guiones paréntesis).
export function soloTelefono(v: string): string {
  return v.replace(/[^0-9+ ()\-]/g, '');
}

// Documentos / códigos: solo dígitos.
export function soloDigitos(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

// Límites de fecha de nacimiento: entre 100 y 3 años de edad.
export function limitesFechaNacimiento(): { min: string; max: string } {
  const hoy = new Date();
  const min = new Date(hoy);
  min.setFullYear(min.getFullYear() - 100);
  const max = new Date(hoy);
  max.setFullYear(max.getFullYear() - 3);
  return {
    min: min.toISOString().slice(0, 10),
    max: max.toISOString().slice(0, 10),
  };
}

/**
 * Géneros del ecosistema, con la etiqueta que ve la persona y el valor que se
 * guarda. El valor va en MAYÚSCULAS porque así lo guarda Campeonatos
 * (`competidores.genero`), que es quien arma las categorías con él.
 */
export const GENEROS = [
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
] as const;

// Tipos de sangre (desplegable; lo registra el maestro/admin del club).
export const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

// Cinturones de Hapkido (grado de la disciplina; lo promueve el maestro).
export const CINTURONES_GRADO = [
  'Blanco',
  'Amarillo',
  'Naranja',
  'Naranja/Verde',
  'Verde',
  'Verde/Azul',
  'Azul',
  'Rojo',
  'Marrón',
  'Marrón/Negro',
  'Negro',
] as const;

// Parentescos del contacto de emergencia (menú desplegable).
export const PARENTESCOS = [
  'Madre',
  'Padre',
  'Hermano/a',
  'Abuelo/a',
  'Tío/a',
  'Cónyuge',
  'Hijo/a',
  'Amigo/a',
  'Otro',
] as const;

/**
 * Reduce una imagen del dispositivo a un avatar cuadrado (JPEG ~320px) y la
 * devuelve como data-URL lista para guardar en el perfil. Así la foto se sube
 * desde el PC o el celular sin necesitar un servicio de archivos.
 */
export function comprimirAvatar(file: File, lado = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const corto = Math.min(img.width, img.height);
      const sx = (img.width - corto) / 2;
      const sy = (img.height - corto) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = lado;
      canvas.height = lado;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, sx, sy, corto, corto, 0, 0, lado, lado);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}
