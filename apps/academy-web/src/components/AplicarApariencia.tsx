'use client';

import { useEffect } from 'react';
import { aplicarTema, escucharTemaDelSistema, type Tema } from '@/lib/tema';
import { idiomaDeLocale, useI18n } from '@/lib/i18n';
import { obtenerPaseCrudo } from '@/lib/sesion';

/**
 * Aplica el tema y el idioma que vienen EN EL PASE.
 *
 * ── El problema que cierra ──
 *
 * El tema y el idioma se eligen una sola vez, en el perfil del portal. Pero
 * `localStorage` es **por origen**, y las cuatro webs viven en subdominios
 * distintos: `dinamyt.org`, `club.dinamyt.org`, `campeonatos.dinamyt.org`,
 * `academy.dinamyt.org`. Así que lo que se guarda en el navegador del portal no
 * lo ve ninguna de las otras tres, y quien prefiere el modo claro tenía que
 * pedirlo cuatro veces — y otra vez en cada teléfono.
 *
 * ── Por qué el PASE y no una llamada a la API ──
 *
 * Porque el pase ya llega, ya está verificado y ya trae `timezone` por el mismo
 * motivo (§4.12). Añadirle `theme` y `locale` no cuesta una petición más, no
 * necesita que el ecosystem esté en pie para pintar la primera pantalla, y no
 * hay ninguna fila que espejar ni que se pueda quedar vieja.
 *
 * La copia local sigue existiendo y hace falta: es lo que pinta el tema bueno
 * ANTES de que este componente se monte (`SCRIPT_ANTI_PARPADEO`). Esto la
 * corrige cuando el pase dice otra cosa — que es lo que pasa la primera vez
 * que alguien entra aquí desde el portal.
 */
export function AplicarApariencia() {
  const { setIdioma } = useI18n();

  // `sistema` es el valor por defecto, y `prefers-color-scheme` se consultaba
  // una sola vez al pintar: el teléfono que se oscurece solo al anochecer no
  // repintaba hasta que alguien recargara. Ver `escucharTemaDelSistema`.
  useEffect(() => escucharTemaDelSistema(), []);

  useEffect(() => {
    let pase: Record<string, unknown> | null = null;
    try {
      // El pase CRUDO: aunque haya vencido sigue diciendo qué tema eligió esta
      // persona, y pintar bien no necesita una sesión viva.
      const t = obtenerPaseCrudo();
      if (!t) return;
      const parte = t.split('.')[1];
      pase = JSON.parse(
        atob(parte.replace(/-/g, '+').replace(/_/g, '/')),
      ) as Record<string, unknown>;
    } catch {
      return; // sin pase legible no hay nada que aplicar
    }
    if (!pase) return;

    const tema = pase.theme;
    if (tema === 'claro' || tema === 'oscuro' || tema === 'sistema') {
      aplicarTema(tema as Tema);
    }
    if (typeof pase.locale === 'string' && pase.locale) {
      setIdioma(idiomaDeLocale(pase.locale));
    }
  }, [setIdioma]);

  return null;
}
