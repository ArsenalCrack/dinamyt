'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { aplicarTema, getTema, temaEfectivo, type Tema } from '@/lib/tema';
import { IDIOMAS, useI18n } from '@/lib/i18n';
import { guardarAparienciaEnLaCuenta } from '@/lib/api';

/**
 * El globo 🌐 de tema e idioma, para las pantallas SIN navegación.
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 *
 * El tema y el idioma se eligen en `/configuracion`, y a `/configuracion` solo
 * se llega desde el panel — o sea, **habiendo entrado**. Así que la portada del
 * portal, el login, el registro y la recuperación de contraseña no tenían
 * ninguna forma de cambiar el modo: quien prefiere el claro y todavía no ha
 * entrado —o no tiene cuenta— se come el oscuro sin remedio, en la primera
 * pantalla que ve de DINAMYT.
 *
 * Campeonatos ya resolvía esto para su marcador público con este mismo botón.
 * Ahora es el mismo control, con las mismas medidas: `.pubctl*` vive en
 * `packages/shared/estilos.css`, o sea que es un solo archivo para las cuatro
 * webs.
 *
 * ── Dónde NO sale ──────────────────────────────────────────────────────────
 *
 * En las pantallas de dentro. Ahí ya hay un botón de «Configuración» en la
 * cabecera, y un flotante encima sería un segundo sitio para lo mismo — que es
 * exactamente lo que se acaba de quitar del perfil.
 *
 * ── Y sí escribe en la cuenta ──────────────────────────────────────────────
 *
 * Cuando hay sesión. Sin ella se queda en la cookie compartida, que es lo que
 * hace falta para que la elección viaje a las otras tres webs de este navegador
 * (ver `lib/tema.ts`); en cuanto la persona entre, `AplicarApariencia` no la
 * pisará porque la cookie manda sobre la cuenta.
 */
export function ControlesApariencia() {
  const { t, idioma, setIdioma } = useI18n();
  const pathname = usePathname();
  const [tema, setTema] = useState<Tema>('sistema');
  const [abierto, setAbierto] = useState(false);

  // El servidor pinta siempre el oscuro; el de verdad se lee tras montar.
  useEffect(() => {
    setTema(getTema());
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alTocar = (e: MouseEvent | TouchEvent) => {
      const raiz = document.querySelector('.pubctl');
      if (raiz && !raiz.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alTocar);
    document.addEventListener('touchstart', alTocar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alTocar);
      document.removeEventListener('touchstart', alTocar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  /**
   * Las pantallas de dentro, que ya tienen su botón de Configuración.
   *
   * Se listan las que lo llevan en vez de las públicas: una pantalla nueva del
   * área privada nace sin cabecera propia hasta que alguien se la pone, y es
   * mejor que le sobre el globo a que a una pública le falte.
   */
  const conNavegacion = [
    '/dashboard',
    '/perfil',
    '/configuracion',
    '/mi-club',
    '/mi-organizacion',
    '/admin',
  ].some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (conNavegacion) return null;

  function cambiarTema() {
    // Dos estados y no tres: `sistema` es un punto de partida, no un destino al
    // que alguien quiera volver pulsando. Las tres escritas están en
    // Configuración, que es donde se elige de verdad.
    const nuevo: Tema = temaEfectivo(tema) === 'claro' ? 'oscuro' : 'claro';
    aplicarTema(nuevo);
    setTema(nuevo);
    void guardarAparienciaEnLaCuenta({ theme: nuevo });
  }

  return (
    <div className="pubctl">
      {abierto && (
        <div className="pubctl-panel" role="group" aria-label={t('menu.apariencia')}>
          <button type="button" className="pubctl-item" onClick={cambiarTema}>
            {temaEfectivo(tema) === 'oscuro' ? t('menu.modoClaro') : t('menu.modoOscuro')}
          </button>
          <div className="pubctl-langs">
            {IDIOMAS.map((l) => (
              <button
                key={l.codigo}
                type="button"
                className="pubctl-lang"
                data-activo={idioma === l.codigo}
                aria-pressed={idioma === l.codigo}
                onClick={() => {
                  setIdioma(l.codigo);
                  void guardarAparienciaEnLaCuenta({
                    locale: l.codigo === 'en' ? 'en-US' : 'es-CO',
                  });
                }}
              >
                {l.etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="pubctl-toggle"
        aria-label={t('menu.apariencia')}
        aria-expanded={abierto}
        title={t('menu.apariencia')}
        onClick={() => setAbierto((a) => !a)}
      >
        🌐
      </button>
    </div>
  );
}
