import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { RegistrarServiceWorker } from '@/components/RegistrarServiceWorker';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { SCRIPT_ANTI_FLASH } from '@/lib/theme';

// Tipografía: display deportivo, cuerpo humanista y mono de marcador para
// PIN, fechas y montos.
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
  description: 'Control de mensualidades y asistencia de tu club de artes marciales.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Membresías',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  // El script anti-flash reescribe este valor si el tema guardado es claro.
  themeColor: '#0e0e15',
  width: 'device-width',
  initialScale: 1,
  // El kiosco y el carnet se usan en móvil: sin un tope de zoom, un doble
  // toque hace zoom justo mientras se escanea. Con 5 sigue siendo accesible.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${cuerpo.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema guardado ANTES del primer pintado: sin esto, quien
            usa modo claro ve un fogonazo oscuro en cada recarga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH }} />
      </head>
      <body>
        <I18nProvider>
          <AuthProvider>
            {/* Barra global: enlaces por rol + tema e idioma. Se oculta sola
                en /login y /kiosco. */}
            <NavBar />
            {children}
            <RegistrarServiceWorker />
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
