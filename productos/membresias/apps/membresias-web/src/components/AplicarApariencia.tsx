'use client';

import { useEffect } from 'react';
import { aplicarTema, escucharTemaDelSistema, type Tema } from '@/lib/theme';
import { leerAparienciaDeLaCuenta } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
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

  // ── El tema del sistema, mientras la eleccion sea `sistema` ──────────────
  useEffect(() => escucharTemaDelSistema(), []);

  // ── Y lo que diga la cuenta, que es la verdad ────────────────────────────
  useEffect(() => {
    if (!user) return;
    let vigente = true;

    async function confirmar() {
      const eco = await leerAparienciaDeLaCuenta();
      if (!vigente || !eco) return;

      if (
        eco.theme === 'claro' ||
        eco.theme === 'oscuro' ||
        eco.theme === 'sistema'
      ) {
        aplicarTema(eco.theme as Tema);
      }
      if (eco.locale) {
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
