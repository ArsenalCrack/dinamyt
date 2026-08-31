import type { Metadata } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { PieDePagina } from '@/components/PieDePagina';
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

/**
 * La descripción es lo que se lee en Google y en WhatsApp antes de entrar, así
 * que se somete a la misma regla que la portada: solo lo que el software hace
 * hoy. La anterior prometía «historial deportivo inmutable», que es de Academy
 * —una app que existe pero todavía no se ofrece—, y «todo el deporte», que son
 * tres apps cuando hoy se venden dos.
 */
export const metadata: Metadata = {
  title: 'DINAMYT — El ecosistema digital del Hapkido',
  description:
    'Una sola cuenta para el club y el campeonato: mensualidades y asistencia con Membresías, y torneos con puntuación en vivo desde el tatami con Campeonatos.',
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
        {/* El pie va aquí por el mismo motivo que el reloj: para que salga en
            todas las pantallas. La de soporte tiene que verse sobre todo en
            login y registro, donde no hay menú al que ir. */}
        <PieDePagina />
        {/* El reloj de inactividad. Va en el layout para que corra en todas
            las pantallas: una sesión abandonada no se cierra sola solo en las
            que alguien se acordó de ponerlo. */}
        <VigilanteDeSesion />
      </body>
    </html>
  );
}
