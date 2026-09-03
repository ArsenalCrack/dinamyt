'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  entrarAClubAPI,
  misSolicitudesAPI,
  extraerError,
  type MiSolicitud,
} from '@/lib/api';
import { LIM } from '@/lib/validacion';

/**
 * «Tengo el código de mi club» — el camino C de §2.1 del plan.
 *
 * ── Qué arregla ──
 *
 * Quien se registraba por su cuenta en el portal se quedaba sin club para
 * siempre. Los dos caminos que había salían del maestro (invitar por correo, o
 * importar de una app vieja), así que si tu maestro no adivinaba tu correo, no
 * existía forma de llegar: tenías cuenta y no servía para nada.
 *
 * ── Por qué pide un código y no busca el club por nombre ──
 *
 * Un buscador de clubes convierte esto en «pide entrar a cualquiera», y el
 * maestro acaba con una bandeja de gente que no conoce. El código lo reparte
 * él, en clase o por WhatsApp, y por eso el que lo teclea casi siempre es quien
 * dice ser. Aun así queda EN ESPERA: el código se reenvía y acaba donde no
 * debe.
 *
 * ── El campo se escribe como sea ──
 *
 * Mayúsculas al vuelo, y el servidor tira espacios y guiones igual. El código
 * se copia de un cartel o se dicta en clase, y no tiene letras que se
 * confundan (ni `I`, ni `O`, ni `0`, ni `1`).
 */
export function EntrarAClub({ onEntrado }: { onEntrado?: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [mias, setMias] = useState<MiSolicitud[]>([]);

  const cargar = useCallback(async () => {
    try {
      setMias(await misSolicitudesAPI());
    } catch {
      // Que no se pueda listar lo que pediste no impide pedirlo: el formulario
      // sigue funcionando y esta lista simplemente no se dibuja.
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pendientes = mias.filter((s) => s.status === 'PENDIENTE');

  async function enviar() {
    setEnviando(true);
    setError('');
    setOk('');
    try {
      const r = await entrarAClubAPI(codigo, nota || undefined);
      if (r.estado === 'YA_ERES_MIEMBRO') {
        setOk(`Ya estás en ${r.org.name}. No hacía falta el código.`);
      } else if (r.estado === 'YA_SOLICITADO') {
        setOk(`Tu solicitud a ${r.org.name} ya estaba en espera.`);
      } else {
        setOk(
          `Listo: ${r.org.name} recibió tu solicitud. Te avisamos cuando tu maestro la acepte.`,
        );
      }
      setCodigo('');
      setNota('');
      await cargar();
      onEntrado?.();
    } catch (e) {
      setError(extraerError(e, 'No se pudo enviar la solicitud.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-1 text-lg font-semibold">Entrar a un club</h2>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Si tu maestro te dio un código, escríbelo aquí. Él lo aprueba y tu club
        aparece solo en Membresías y en Campeonatos.
      </p>

      {pendientes.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {pendientes.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="min-w-0 truncate font-semibold">{s.orgName}</span>
              <span className="badge">Esperando al maestro</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-sm">
          <span className="sr-only">Código del club</span>
          <input
            value={codigo}
            // Mayúsculas mientras se escribe: el código se guarda así y ver
            // otra cosa en pantalla hace dudar de si se tecleó bien.
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código del club (p. ej. K7QM3XPD)"
            maxLength={14}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full font-mono tracking-widest"
          />
        </label>
        <button
          onClick={() => void enviar()}
          disabled={enviando || codigo.trim().length < 4}
          className="btn btn-gold shrink-0"
        >
          {enviando ? 'Enviando…' : 'Pedir entrar'}
        </button>
      </div>

      <label className="mt-2 block text-sm">
        <span className="sr-only">Mensaje para el maestro</span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: «soy el papá de Ana», «entreno los martes»"
          maxLength={LIM.nota}
        />
      </label>

      {error && <p className="msg-error mt-3 text-sm">{error}</p>}
      {ok && <p className="msg-ok mt-3 text-sm">{ok}</p>}
    </section>
  );
}
