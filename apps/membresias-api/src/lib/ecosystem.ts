import { config } from '../config';

/** Miembro del club tal como lo devuelve el ecosystem (GET /organizations/:id/members). */
export interface OrgMember {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  /** Foto de perfil de la persona (data-URL o http) — la ve el maestro. */
  avatarUrl: string | null;
}

export type FetchMembers = (orgId: string, token: string) => Promise<OrgMember[]>;

/**
 * Trae el roster del club desde el ecosystem reutilizando su endpoint de miembros.
 * Membresías NO crea alumnos: los lee de la identidad compartida.
 */
export const fetchMembersFromEcosystem: FetchMembers = async (orgId, token) => {
  const res = await fetch(
    `${config.ecosystemApiUrl}/organizations/${orgId}/members`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    userId: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    avatarUrl?: string | null;
  }>;
  return data.map((m) => ({
    userId: m.userId,
    email: m.email,
    fullName: m.fullName,
    phone: m.phone ?? null,
    role: m.role,
    avatarUrl: m.avatarUrl ?? null,
  }));
};
