'use client';

import { useState } from 'react';
import { PAISES, ciudadesDe } from '@/lib/geo';

/**
 * País y ciudad, los dos como desplegable.
 *
 * ── Por qué no son dos `input` de texto ──
 *
 * Lo eran, y por eso la misma ciudad acababa escrita de cuatro maneras
 * («Bogotá», «bogota», «Bogota D.C.», «BOGOTÁ»). Campeonatos agrupa sus
 * reportes comparando ese texto por valor exacto, así que cada variante era un
 * grupo distinto — y el club que escribía «Colombia » con un espacio de más
 * dejaba de contar en su propio país.
 *
 * ── La escapatoria ──
 *
 * El catálogo no tiene todas las ciudades del mundo, así que la ciudad ofrece
 * «Otra ciudad…» y deja escribirla a mano. Sin eso, un club de un municipio
 * pequeño no tendría forma de decir dónde está. Lo que ya estaba guardado y no
 * figura en el catálogo abre directamente en ese modo, con su texto puesto: un
 * desplegable que no encuentra su valor lo enseñaría vacío y lo borraría al
 * primer guardado.
 */
export function PaisCiudad({
  pais,
  ciudad,
  onChange,
  requerido = false,
}: {
  pais: string;
  ciudad: string;
  onChange: (pais: string, ciudad: string) => void;
  requerido?: boolean;
}) {
  const ciudades = ciudadesDe(pais);
  // Arranca a mano si lo guardado no está en el catálogo (y no está vacío).
  const [aMano, setAMano] = useState(Boolean(ciudad) && !ciudades.includes(ciudad));

  return (
    <>
      <label className="block text-sm">
        <span style={{ color: 'var(--text-muted)' }}>País{requerido ? ' *' : ''}</span>
        <select
          className="mt-1 w-full"
          value={pais}
          // Cambiar de país vacía la ciudad: dejar «Medellín» debajo de
          // «México» es peor que dejarlo en blanco.
          onChange={(e) => {
            setAMano(false);
            onChange(e.target.value, '');
          }}
          required={requerido}
        >
          <option value="">— Elige el país —</option>
          {/* Un país guardado que no esté en el catálogo no se pierde. */}
          {pais && !PAISES.includes(pais) && <option value={pais}>{pais}</option>}
          {PAISES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span style={{ color: 'var(--text-muted)' }}>Ciudad</span>
        {aMano ? (
          <div className="mt-1 flex gap-2">
            <input
              className="min-w-0 flex-1"
              value={ciudad}
              maxLength={100}
              placeholder="Escribe la ciudad"
              onChange={(e) => onChange(pais, e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-outline btn-sm shrink-0"
              onClick={() => {
                setAMano(false);
                onChange(pais, '');
              }}
              title="Volver a la lista de ciudades"
            >
              ↺
            </button>
          </div>
        ) : (
          <select
            className="mt-1 w-full"
            value={ciudad}
            disabled={!pais}
            onChange={(e) => {
              if (e.target.value === '__otra') {
                setAMano(true);
                onChange(pais, '');
                return;
              }
              onChange(pais, e.target.value);
            }}
          >
            <option value="">{pais ? '— Elige la ciudad —' : '— Elige antes el país —'}</option>
            {ciudades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {pais && <option value="__otra">Otra ciudad…</option>}
          </select>
        )}
      </label>
    </>
  );
}
