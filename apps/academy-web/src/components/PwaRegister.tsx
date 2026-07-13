'use client';

import { useEffect } from 'react';

/** Registra el Service Worker (PWA instalable con arranque rápido). */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
