export function extractUserRoles(user: any): string[] {
  if (!user || typeof user !== 'object') return [];

  const norm = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.toLowerCase() : null;
  };

  const out: string[] = [];

  // 1) roleNames: ['usuario', 'administrador', ...]
  const roleNames = (user as any)?.roleNames;
  if (Array.isArray(roleNames)) {
    for (const r of roleNames) {
      const n = norm(r);
      if (n) out.push(n);
    }
  }

  // 2) roles: ['usuario', ...]
  const roles = (user as any)?.roles;
  if (Array.isArray(roles)) {
    for (const r of roles) {
      const n = norm(r);
      if (n) out.push(n);
    }
  }

  // unique
  return Array.from(new Set(out));
}
