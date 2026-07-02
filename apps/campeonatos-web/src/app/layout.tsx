import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'DINAMYT Campeonatos',
  description:
    'Gestión y puntuación de campeonatos de Hapkido en tiempo real — ecosistema DINAMYT.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
