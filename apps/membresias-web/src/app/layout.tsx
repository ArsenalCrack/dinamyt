import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { PieLegal } from '@/components/PieLegal';
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

// Lo que el alumno lee en la pestaña y bajo el ícono de la app instalada. El
// nombre interno del proyecto sigue siendo «membresías»; lo que ve el usuario,
// no: su club.
export const metadata: Metadata = {
  title: 'Mi Club · DINAMYT',
  description: 'Tu carnet, tus asistencias y tu estado en el club.',
  manifest: '/manifest.json',
  /**
   * El escudo de DINAMYT, con una distinción que no es capricho:
   *
   * - **La pestaña y la pantalla de carga** usan los PNG TRANSPARENTES. Ahí el
   *   escudo se recorta contra el fondo de la app, sin recuadro, y salen del
   *   maestro de 1024 px remuestreado a cada tamaño: nada se ve interpolado.
   *
   * - **El icono instalado en el celular** usa el de FONDO BLANCO
   *   (`apple-touch-icon`). iOS no admite transparencia en ese icono: lo que
   *   no tiene fondo lo rellena de NEGRO, y de ahí venía el escudo dentro de
   *   un cuadro negro. El equivalente de Android va en el manifiesto, como
   *   icono `maskable`.
   *
   * Va todo declarado y no se deja a que cada plataforma adivine: sin
   * `apple-touch-icon`, iOS llega a inventarse uno con una captura de la
   * página.
   */
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Mi Club',
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
            {/* Al pie de TODA la app, incluido el panel del alumno. */}
            <PieLegal />
            <RegistrarServiceWorker />
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
