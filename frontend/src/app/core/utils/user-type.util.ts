/**
 * Extrae los roles del usuario desde un objeto de respuesta del backend.
 *
 * Soporta múltiples formatos de respuesta:
 *   - { usuario: { tipousuario: 1, ... } }
 *   - { tipousuario: 3 }
 *   - { roles: ['administrador'] }
 *   - { roleNames: ['usuario'] }
 *
 * Si no encuentra el tipo en el objeto, intenta leerlo de sessionStorage
 * como respaldo (útil cuando la página se recarga).
 *
 * Mapeo de IDs de tipo:
 *   1 → 'usuario'
 *   2 → 'instructor'
 *   3 → 'administrador' + 'admin_proyecto'
 *   4 → 'dueño' + 'instructor'
 *
 * @param input Objeto del usuario (puede venir envuelto en { usuario: ... })
 * @returns Arreglo de roles únicos en minúsculas
 */
export function extractUserRoles(input: any): string[] {
  if (!input || typeof input !== 'object') return [];

  // A veces el objeto viene envuelto en { usuario: ... }
  const usuario = input.usuario || input;

  // Función auxiliar para normalizar valores a string en minúsculas
  const normalizar = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.toLowerCase() : null;
  };

  const roles: string[] = [];

  // 1) Extraer tipo de usuario (ID numérico → rol)
  let tipo = input.tipo_usuario || input.tipousuario || usuario?.tipo_usuario || usuario?.tipousuario;

  // Respaldo: verificar sessionStorage si no se encontró en el objeto
  if (!tipo) {
    try {
      tipo = sessionStorage.getItem('tipo_usuario') || sessionStorage.getItem('tipousuario');
    } catch (e) { /* Ignorar si no hay storage disponible */ }
  }

  if (tipo) {
    // Si es un número o string numérico, convertir directamente
    let id = null;
    if (typeof tipo === 'number' || (typeof tipo === 'string' && !isNaN(Number(tipo)))) {
      id = Number(tipo);
    } else {
      // Si es un objeto, buscar la propiedad del ID
      id = tipo.idTipo || tipo.ID_Tipo || tipo.id_Tipo || tipo.IDTipo || tipo.id;
    }

    if (id == 1) roles.push('usuario');
    else if (id == 2) roles.push('instructor');
    else if (id == 3) {
      roles.push('administrador');
      roles.push('admin_proyecto');
    }
    else if (id == 4) {
      roles.push('dueño');
      roles.push('instructor');
    }
  }

  // 2) Extraer de roleNames: ['usuario', 'administrador', ...]
  const roleNames = usuario?.roleNames;
  if (Array.isArray(roleNames)) {
    for (const r of roleNames) {
      const n = normalizar(r);
      if (n) roles.push(n);
    }
  }

  // 3) Extraer de roles: ['usuario', ...]
  const rolesArr = usuario?.roles;
  if (Array.isArray(rolesArr)) {
    for (const r of rolesArr) {
      const n = normalizar(r);
      if (n) roles.push(n);
    }
  }

  // Eliminar duplicados y retornar
  return Array.from(new Set(roles));
}
