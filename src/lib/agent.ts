'use client';

// Cliente del agente local del lector de huella (corre en el kiosco, localhost).
// La web NUNCA depende de que exista: si no responde, se opera sin lector.
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'http://127.0.0.1:7070';

export async function agentStatus(): Promise<{ readerConnected: boolean; vendor: string } | null> {
  try {
    const r = await fetch(`${AGENT_URL}/status`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function agentEnroll(): Promise<{ template: string; format: string } | null> {
  try {
    const r = await fetch(`${AGENT_URL}/enroll`, { method: 'POST' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
