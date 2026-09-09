'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import {
  aplicarTema,
  escucharTemaDelSistema,
  fijarCuenta,
  hayModoElegido,
  refrescarDesdeLaCookie,
  type Tema,
} from '@/lib/tema';
import {
  fijarCuentaIdioma,
  hayIdiomaElegido,
  idiomaDeLaCookie,
  idiomaDeLocale,
  useI18n,
} from '@/lib/i18n';
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
  /**
   * La ruta, y no por decoración: es lo que dice que la sesión pudo cambiar.
   *
   * El efecto 0 leía el pase UNA vez, al montar — y este componente monta en el
   * layout, o sea en `/login`, cuando todavía no hay pase. Resultado: la cuenta
   * se quedaba en `null` toda la sesión y cada elección se firmaba `anon`, que
   * es exactamente la firma que NO distingue una cuenta de otra. Se vio en la
   * primera prueba: `dinamyt_tema=claro~anon` con la sesión abierta.
   *
   * Entrar y salir son navegaciones, así que la ruta cambia justo cuando el
   * pase aparece o desaparece.
   */
  const pathname = usePathname();

  // ── 0. QUIÉN está dentro ─────────────────────────────────────────────────
  //
  // Va primero y sin depender de nada: de esto depende que la cookie de este
  // navegador se acepte o se descarte. Sin ello, quien salía de una cuenta y
  // entraba en otra se encontraba el tema y el idioma de la anterior — la
  // cookie es del navegador, no de la persona. Ver «DE QUIÉN ES LA ELECCIÓN»
  // en `lib/tema.ts`.
  //
  // Se lee del pase CRUDO: aunque haya vencido sigue diciendo de quién es esta
  // sesión, y para decidir de quién es una preferencia no hace falta que la
  // sesión esté viva.
  useEffect(() => {
    let sub: string | null = null;
    try {
      const t = obtenerPaseCrudo();
      if (t) {
        const parte = t.split('.')[1];
        const datos = JSON.parse(
          atob(parte.replace(/-/g, '+').replace(/_/g, '/')),
        ) as { sub?: string };
        sub = datos.sub ?? null;
      }
    } catch {
      /* pase ilegible: se trata como «nadie ha entrado» */
    }
    fijarCuenta(sub);
    fijarCuentaIdioma(sub);
  }, [pathname]);

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

    // ⚠️ Solo si este navegador NO tiene ya una elección. El pase es una foto
    // de la cuenta del momento de entrar: es lo más viejo que hay. Sin esta
    // guarda pisaba el modo que se acababa de elegir en Membresías —y lo
    // escribía en la cookie compartida, repartiendo el valor viejo a las otras
    // tres webs. Ver `hayModoElegido`.
    const tema = pase.theme;
    if (!hayModoElegido() && (tema === 'claro' || tema === 'oscuro' || tema === 'sistema')) {
      aplicarTema(tema as Tema);
    }
    if (!hayIdiomaElegido() && typeof pase.locale === 'string' && pase.locale) {
      setIdioma(idiomaDeLocale(pase.locale));
    }
  }, [setIdioma]);

  // ── 2b. La cookie compartida, cada vez que se vuelve a esta pestaña ──────
  //
  // Es la pieza que faltaba, y es la que de verdad arregla «lo cambio en una
  // app y en la otra sigue igual». La cookie `.dinamyt.org` ya reparte la
  // elección a las cuatro webs en el acto, pero solo se LEE al arrancar la
  // página: una pestaña abierta desde hace media hora no vuelve a mirarla.
  //
  // El paso 3 parecía cubrirlo —pregunta al servidor al volver—, pero su
  // guarda `hayModoElegido()` es cierta en cuanto exista la cookie, o sea
  // siempre que alguien haya elegido modo alguna vez en este navegador. La
  // sincronización estaba tapiada por su propia guarda.
  //
  // Aquí no hay guarda que valga: la cookie ES la última elección de esta
  // persona en este navegador, en cualquiera de las cuatro apps. Aplicarla no
  // puede pisar nada más reciente, porque no hay nada más reciente.
  //
  // Va sin sesión también: las pantallas públicas del portal se ven sin entrar
  // y también tienen que respetar el modo claro.
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
    // Y `focus` además de `visibilitychange`: cambiar de VENTANA (dos ventanas
    // lado a lado, o la app instalada junto al navegador) no siempre dispara el
    // segundo, y ese es justo el caso de quien tiene el portal y Membresías
    // abiertos a la vez.
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
        // Y la cuenta, con la misma guarda: sirve para el dispositivo NUEVO,
        // donde todavía no hay cookie. En uno que ya tiene elección, imponerla
        // deshacía el clic que se acababa de dar en la app de al lado —la
        // respuesta del servidor puede ser más vieja que ese clic.
        if (
          !hayModoElegido() &&
          (data.theme === 'claro' || data.theme === 'oscuro' || data.theme === 'sistema')
        ) {
          aplicarTema(data.theme);
        }
        if (!hayIdiomaElegido() && data.locale) setIdioma(idiomaDeLocale(data.locale));
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
