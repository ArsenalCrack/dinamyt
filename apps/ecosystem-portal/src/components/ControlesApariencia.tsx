'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { aplicarTema, getTema, temaEfectivo } from '@/lib/tema';
import { IDIOMAS, useI18n } from '@/lib/i18n';
import { guardarAparienciaEnLaCuenta } from '@/lib/api';
import { tieneBarra } from '@/lib/rutas';

/**
 * El tema y el idioma, en el pie de las pantallas SIN navegación.
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
 * ── Por qué en el pie y no flotando ────────────────────────────────────────
 *
 * Fue un botón 🌐 fijo abajo a la derecha (el `.pubctl` de Campeonatos), y en
 * un teléfono de 390 px tapaba lo que pasara por debajo: el borde del campo
 * «Teléfono» del registro, una tarjeta de `/planes`, la última letra del
 * marcador de la portada (auditoría 003, nº 1). En el pie no tapa nada, y son
 * dos selectores a la vista en vez de un menú que hay que descubrir: el pie es
 * además donde la gente busca el idioma. DESIGN.md, «Componentes».
 *
 * ── Dónde NO sale ──────────────────────────────────────────────────────────
 *
 * En las pantallas de dentro: ahí el menú de la cuenta ya trae el tema y el
 * idioma, y un segundo sitio para lo mismo sobra.
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
  // El tema que SE VE, y solo después de montar. En el servidor no hay
  // `matchMedia`, así que «como el sistema» salía siempre «oscuro» en el HTML;
  // al hidratar, React no corrige un atributo distinto y el selector se
  // quedaba marcando «Oscuro» con la página en claro. Hasta montar no se marca
  // ninguno.
  const [efectivo, setEfectivo] = useState<'claro' | 'oscuro' | null>(null);

  useEffect(() => {
    setEfectivo(temaEfectivo(getTema()));
  }, []);

  if (tieneBarra(pathname)) return null;

  function ponerTema(nuevo: 'claro' | 'oscuro') {
    aplicarTema(nuevo);
    setEfectivo(nuevo);
    void guardarAparienciaEnLaCuenta({ theme: nuevo });
  }

  return (
    <div className="pie-apariencia">
      <div className="pie-opciones" role="group" aria-label={t('perfil.tema')}>
        {(['oscuro', 'claro'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            className="pie-opcion"
            aria-pressed={efectivo === valor}
            onClick={() => ponerTema(valor)}
          >
            {t(valor === 'oscuro' ? 'perfil.temaOscuro' : 'perfil.temaClaro')}
          </button>
        ))}
      </div>
      <div className="pie-opciones" role="group" aria-label={t('menu.idioma')}>
        {IDIOMAS.map((l) => (
          <button
            key={l.codigo}
            type="button"
            className="pie-opcion"
            lang={l.codigo}
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
  );
}
