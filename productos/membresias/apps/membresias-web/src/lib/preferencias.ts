'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lo que cada pantalla recuerda de una visita a la siguiente: con qué filtros y
 * en qué orden mira uno sus listas.
 *
 * **Por qué se guarda.** El maestro no mira su club de una sola manera. Uno
 * abre siempre por «vencidos» porque su trabajo de la semana es cobrar; otro
 * abre por la clase de los niños porque es la que le toca a esa hora. Volver a
 * armar el mismo filtro cada vez que se entra —y en el celular, con el
 * desplegable— es de esas fricciones pequeñas que acaban en «mejor lo miro en
 * el cuaderno».
 *
 * **Dónde.** En `localStorage`, como el tema y el idioma (`lib/theme.ts`,
 * `lib/i18n.tsx`): es una preferencia de ESTE aparato y de quien lo usa, no un
 * dato del club. Que no viaje al servidor también quiere decir que no hace
 * falta migrar nada ni pedirle permiso a nadie, y que el modo incógnito
 * sencillamente no recuerda —que es lo que se espera del modo incógnito—.
 *
 * **Por persona.** La clave lleva el id de quien entró. El maestro y su
 * auxiliar comparten a menudo la tablet del club, y heredar el filtro del otro
 * —una lista corta, sin explicación— se lee como que faltan alumnos.
 *
 * **Lo que NO se guarda: el texto que se está buscando.** Un filtro guardado se
 * ve —hay un chip que lo dice y un botón para quitarlo—; una búsqueda a medio
 * escribir de hace tres días, no. Volver a la app y encontrarse «Nadie coincide
 * con esa búsqueda» sin haber escrito nada es exactamente el susto que este
 * archivo existe para no dar.
 */

const PREFIJO = 'membresias_pref';

function clave(nombre: string, quien: string) {
  return `${PREFIJO}:${nombre}:${quien}`;
}

/**
 * Lee lo guardado y lo mezcla sobre los valores de partida.
 *
 * Solo se aceptan las claves que el valor por defecto ya tiene, y solo del
 * mismo tipo. Lo guardado es un texto que cualquiera puede editar desde las
 * herramientas del navegador, y sobre todo es de una VERSIÓN ANTERIOR de la
 * app: el filtro que ayer se llamaba de una forma hoy puede no existir, y eso
 * no puede dejar una pantalla en blanco.
 */
function leer<T extends Record<string, string>>(nombre: string, quien: string, base: T): T {
  try {
    const crudo = localStorage.getItem(clave(nombre, quien));
    if (!crudo) return base;
    const guardado = JSON.parse(crudo) as Record<string, unknown>;
    const salida = { ...base };
    for (const k of Object.keys(base) as (keyof T)[]) {
      const v = guardado[k as string];
      if (typeof v === 'string') salida[k] = v as T[keyof T];
    }
    return salida;
  } catch {
    return base;
  }
}

/**
 * Los filtros de una pantalla, recordados entre sesiones.
 *
 * Se leen en un efecto y no al montar el componente: en el primer render no hay
 * `localStorage` —esto se pinta también en el servidor— y todavía no se sabe
 * quién entró. `listo` es lo que la pantalla mira para no pedirle a la API una
 * primera lista con los filtros de nadie y otra medio segundo después con los
 * de verdad.
 *
 * `normalizar` es de cada pantalla: es la que sabe qué cinturones existen y qué
 * órdenes admite su listado, y devuelve algo que se pueda enseñar aunque lo
 * guardado sea de otra versión.
 */
export function useFiltros<T extends Record<string, string>>(
  nombre: string,
  base: T,
  quien: string | undefined,
  normalizar: (v: T) => T,
) {
  const [valor, setValor] = useState<T>(base);
  const [listo, setListo] = useState(false);
  // Se guardan en refs para poder leerlos sin meterlos en las dependencias del
  // efecto: son un objeto y una función nuevos en cada render, así que como
  // dependencias volverían a leer lo guardado —y a pisar lo que se acabe de
  // elegir— en cada repintado.
  const baseRef = useRef(base);
  const normRef = useRef(normalizar);
  normRef.current = normalizar;

  useEffect(() => {
    if (!quien) return;
    setValor(normRef.current(leer(nombre, quien, baseRef.current)));
    setListo(true);
  }, [nombre, quien]);

  /** Cambia uno o varios filtros a la vez, y lo deja guardado. */
  const cambiar = useCallback(
    (parte: Partial<T>) => {
      setValor((v) => {
        const nuevo = { ...v, ...parte };
        if (quien) {
          try {
            localStorage.setItem(clave(nombre, quien), JSON.stringify(nuevo));
          } catch {
            /* incógnito o almacenamiento lleno: se filtra igual, solo que hoy */
          }
        }
        return nuevo;
      });
    },
    [nombre, quien],
  );

  /** Vuelve a la lista sin filtrar. */
  const limpiar = useCallback(() => cambiar(baseRef.current), [cambiar]);

  return { filtros: valor, cambiar, limpiar, listo };
}
