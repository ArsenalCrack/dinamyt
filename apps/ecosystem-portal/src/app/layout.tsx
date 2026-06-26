import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DINAMYT Ecosystem',
  description:
    'Portal del ecosistema DINAMYT: identidad única, suscripciones y acceso a las aplicaciones.',
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
