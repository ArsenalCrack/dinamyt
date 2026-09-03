'use client';

import { useState } from 'react';
import { PAISES, ciudadesDe } from '@/lib/geo';
import { SelectMenu } from '@/components/SelectMenu';
import { LIM } from '@/lib/validacion';

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
      {/* El desplegable propio del ecosistema, no el `<select>` gris del
          sistema operativo: el mismo panel dorado de Membresías y Campeonatos
          (ver `SelectMenu.tsx`). Con doscientos países importa además que el
          panel se abra hacia arriba cuando no cabe abajo, que es lo que este
          hace y el nativo de Android no. */}
      <div className="block text-sm">
        <span style={{ color: 'var(--text-muted)' }}>País{requerido ? ' *' : ''}</span>
        <div className="mt-1">
          <SelectMenu
            valor={pais}
            etiquetaAria="País"
            placeholder="— Elige el país —"
            // Cambiar de país vacía la ciudad: dejar «Medellín» debajo de
            // «México» es peor que dejarlo en blanco.
            onChange={(v) => {
              setAMano(false);
              onChange(v, '');
            }}
            opciones={[
              // Un país guardado que no esté en el catálogo no se pierde.
              ...(pais && !PAISES.includes(pais)
                ? [{ valor: pais, etiqueta: pais }]
                : []),
              ...PAISES.map((p) => ({ valor: p, etiqueta: p })),
            ]}
          />
        </div>
      </div>

      <div className="block text-sm">
        <span style={{ color: 'var(--text-muted)' }}>Ciudad</span>
        {aMano ? (
          <div className="mt-1 flex gap-2">
            <input
              className="min-w-0 flex-1"
              value={ciudad}
              maxLength={LIM.ciudad}
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
          <div className="mt-1">
            <SelectMenu
              valor={ciudad}
              etiquetaAria="Ciudad"
              disabled={!pais}
              placeholder={pais ? '— Elige la ciudad —' : '— Elige antes el país —'}
              onChange={(v) => {
                // La escapatoria: el catálogo no tiene todas las ciudades del
                // mundo, y sin esto un club de un municipio pequeño no tendría
                // forma de decir dónde está.
                if (v === '__otra') {
                  setAMano(true);
                  onChange(pais, '');
                  return;
                }
                onChange(pais, v);
              }}
              opciones={[
                ...ciudades.map((c) => ({ valor: c, etiqueta: c })),
                ...(pais ? [{ valor: '__otra', etiqueta: 'Otra ciudad…' }] : []),
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
