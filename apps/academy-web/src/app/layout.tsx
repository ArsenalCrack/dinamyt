import type { Metadata } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { PwaRegister } from '@/components/PwaRegister';
import { VigilanteDeSesion } from '@/components/VigilanteDeSesion';
import { AplicarApariencia } from '@/components/AplicarApariencia';
import { Version } from '@/components/Version';
import { ControlesApariencia } from '@/components/ControlesApariencia';
import { I18nProvider } from '@/lib/i18n';
import { SCRIPT_ANTI_PARPADEO } from '@/lib/tema';

// Tipografía del ecosistema (espejo del portal): display deportivo, cuerpo
// humanista y mono de marcador para grados, fechas y notas.
const display = Archivo({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['wdth'],
});
const cuerpo = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'DINAMYT Academy',
  description:
    'Plataforma de enseñanza de artes marciales por grado de cinturón — ecosistema DINAMYT.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // `suppressHydrationWarning` va por el script anti-parpadeo, y solo por él:
  // ese script escribe `data-theme="light"` en <html> ANTES de que React
  // hidrate, así que el HTML del servidor y el del cliente no coinciden a
  // propósito — es justo lo que evita el fogonazo oscuro. Sin esto, React avisa
  // en cada carga de una diferencia que causamos queriendo. Silencia solo ESE
  // elemento, no el árbol.
  return (
    <html
      suppressHydrationWarning
      lang="es"
      className={`${display.variable} ${cuerpo.variable} ${mono.variable}`}
    >
      <head>
        {/* ANTES de pintar nada: si esto esperara a React, quien tiene el modo
            claro vería la pantalla oscura un instante y luego aclararse, y ese
            fogonazo se lee como un fallo de la aplicación. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
      </head>
      <body>
        <I18nProvider>
          {/* El tema y el idioma que eligió esta persona en el portal. Vienen
              dentro del pase, así que no hace falta preguntarle nada al
              ecosystem para pintar bien. */}
          <AplicarApariencia />
          {/* Barra global: enlaces por rol + hamburguesa en móvil (se oculta
              sola en /login). */}
          <PwaRegister />
          <NavBar />
          {children}
          {/* El reloj de inactividad. Va en el layout para que corra en todas
              las pantallas: una sesión abandonada no se cierra sola solo en
              las que alguien se acordó de ponerlo. */}
          <VigilanteDeSesion />
          {/* Tema e idioma, con el mismo dibujo que en Membresías. */}
          <ControlesApariencia />
          {/* La versión que está corriendo. Academy no tenía pie; esta línea lo
              es, y sirve para lo mismo que en el portal: saber de un vistazo si
              lo que alguien está viendo trae ya el arreglo. */}
          <footer
            className="border-t py-5 text-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <Version />
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
