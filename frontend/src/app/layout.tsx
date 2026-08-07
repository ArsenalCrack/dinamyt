import type { Metadata } from "next";
import { Barlow_Condensed, Bebas_Neue, Inter, Share_Tech_Mono } from "next/font/google";
import AppMenu from "@/components/AppMenu";
import PorteroMantenimiento from "@/components/PorteroMantenimiento";
import Toaster from "@/components/Toaster";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

// Fuentes auto-hospedadas: next/font las descarga en el build y las sirve
// desde nuestro dominio. Con el @import a Google Fonts, los celulares que no
// alcanzaban fonts.googleapis.com caían a la fuente del sistema (Roboto, más
// ancha) y desencajaban todo el layout.
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-bebas",
});
const barlowCondensed = Barlow_Condensed({
  weight: ["400", "600", "700", "800"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-barlow",
});
const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-inter",
});
const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--next-font-share-tech",
});

const fontClasses = `${bebasNeue.variable} ${barlowCondensed.variable} ${inter.variable} ${shareTechMono.variable}`;

export const metadata: Metadata = {
  title: "DINAMYT - Sistema de Competencias Hapkido",
  description: "Sistema profesional de gestion y puntuacion de competencias de Hapkido en tiempo real. Combate, Figuras y mas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: el script inline de abajo pone data-theme en
    // <html> antes de hidratar; sin esto React avisa de atributo distinto
    <html lang="es" className={fontClasses} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="theme-color" content="#050507" />
        {/* Aplicar el tema guardado ANTES del primer pintado: si esto corriera
            en un useEffect, cada carga en tema claro mostraría un flash oscuro.
            Oscuro es el defecto, así que solo hay que marcar el claro. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("dinamyt_theme")==="light"){document.documentElement.dataset.theme="light";document.querySelector(\'meta[name="theme-color"]\')?.setAttribute("content","#eef0f6")}}catch(e){}',
          }}
        />
        {/* PWA: instalable en escritorio y móvil */}
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Android arma la pantalla de carga con el icono MÁS GRANDE que logre
            descargar del manifiesto, y lo estira hasta el tamaño del splash
            (~512 px en un celular de densidad 4x). Declarar aquí el de 512
            además del manifiesto le deja una segunda fuente en alta
            resolución; si solo queda el de 192 —o peor, el favicon— lo que se
            ve es ese icono ampliado, o sea pixeleado.

            Ojo con `purpose: "maskable"`: nuestro escudo es transparente y con
            aire alrededor, no llena el cuadro de borde a borde. Declararlo
            maskable hace que Android lo pinte sobre un plato del color de
            fondo del manifiesto. Por eso el manifiesto solo trae los dos
            iconos `any`, igual que membresías. */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="application-name" content="DINAMYT" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DINAMYT" />
      </head>
      <body>
        <I18nProvider>
          {/* El menú va DENTRO del portero: con el mantenimiento puesto no
              tiene sentido ofrecer navegación a pantallas que no responden. */}
          <PorteroMantenimiento>
            <AppMenu />
            {children}
          </PorteroMantenimiento>
          {/* Avisos flotantes de "guardado" / "no se pudo". Fuera del portero
              y al final: se pinta en un portal sobre el <body>, así ningún
              contenedor de la página puede recortarlo. */}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
