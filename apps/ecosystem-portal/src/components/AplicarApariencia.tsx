'use client';

import { useEffect } from 'react';
import api from '@/lib/api';
import { aplicarTema, escucharTemaDelSistema, type Tema } from '@/lib/tema';
import { idiomaDeLocale, useI18n } from '@/lib/i18n';
import { obtenerPaseCrudo, obtenerToken } from '@/lib/sesion';

/**
 * El tema y el idioma, aplicados en TODAS las pantallas del portal.
 *
 * ── Los dos huecos que cierra ──
 *
 * **1. El portal solo hacía esto en el perfil.** `<Apariencia>` recibe el tema
 * guardado y lo aplica, pero vive en `/perfil` y en ninguna otra parte. Así que
 * quien cambiaba a modo claro dentro de Membresías —que ya lo guarda en la
 * cuenta— volvía al portal y lo encontraba oscuro; y al entrar en su perfil, de
 * pronto se aclaraba. Eso es exactamente lo que se describía como «unas veces
 * no cambia y otras se demora»: no era lentitud, era la única pantalla que
 * miraba.
 *
 * **2. El pase se firma al ENTRAR.** El tema viaja dentro (§4.21), lo cual es
 * lo correcto para pintar sin pedir nada — pero un pase de hace veinte minutos
 * dice el tema de hace veinte minutos. Si el cambio se hizo en otra app, aquí
 * no se sabe hasta que el pase se renueve. De ahí la segunda mitad: se pinta
 * con el pase (instantáneo) y **se corrige con el servidor** (verdadero).
 *
 * ── Y el tercero, que no era de sincronización ──
 *
 * `sistema` es el valor por defecto de `users.theme`, y `prefers-color-scheme`
 * se consultaba una sola vez, al pintar. El teléfono que se pone oscuro solo al
 * anochecer no repintaba nada hasta que alguien recargara. `escucharTemaDelSistema`
 * lo arregla, y por eso también se monta aquí: en el layout, una sola vez, para
 * todas las pantallas.
 *
 * No pinta nada. Va en el layout, junto al pie y al vigilante de sesión, por el
 * mismo motivo que ellos: lo que tiene que valer en todas las pantallas no
 * puede depender de que alguien se acordara de ponerlo en cada una.
 */
export function AplicarApariencia() {
  const { setIdioma } = useI18n();

  // ── 1. El tema del sistema, en vivo ──────────────────────────────────────
  useEffect(() => escucharTemaDelSistema(), []);

  // ── 2. Lo que dice el pase: instantáneo, sin pedir nada ──────────────────
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

  // ── 3. Lo que dice el servidor: verdadero, aunque llegue un instante tarde ─
  useEffect(() => {
    // Sin sesión viva no hay a quién preguntar, y tampoco hace falta: lo que
    // se ve sin entrar es lo que diga la copia local.
    if (!obtenerToken()) return;

    let vigente = true;

    async function confirmar() {
      try {
        const { data } = await api.get<{
          theme: string;
          locale: string | null;
        }>('/users/me/apariencia');
        if (!vigente) return;
        if (
          data.theme === 'claro' ||
          data.theme === 'oscuro' ||
          data.theme === 'sistema'
        ) {
          aplicarTema(data.theme);
        }
        if (data.locale) setIdioma(idiomaDeLocale(data.locale));
      } catch {
        // Si el ecosistema no contesta, la pantalla se queda con lo que ya
        // pintó el pase. Es cosmético: no puede impedir usar el portal.
      }
    }

    void confirmar();

    // Y al volver a la pestaña. Es el momento en que de verdad pasa: se cambia
    // el modo en Membresías, se vuelve a la pestaña del portal que llevaba
    // abierta media hora, y hasta ahora seguía como estaba.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void confirmar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [setIdioma]);

  return null;
}
