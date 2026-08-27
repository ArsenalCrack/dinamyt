import type { Metadata } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { VigilanteDeSesion } from '@/components/VigilanteDeSesion';

// Tipografía del ecosistema: display deportivo (Archivo, eje de anchura),
// cuerpo humanista (Instrument Sans) y mono de marcador (IBM Plex Mono).
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
  title: 'DINAMYT — El ecosistema digital del Hapkido',
  description:
    'Una sola cuenta para todo el deporte: campeonatos con puntuación en vivo, mensualidades y asistencia del club, e historial deportivo inmutable.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${cuerpo.variable} ${mono.variable}`}
    >
      <body>
        {children}
        {/* El reloj de inactividad. Va en el layout para que corra en todas
            las pantallas: una sesión abandonada no se cierra sola solo en las
            que alguien se acordó de ponerlo. */}
        <VigilanteDeSesion />
      </body>
    </html>
  );
}
