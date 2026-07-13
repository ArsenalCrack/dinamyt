'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { obtenerToken } from '@/lib/api';
import { getSesion } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

const ECOSYSTEM_API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

/** Insignia del club/academia de la persona (logo + nombre, desde el
 *  ecosystem). Se oculta sola si no pertenece a una organización. */
export function ClubBadge({ size = 34 }: { size?: number }) {
  const [org, setOrg] = useState<{ name: string; logoUrl: string | null } | null>(null);

  useEffect(() => {
    const s = getSesion();
    const t = obtenerToken();
    if (!s?.orgId || !t) return;
    axios
      .get(`${ECOSYSTEM_API_URL}/organizations/${s.orgId}`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      .then((r) => setOrg({ name: r.data.name, logoUrl: r.data.logoUrl ?? null }))
      .catch(() => undefined); // sin org visible: la insignia no aparece
  }, []);

  if (!org) return null;
  return (
    <span
      className="badge"
      style={{ gap: '0.45rem', padding: '0.25rem 0.7rem 0.25rem 0.3rem', textTransform: 'none' }}
      title="Tu club en el ecosistema DINAMYT"
    >
      <Avatar src={org.logoUrl} nombre={org.name} size={size} />
      <span style={{ fontSize: '0.78rem', letterSpacing: 0 }}>{org.name}</span>
    </span>
  );
}
