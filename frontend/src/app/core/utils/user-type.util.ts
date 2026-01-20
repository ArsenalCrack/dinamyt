export function extractUserRoles(input: any): string[] {
  if (!input || typeof input !== 'object') return [];

  // A veces el objeto viene envuelto en { usuario: ... }
  const usuario = input.usuario || input;

  const norm = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.toLowerCase() : null;
  };

  const out: string[] = [];

  // 1) tipousuario (ID -> Role Mapping)
  const tipo = usuario?.tipousuario;
  if (tipo) {
    const id = tipo.idTipo || tipo.ID_Tipo || tipo.id_Tipo || tipo.IDTipo || tipo.id || (typeof tipo === 'number' ? tipo : null);
    if (id == 1) out.push('usuario');
    else if (id == 2) out.push('instructor');
    else if (id == 3) {
      out.push('administrador');
      out.push('admin_proyecto');
    }
  }

  // 2) roleNames: ['usuario', 'administrador', ...]
  const roleNames = usuario?.roleNames;
  if (Array.isArray(roleNames)) {
    for (const r of roleNames) {
      const n = norm(r);
      if (n) out.push(n);
    }
  }

  // 3) roles: ['usuario', ...]
  const roles = usuario?.roles;
  if (Array.isArray(roles)) {
    for (const r of roles) {
      const n = norm(r);
      if (n) out.push(n);
    }
  }

  // unique
  return Array.from(new Set(out));
}
