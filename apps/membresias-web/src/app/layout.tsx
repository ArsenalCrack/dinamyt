import type { Metadata } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Tipografía del ecosistema (espejo del portal): display deportivo, cuerpo
// humanista y mono de marcador para PIN, fechas y montos.
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
  title: 'DINAMYT Membresías',
  description: 'Control de mensualidades y asistencia del club — ecosistema DINAMYT.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${cuerpo.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
