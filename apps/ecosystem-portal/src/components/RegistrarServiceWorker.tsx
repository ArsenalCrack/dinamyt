'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker al cargar el portal.
 *
 * Es lo que hace a DINAMYT **instalable**: sin un service worker activo el
 * navegador no ofrece «Añadir a la pantalla de inicio», y sin eso el portal es
 * una página que hay que buscar entre las pestañas en vez de un icono al lado
 * del de Membresías. Que la aplicación del club se instale y la del ecosistema
 * no era una diferencia sin motivo.
 *
 * Se registra **después de la carga** para no competir por ancho de banda con
 * el primer pintado: instalar el shell son seis peticiones que no tienen
 * ninguna prisa. Y si falla, no pasa nada — el portal funciona igual; lo único
 * que se pierde es poder instalarlo.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sin SW el portal funciona igual, solo deja de ser instalable */
      });
    };
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }, []);

  return null;
}
