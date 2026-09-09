import type { Metadata } from 'next';

/**
 * El título de la pestaña de esta pantalla.
 *
 * Va en un `layout.tsx` y no en la página porque la página es de cliente
 * (`'use client'`), y una página de cliente no puede exportar `metadata`. Son
 * dos líneas y es lo que hace que la pestaña diga «Mi perfil · DINAMYT» en vez
 * de repetir la frase larga de la portada en las nueve pantallas.
 *
 * El «· DINAMYT» lo pone la plantilla del layout raíz.
 */
export const metadata: Metadata = {
  title: 'Mi perfil',
  description: 'Tus datos: los mismos en todas las aplicaciones.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
