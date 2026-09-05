'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { claveRol, useAuth } from '@/lib/auth';
import { IDIOMAS, useI18n, type ClaveTexto } from '@/lib/i18n';
import { aplicarTema, getTema, temaEfectivo, type Tema } from '@/lib/theme';
import { guardarAparienciaEnLaCuenta } from '@/lib/api';
import { Avatar } from './Avatar';
import { Avisos } from './Avisos';

const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

/**
 * Barra de navegación.
 *
 * **Qué se ve arriba y qué no.** Antes subían a la barra los ocho enlaces del
 * rol y, al lado, el nombre del maestro con su club: en un portátil normal eso
 * llegaba al borde y el nombre se apretaba contra los enlaces. Ahora arriba
 * quedan solo los enlaces del día a día (`principal`) y el resto vive en el
 * menú, que es donde se busca lo que se usa una vez por semana.
 *
 * **Dónde está el nombre.** En el botón del menú, como un chip con la foto y el
 * nombre de pila, y completo —nombre, rol y club— dentro del panel. Un nombre
 * largo o el club «Academia de Artes Marciales del Norte» ya no tienen que
 * caber en un hueco de la barra: se recortan con puntos suspensivos en el chip
 * y se leen enteros al abrir.
 *
 * El panel se cierra como se espera: al elegir algo, al tocar fuera, con Escape
 * y al cambiar de página.
 */

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Antes era el carácter ⏻ (U+23FB). No es un emoji: es un símbolo técnico que
 * casi ninguna fuente de Android trae, así que en el Chrome del celular el
 * botón salía con un hueco —o con el cuadrito de «glifo que no tengo»— delante
 * del texto. Un SVG se ve igual en todos lados y hereda el color del botón,
 * que en este caso es el rojo de acción destructiva.
 */
function IconoSalir() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2.8v9.4" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

/**
 * La cuadrícula de aplicaciones, dibujada y no escrita.
 *
 * Por lo mismo que el de salir: los símbolos técnicos que parecen iconos
 * (⇱, ⊞, ⏻) no están en las fuentes de Android y salen como el cuadrito de
 * «glifo que no tengo». Un SVG se ve igual en todos lados y hereda el color.
 *
 * Es el MISMO dibujo en Membresías, Campeonatos y Academy: la puerta al
 * ecosistema se reconoce por su forma antes que por su texto.
 */
function IconoEcosistema() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

interface Enlace {
  href: string;
  clave: ClaveTexto;
  visible: boolean;
  /** Del día a día: se gana un sitio en la barra. El resto va al menú. */
  principal: boolean;
}

export function NavBar() {
  const pathname = usePathname();
  const { t, idioma, setIdioma } = useI18n();
  const { user, club, logout, esStaff, esSuper } = useAuth();
  const [abierto, setAbierto] = useState(false);
  // Se arranca en 'dark', igual que el servidor, y se corrige tras montar: el
  // tema real vive en localStorage y leerlo aquí rompería la hidratación.
  const [tema, setTema] = useState<Tema>('sistema');
  const raizRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTema(getTema());
  }, []);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    /**
     * ¿Hay una foto abierta en grande encima de todo?
     *
     * El visor vive en un portal colgado del `<body>` (ver `VisorImagen`), así
     * que para estos dos manejadores queda «fuera» de la barra. Sin esta
     * salvedad, el primer toque dentro del visor —el botón de cerrar, un
     * arrastre, un pellizco— cerraba el menú, y al cerrarse se desmontaba el
     * avatar que lo había abierto y la foto desaparecía a media maniobra. Lo
     * mismo con Escape: cerraba las dos cosas de golpe cuando lo que se quería
     * era salir solo de la foto.
     */
    const conVisor = () => !!document.querySelector('.visor-imagen');

    function fuera(e: MouseEvent | TouchEvent) {
      if (conVisor()) return;
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !conVisor()) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  // La única pantalla sin barra es el login: todavía no hay sesión ni sitio a
  // donde navegar. El kiosco SÍ la lleva desde ahora — se abre en la puerta del
  // salón, sí, pero de allí se sale igual que de cualquier otra pantalla, y
  // tenerla escondida obligaba a mantener aquí dentro un enlace de vuelta y un
  // par de controles duplicados.
  if (pathname === '/login') return null;
  if (!user) return null;

  // El orden es el de la barra. `principal` marca lo que se abre a diario: el
  // panel, el roster, la asistencia y el kiosco de la puerta. Planes,
  // calendario y estadísticas se tocan al empezar el mes.
  //
  // ── Por qué el super-admin NO ve las pantallas de club ──
  //
  // `esStaff` lo incluye —maestro, auxiliar o super-admin— y por eso le salían
  // las siete: panel, alumnos, asistencia, kiosco, estadísticas, planes y
  // calendario. **Ninguna le sirve**: todas operan sobre `req.user.org_id`, y
  // el super-admin no pertenece a ningún club, así que las abría vacías.
  //
  // La API sí sabe operar un club concreto (`?orgId=`), pero esta web no tiene
  // selector que lo use. El día que lo tenga, esto vuelve a abrirse **con un
  // club elegido** y no antes: un menú de siete pantallas que no se pueden
  // llenar es peor que no tenerlas.
  //
  // Se cambia SOLO la navegación. El guardián de cada página sigue mirando
  // `esStaff`, así que si llega ahí por un enlace directo no se rompe nada — y
  // el día del selector no hay que volver a tocar siete archivos.
  const gestionaUnClub = esStaff && !esSuper;
  const links: Enlace[] = [
    { href: '/admin', clave: 'menu.admin', visible: esSuper, principal: true },
    { href: '/', clave: 'menu.panel', visible: gestionaUnClub, principal: true },
    { href: '/alumnos', clave: 'menu.alumnos', visible: gestionaUnClub, principal: true },
    { href: '/asistencia', clave: 'menu.asistencia', visible: gestionaUnClub, principal: true },
    { href: '/kiosco', clave: 'menu.kiosco', visible: gestionaUnClub, principal: true },
    { href: '/estadisticas', clave: 'menu.estadisticas', visible: gestionaUnClub, principal: false },
    { href: '/planes', clave: 'menu.planes', visible: gestionaUnClub, principal: false },
    { href: '/calendario', clave: 'menu.calendario', visible: gestionaUnClub, principal: false },
    { href: '/mi', clave: 'menu.miEstado', visible: !esSuper, principal: true },
  ];
  const visibles = links.filter((l) => l.visible);
  const enLaBarra = visibles.filter((l) => l.principal);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  /** El nombre de pila: es lo que cabe en el chip sin apretar nada. */
  const nombre = user.fullName || user.email;
  const primerNombre = nombre.split(' ')[0];
  const rolYClub = `${t(claveRol(user))}${club ? ` · ${club.name}` : ''}`;

  function alternarTema() {
    // Dos estados en el botón, no tres: `sistema` es un punto de partida, no un
    // destino al que alguien quiera volver pulsando. Las tres opciones escritas
    // están en el perfil del portal, que es donde se elige de verdad.
    const nuevo: Tema = temaEfectivo(tema) === 'claro' ? 'oscuro' : 'claro';
    aplicarTema(nuevo);
    setTema(nuevo);
    // Y a la CUENTA, para que la elección valga también en el portal, en
    // Campeonatos y en Academy. `localStorage` no cruza subdominios.
    guardarAparienciaEnLaCuenta({ theme: nuevo });
  }

  /**
   * Salir de verdad, de una sola vez, y de las DOS sesiones.
   *
   * Se espera al logout antes de navegar: la cookie de sesión la borra el
   * servidor, y si se cambia de página antes el navegador puede cancelar la
   * petición y dejar la sesión viva en la API.
   *
   * ── Por qué hay que ir hasta el portal ──
   *
   * Quien entra por DINAMYT tiene DOS sesiones: la de aquí (cookie de este
   * dominio) y la del portal (su dominio, que ningún navegador deja tocar desde
   * fuera). Cerrando solo la de aquí, el portal seguía reconociendo a la
   * persona: al pulsar «entrar con DINAMYT» devolvía un pase nuevo al instante,
   * sin preguntar nada ni enseñar una sola pantalla. Salir y aparecer dentro
   * otra vez — que es exactamente como se ve un botón de salir roto, aunque el
   * de aquí hubiera hecho su trabajo.
   *
   * ── Por qué ya no se pregunta «¿viniste del portal?» ──
   *
   * **Ahí estaba el bug de las dos pulsaciones.** Esa pregunta se respondía con
   * una marca en el `localStorage` de esta app, y la marca se perdía sola: la
   * borraba cualquier 401, y no llegaba a existir si se había entrado con
   * contraseña aunque hubiera sesión del portal abierta en el mismo navegador.
   * Sin marca no se pasaba por el portal, la sesión de DINAMYT quedaba viva, y
   * el siguiente «entrar con DINAMYT» metía a la persona dentro sin enseñarle
   * nada. Solo a la SEGUNDA se salía del todo, porque esa reentrada sí había
   * dejado la marca puesta.
   *
   * Ahora no hay pregunta que fallar: si esta instalación está federada —lo
   * dice el servidor al cerrar, no una marca del navegador— se pasa por el
   * portal SIEMPRE. `/salir` allí no pide nada, no pregunta nada y funciona
   * igual si no había sesión que cerrar: cuesta una redirección y quita la
   * clase entera de fallos.
   *
   * ── Por qué se vuelve a `/login?salida=1` ──
   *
   * Porque `/login` a secas mete dentro a quien tenga sesión, y aterrizar ahí
   * después de salir es pedirle a la pantalla que deshaga lo que se acaba de
   * hacer. Con `?salida=1` esa puerta se cierra y, si algo quedó vivo, se
   * remata allí. Ver `app/login/page.tsx`.
   *
   * ── Por qué se sale con `location` y no con el router ──
   *
   * Salir es el único momento en que una recarga entera es exactamente lo que
   * se quiere: no queda ni un dato del anterior en memoria, ni una pantalla a
   * medio pintar, ni un estado de React con su nombre. Y de paso no depende de
   * que el router esté sano — que es justo lo que falló tres veces seguidas
   * aquí, siempre con el mismo disfraz: «pulso Salir y no pasa nada».
   */
  async function salir() {
    const salida = await logout();
    setAbierto(false);

    // `portal` viene del servidor. Si no contestó, se cae a lo único que se
    // sabe sin él: que este despliegue tiene portal configurado. Pasar de más
    // solo cuesta una redirección; pasar de menos deja media sesión abierta.
    const hayPortal = (salida.portal ?? true) && Boolean(PORTAL_URL);

    // El valor dice de CUÁNTAS sesiones se salió, y de eso depende la frase que
    // se lee al aterrizar: en el club que usa Membresías por su cuenta no hay
    // ningún DINAMYT del que salir, y prometérselo sería mentir. Viaja en la
    // dirección y no se consulta al llegar porque aquí ya se sabe, y preguntarlo
    // otra vez haría que la frase cambiara delante de quien la está leyendo.
    const vuelta = `${window.location.origin}/login?salida=${
      hayPortal ? 'portal' : 'sola'
    }`;

    window.location.href = hayPortal
      ? `${PORTAL_URL}/salir?redirect=${encodeURIComponent(vuelta)}`
      : '/login?salida=sola';
  }

  return (
    <header ref={raizRef} className="navbar">
      <div className="navbar-inner">
        <Link
          href={esSuper ? '/admin' : esStaff ? '/' : '/mi'}
          className="navbar-marca"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display">{t('app.nombre')}</span>
        </Link>

        <nav className="navbar-links" aria-label={t('menu.navegacion')}>
          {enLaBarra.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="navbar-link"
              data-activo={activo(l.href)}
            >
              {t(l.clave)}
            </Link>
          ))}
        </nav>

        <div className="navbar-derecha">
          {/* La campana vive en la barra: los avisos importan en cualquier
              pantalla, no solo en la que los estrenó. */}
          {!esSuper && <Avisos deTodoElClub={esStaff} />}

          {/* El botón del menú ES la identidad: foto, nombre de pila y las tres
              rayas. Así el nombre tiene su propio sitio en vez de disputárselo
              a los enlaces. */}
          <button
            type="button"
            className="navbar-toggle"
            aria-label={abierto ? t('menu.cerrar') : t('menu.abrir')}
            aria-expanded={abierto}
            aria-haspopup="menu"
            onClick={() => setAbierto((a) => !a)}
          >
            <Avatar src={user.avatarUrl} nombre={nombre} size={24} />
            <span className="navbar-toggle-nombre">{primerNombre}</span>
            <span className="navbar-rayas" data-abierto={abierto} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {abierto && (
        <div className="navbar-panel" role="menu">
          <div className="navbar-panel-quien">
            {/* Ampliable aquí y no en el chip de arriba: el chip ES el botón
                que abre el menú, y un botón dentro de otro botón no es HTML
                válido —el navegador desarma el anidado y el toque se vuelve
                una lotería—. Dentro del panel la foto ya no compite con nada. */}
            <Avatar src={user.avatarUrl} nombre={nombre} size={38} ampliable />
            <span className="navbar-panel-datos">
              <b>{nombre}</b>
              <span>{rolYClub}</span>
            </span>
          </div>

          {/* Todos los enlaces, no solo los que faltan: en móvil el menú es la
              única navegación que hay. En PC, los que ya se ven arriba se
              ocultan por CSS, y si no queda ninguno se va el bloque entero
              (`data-solo-principales`). */}
          <div
            className="navbar-panel-nav"
            data-solo-principales={visibles.every((l) => l.principal)}
          >
            <p className="navbar-etiqueta">{t('menu.navegacion')}</p>
            <div className="navbar-panel-links">
              {visibles.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  className="navbar-item"
                  data-activo={activo(l.href)}
                  data-principal={l.principal}
                >
                  {t(l.clave)}
                </Link>
              ))}
            </div>
            <div className="navbar-sep" />
          </div>

          <button type="button" role="menuitem" className="navbar-item" onClick={alternarTema}>
            {temaEfectivo(tema) === 'oscuro' ? t('menu.modoClaro') : t('menu.modoOscuro')}
          </button>

          <p className="navbar-etiqueta">🌐 {t('menu.idioma')}</p>
          <div className="navbar-idiomas" role="group" aria-label={t('menu.idioma')}>
            {IDIOMAS.map((l) => (
              <button
                key={l.codigo}
                type="button"
                className="navbar-idioma"
                data-activo={idioma === l.codigo}
                aria-pressed={idioma === l.codigo}
                onClick={() => {
                  setIdioma(l.codigo);
                  guardarAparienciaEnLaCuenta({
                    locale: l.codigo === 'en' ? 'en-US' : 'es-CO',
                  });
                }}
              >
                {l.etiqueta}
              </button>
            ))}
          </div>

          <div className="navbar-sep" />

          {/**
            * La puerta de vuelta al ecosistema.
            *
            * ── El agujero que tapa ──
            *
            * Desde DINAMYT se entraba aquí con un botón, pero de aquí no se
            * volvía: el único enlace al portal era el de editar la ficha
            * (`/mi` → `PORTAL/perfil`), escondido dentro de una pantalla que
            * casi nadie abre para eso. Quien quería su cuenta, su club o sus
            * otras aplicaciones tenía que escribir la dirección a mano, abrir
            * otra pestaña o —lo que hacía todo el mundo— cerrar sesión. Salir
            * de una app no puede ser la forma de llegar a la de al lado.
            *
            * ── Por qué NO lleva `?redirect=` ──
            *
            * Porque ir a DINAMYT significa ir a DINAMYT. Ese parámetro es el
            * que le dice al portal «cuando acabes, devuélvelo aquí», y es
            * justo el que se quedaba pegado en el historial del navegador y
            * acababa metiendo en Membresías a quien quería el portal. Aquí no
            * pinta nada: el destino es el dashboard, y punto.
            *
            * ── Por qué en el menú y no en la barra de arriba ──
            *
            * La barra es de las pantallas de ESTA app. Abajo del todo, junto a
            * «Salir», están las dos cosas que te sacan de aquí — y es donde se
            * busca lo que se usa una vez al día, no una vez por minuto.
            */}
          {PORTAL_URL && (
            <a
              href={`${PORTAL_URL}/dashboard`}
              role="menuitem"
              className="navbar-item"
              title={t('menu.ecosistemaTitulo')}
            >
              <IconoEcosistema />
              {t('menu.ecosistema')}
            </a>
          )}

          {/* ── Por qué este botón lleva aire por encima ──
              «Ir a DINAMYT» y «Salir» hacen lo mismo desde lejos —los dos te
              sacan de aquí— pero uno te lleva a tu portal y el otro te cierra
              la sesión, y equivocarse cuesta volver a escribir la contraseña.
              Pegados, al pasar el ratón los dos fondos se tocaban y parecían un
              solo bloque. Medio rem no es decoración: es el margen de un dedo
              en un teléfono. */}
          <button
            onClick={salir}
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: '0.5rem' }}
          >
            <IconoSalir />
            {t('menu.salir')}
          </button>
        </div>
      )}
    </header>
  );
}
