'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker al cargar la app.
 *
 * Es lo que la hace instalable: sin un SW activo, el navegador no ofrece
 * «Añadir a la pantalla de inicio» y el maestro no puede tener la app como un
 * ícono más en su celular. También deja lista la recepción de avisos push,
 * aunque el permiso se pida después desde «Mi estado».
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Tras la carga, para no competir por ancho de banda con el primer pintado.
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sin SW la app funciona igual, solo deja de ser instalable */
      });
    };
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }, []);

  return null;
}
