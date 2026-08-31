'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { LIM } from '@/lib/campos';
import { SelectMenu } from './SelectMenu';

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
  /** Punto de color a la izquierda (lo usa el cinturón). */
  punto?: string;
}

export interface GrupoFiltro {
  clave: string;
  /** Título del grupo: «Estado de pago», «Clase», «Ordenar por»… */
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  opciones: OpcionFiltro[];
  /**
   * `chips` para tres o cuatro opciones que se quieren ver todas de un golpe;
   * `menu` para las listas largas (los once cinturones, las clases del club).
   */
  tipo?: 'chips' | 'menu';
  /** Qué valor significa «sin filtrar». Por defecto, el vacío. */
  neutro?: string;
  /** Ocupa la fila entera de la parrilla: para un grupo de chips largo. */
  ancho?: boolean;
}

/**
 * La barra con la que se acomoda un listado: buscar, filtrar y ordenar.
 *
 * **Qué resuelve.** El panel del club y la lista de alumnos enseñaban una caja
 * de búsqueda y poco más: para encontrar «los cinturones negros que deben» no
 * quedaba otra que pasar páginas leyendo filas. Y las dos pantallas van por
 * páginas, así que lo que se elige aquí viaja a la API y filtra el club entero
 * — nunca la página que se está viendo (ver `lib/filtros.ts` en la API).
 *
 * **Cómo está armada, y por qué así:**
 *
 * - **Lo que siempre se ve es la búsqueda.** Es lo que se usa veinte veces al
 *   día. El resto vive detrás de un botón que dice cuántos filtros hay puestos:
 *   una fila con cuatro desplegables en un celular es más pantalla ocupada que
 *   lista.
 * - **Lo puesto se ve aunque el panel esté plegado.** Debajo quedan los filtros
 *   activos como fichas, cada una con su ✕. Esto no es decoración: los filtros
 *   se guardan de un día para otro (`lib/preferencias.ts`), y una lista corta
 *   sin nada que explique por qué es corta se lee como que faltan alumnos.
 * - **El panel se abre solo si ya había algo filtrado.** Al volver a la app,
 *   lo primero es ver con qué se está mirando; a partir de ahí se pliega y no
 *   estorba.
 *
 * El orden va como un grupo más, y cuenta como filtro puesto cuando no es el de
 * siempre: para quien mira la pantalla, «ordenado por quién debe primero» es
 * tan parte de «cómo estoy viendo esto» como «solo los vencidos».
 */
export function Filtros({
  busqueda,
  onBuscar,
  placeholder,
  grupos,
  total,
  onLimpiar,
}: {
  busqueda: string;
  onBuscar: (valor: string) => void;
  placeholder: string;
  grupos: GrupoFiltro[];
  /** Cuántas filas hay con estos filtros. Solo se enseña si hay alguno puesto. */
  total?: number;
  onLimpiar: () => void;
}) {
  const { t } = useI18n();

  const puestos = grupos.filter((g) => g.valor !== (g.neutro ?? ''));
  // Se calcula UNA vez, al montar. Cuando esto se dibuja, los filtros guardados
  // ya están leídos (la pantalla enseña «Cargando…» hasta entonces), así que
  // abrir el panel aquí es abrirlo con lo que de verdad hay puesto.
  const [abierto, setAbierto] = useState(() => puestos.length > 0);

  return (
    <section className="filtros">
      <div className="filtros-cabecera">
        <div className="filtros-buscar">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M16.5 16.5 21 21"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
            maxLength={LIM.busqueda}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </div>
        <button
          type="button"
          className="filtros-toggle"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          {/* Los tres controles deslizantes: es «acomodar», no «buscar». */}
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h11M18 6h3M3 12h4M11 12h10M3 18h8M15 18h6" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="13" cy="18" r="2" />
            </g>
          </svg>
          {t('filtros.titulo')}
          {puestos.length > 0 && <span className="filtros-cuenta">{puestos.length}</span>}
          <span className="filtros-flecha" aria-hidden="true" data-abierto={abierto}>
            ▾
          </span>
        </button>
      </div>

      {abierto && (
        <div className="filtros-panel">
          {grupos.map((g) => (
            <div className="filtros-grupo" key={g.clave} data-ancho={g.ancho || undefined}>
              <span className="eyebrow">{g.etiqueta}</span>
              {g.tipo === 'chips' ? (
                <div className="filtros-chips" role="group" aria-label={g.etiqueta}>
                  {g.opciones.map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      className="filtros-chip"
                      data-activa={o.valor === g.valor}
                      aria-pressed={o.valor === g.valor}
                      onClick={() => g.onChange(o.valor)}
                    >
                      {o.punto && (
                        <span className="filtros-punto" style={{ background: o.punto }} />
                      )}
                      {o.etiqueta}
                    </button>
                  ))}
                </div>
              ) : (
                <SelectMenu
                  valor={g.valor}
                  onChange={g.onChange}
                  opciones={g.opciones}
                  etiquetaAria={g.etiqueta}
                />
              )}
            </div>
          ))}
          <p className="muted filtros-nota">{t('filtros.seGuardan')}</p>
        </div>
      )}

      {puestos.length > 0 && (
        <div className="filtros-pie">
          {total != null && (
            <span className="muted filtros-resumen mono">
              {total} {t('filtros.resultados')}
            </span>
          )}
          {puestos.map((g) => {
            const elegida = g.opciones.find((o) => o.valor === g.valor);
            return (
              <button
                key={g.clave}
                type="button"
                className="filtros-activo"
                title={t('filtros.quitar')}
                onClick={() => g.onChange(g.neutro ?? '')}
              >
                <span className="muted">{g.etiqueta}:</span>
                <b>{elegida?.etiqueta ?? g.valor}</b>
                <span aria-hidden="true">✕</span>
              </button>
            );
          })}
          <button type="button" className="filtros-limpiar" onClick={onLimpiar}>
            {t('filtros.limpiar')}
          </button>
        </div>
      )}
    </section>
  );
}
