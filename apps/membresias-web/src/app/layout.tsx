import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DINAMYT Membresías',
  description: 'Control de mensualidades y asistencia del club — ecosistema DINAMYT.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
