'use client';

import { useEffect } from 'react';
import {
  aplicarTema,
  escucharTemaDelSistema,
  fijarCuenta,
  hayModoElegido,
  refrescarDesdeLaCookie,
  type Tema,
} from '@/lib/theme';
import { leerAparienciaDeLaCuenta } from '@/lib/api';
import {
  fijarCuentaIdioma,
  hayIdiomaElegido,
  idiomaDeLaCookie,
  useI18n,
} from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

/**
 * El tema y el idioma, al dia en TODAS las pantallas.
 *
 * ── Los dos huecos que cierra ──
 *
 * **1. La vuelta.** Lo que se elige aqui ya viaja a las otras apps
 * (`guardarAparienciaEnLaCuenta`), pero al reves no: la preferencia llegaba
 * DENTRO DEL PASE, y esta app solo ve el pase en un momento —el salto desde el
 * portal—. Quien tenia la sesion de aqui abierta desde ayer y cambiaba el modo
 * claro en DINAMYT no veia nada al volver. Esa es la mitad que faltaba de
 * «unas veces se recuerda y otras no».
 *
 * Ahora se PREGUNTA al cargar. Se pinta primero con lo que ya hay —la copia
 * local, que es lo que evita el fogonazo— y se corrige despues.
 *
 * **2. El tema del sistema, en vivo.** `sistema` es el valor por defecto, y
 * `prefers-color-scheme` se consultaba una sola vez al pintar: el telefono que
 * pasa a modo oscuro solo al anochecer se quedaba claro hasta que alguien
 * recargara. Ver `escucharTemaDelSistema`.
 *
 * ── Por que en el layout ──
 *
 * Por lo mismo que el `Toaster` y el pie: lo que tiene que valer en todas las
 * pantallas no puede depender de que alguien se acordara de ponerlo en cada
 * una. Y no pinta nada.
 */
export function AplicarApariencia() {
  const { setIdioma } = useI18n();
  // Solo se pregunta con sesion. Sin ella, `/me/apariencia` responde 401 y el
  // interceptor de `api` lo entiende como «te caducó la sesión» y recarga hacia
  // el login: preguntar el color de la pantalla no puede echar a nadie del
  // kiosco.
  const { user } = useAuth();

  // ── QUIEN esta dentro ────────────────────────────────────────────────────
  //
  // De esto depende que la cookie de este navegador se acepte o se descarte: es
  // del navegador y no de la persona, asi que sin firma quien sale de una
  // cuenta y entra en otra hereda su tema y su idioma. Se reporto asi. Ver «DE
  // QUIEN ES LA ELECCION» en `lib/theme.ts`.
  useEffect(() => {
    const id = user ? String((user as { id?: string | number }).id ?? '') : '';
    fijarCuenta(id || null);
    fijarCuentaIdioma(id || null);
  }, [user]);

  // ── El tema del sistema, mientras la eleccion sea `sistema` ──────────────
  useEffect(() => escucharTemaDelSistema(), []);

  // ── La cookie compartida, cada vez que se vuelve a esta pestaña ──────────
  //
  // Es la pieza que faltaba, y la que de verdad arregla «lo cambio en una app y
  // en la otra sigue igual». La cookie `.dinamyt.org` reparte la elección a las
  // cuatro webs en el acto, pero solo se LEE al arrancar la página: una pestaña
  // abierta desde hace media hora no vuelve a mirarla nunca.
  //
  // La consulta al servidor de abajo parecía cubrirlo, pero su guarda
  // `hayModoElegido()` es cierta en cuanto exista la cookie, o sea siempre que
  // alguien haya elegido modo alguna vez en este navegador. La sincronización
  // estaba tapiada por su propia guarda.
  //
  // Aquí no hace falta guarda: la cookie ES la última elección de esta persona
  // en este navegador, en cualquiera de las cuatro apps. Aplicarla no puede
  // pisar nada más reciente, porque no hay nada más reciente. Y va sin sesión
  // también: las pantallas públicas se ven sin entrar y también tienen que
  // respetar el modo claro.
  useEffect(() => {
    const releer = () => {
      refrescarDesdeLaCookie();
      const idi = idiomaDeLaCookie();
      if (idi) setIdioma(idi);
    };
    // Al VOLVER a la pestania, no al esconderla: `visibilitychange` avisa de
    // los dos, y releer al irse no le sirve a nadie.
    const alVolver = () => {
      if (document.visibilityState === 'visible') releer();
    };
    document.addEventListener('visibilitychange', alVolver);
    // Y `focus` además de `visibilitychange`: cambiar de VENTANA —dos ventanas
    // lado a lado, o la app instalada junto al navegador— no siempre dispara el
    // segundo, y ese es justo el caso de quien tiene dos apps abiertas a la vez.
    // `focus` va SIN la comprobacion de visibilidad, y a proposito: hay
    // contextos donde `visibilityState` dice `hidden` aunque la ventana este
    // delante —una vista incrustada, un panel lateral, algun navegador
    // embebido—, y ahi la comprobacion dejaba el refresco muerto. Recibir el
    // foco ya significa que alguien esta mirando; leer una cookie es gratis.
    window.addEventListener('focus', releer);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', releer);
    };
  }, [setIdioma]);

  // ── Y lo que diga la cuenta, que es la verdad ────────────────────────────
  useEffect(() => {
    if (!user) return;
    let vigente = true;

    async function confirmar() {
      const eco = await leerAparienciaDeLaCuenta();
      if (!vigente || !eco) return;

      // ⚠️ Solo si este navegador NO tiene ya una elección. La respuesta del
      // servidor puede ser más vieja que el clic que se acaba de dar en la app
      // de al lado, y sin esta guarda lo deshacía —y de paso escribía el valor
      // viejo en la cookie compartida. Ver `hayModoElegido`.
      if (
        !hayModoElegido() &&
        (eco.theme === 'claro' || eco.theme === 'oscuro' || eco.theme === 'sistema')
      ) {
        aplicarTema(eco.theme as Tema);
      }
      if (!hayIdiomaElegido() && eco.locale) {
        setIdioma(eco.locale.toLowerCase().startsWith('en') ? 'en' : 'es');
      }
    }

    void confirmar();

    // Y al volver a la pestana. Es el momento en que de verdad pasa: se cambia
    // el modo en el portal, se vuelve a la pestana de aqui que llevaba abierta
    // toda la tarde, y hasta ahora seguia como estaba.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void confirmar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [setIdioma, user]);

  return null;
}
