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
   * El escudo de DINAMYT. Son los MISMOS archivos que usa DINAMYT-LOCAL, y
   * declarados igual que allá: los tres transparentes, ninguno con recuadro.
   *
   * ── Por qué no hay icono `maskable` ──
   *
   * Un icono maskable le promete al sistema que llena el cuadro de borde a
   * borde, y a cambio se lo deja recortar a su antojo. Nuestro escudo no es
   * así —es transparente y con aire alrededor—, y declararlo maskable es lo
   * que hacía que Android lo pintara sobre un cuadro del color de fondo del
   * manifiesto (casi negro) y que la pantalla de carga saliera con un plato
   * detrás. Sin la declaración, Android usa el de 512 px tal cual: el escudo
   * recortado, en alta resolución y sin fondo. Exactamente lo que hace LOCAL.
   *
   * Lo que sí va declarado es el `apple-touch-icon`: sin él, iOS llega a
   * inventarse uno con una captura de la página.
   */
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icon-192.png', type: 'image/png' }],
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
