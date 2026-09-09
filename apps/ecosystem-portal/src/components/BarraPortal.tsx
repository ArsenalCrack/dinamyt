'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { CampanaOrg } from '@/components/CampanaOrg';
import {
  cerrarSesion,
  decodificarToken,
  guardarAparienciaEnLaCuenta,
  miClubAPI,
  misOrganizacionesAPI,
  obtenerToken,
  type TokenPayload,
} from '@/lib/api';
import { IDIOMAS, useI18n, type ClaveTexto } from '@/lib/i18n';
import { alternarModo, getTema, temaEfectivo, type Tema } from '@/lib/tema';
import { esPublica } from '@/lib/rutas';
import { nombreRol } from '@/lib/roles';

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Un carácter técnico como ⏻ (U+23FB) casi ninguna fuente de Android lo trae, y
 * el botón rojo de cerrar sesión es el peor sitio de la pantalla para que a
 * alguien le quede la duda de qué hace. Es el mismo trazo que la barra de
 * Membresías y la de Campeonatos: la misma acción se dibuja igual en las cuatro.
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

/** Un enlace de la barra. `principal` = además se ve arriba en pantalla ancha. */
interface Enlace {
  href: string;
  clave: ClaveTexto;
  visible: boolean;
  principal: boolean;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA BARRA DEL PORTAL — la misma que Membresías, Campeonatos y Academy
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Lo que había, y por qué no bastaba ───────────────────────────────────────
 *
 * El portal era la única de las cuatro webs SIN barra. La cuenta colgaba de un
 * chip (`MenuCuenta`) metido dentro de la cabecera del panel, y eso traía tres
 * problemas a la vez:
 *
 *   · **El desplegable se salía.** El panel se anclaba al chip con `right: 0`,
 *     y el chip vivía dentro de la caja del contenido. En el teléfono, el
 *     desplegable quedaba pegado al borde derecho y buena parte no se veía.
 *   · **Le quitaba ancho al saludo**, que va en la tipografía de titular. Se
 *     había arreglado a medias bajando de cuatro controles a dos; el problema
 *     de fondo era que compartían fila con el nombre.
 *   · **No había navegación.** Desde «Mi organización» no se podía ir a «Mi
 *     club» sin volver al panel. En las otras tres webs eso lo resuelve la
 *     barra, y aquí no existía.
 *
 * ── Lo que hace ──────────────────────────────────────────────────────────────
 *
 * Marca a la izquierda, los enlaces del día a día en el centro y la identidad a
 * la derecha, con las clases `.navbar*` del archivo compartido — o sea que no es
 * «parecida» a la de Membresías: es la misma. El desplegable cuelga de la BARRA
 * y no del chip, así que ya no puede salirse: `max-width: calc(100vw - 1.5rem)`
 * lo mantiene dentro de la ventana pase lo que pase.
 *
 * ── Y aquí SÍ van el tema y el idioma ────────────────────────────────────────
 *
 * En Membresías y en Campeonatos están en este mismo menú, y el portal era el
 * único donde había que entrar a una pantalla para cambiarlos. Que exista
 * `/configuracion` no lo contradice: allí están las TRES opciones escritas
 * (claro, oscuro, como el sistema) más la hora, la contraseña y los
 * dispositivos; aquí está el interruptor de todos los días.
 *
 * ── Dónde NO sale ────────────────────────────────────────────────────────────
 *
 * En lo público: la portada, el login, el registro, la recuperación, los planes
 * y la privacidad. Ahí no hay sesión de la que enseñar nada, y para el tema y el
 * idioma está el globo flotante (`ControlesApariencia`).
 */
export function BarraPortal() {
  const { t, idioma, setIdioma } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const raiz = useRef<HTMLElement | null>(null);

  const [pase, setPase] = useState<TokenPayload | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  /** ¿Gestiona alguna organización? ¿Pertenece a algún club? `null` = aún no se sabe. */
  const [gestiona, setGestiona] = useState<boolean | null>(null);
  const [enClub, setEnClub] = useState<boolean | null>(null);
  /**
   * Quién es esta persona AQUÍ: su rol y su club.
   *
   * Debajo del nombre iba el CORREO, y un correo es una línea larga sin
   * espacios: en un panel de 250 px se comía dos renglones y empujaba todo lo
   * demás. Y además no dice nada que la persona no sepa. «Maestro · Club
   * Heredero Prueba» ocupa lo mismo que una línea y contesta la pregunta que
   * de verdad se hace al abrir el menú: en calidad de qué estoy entrando.
   *
   * Es lo que hace Membresías (`rolYClub` en su `NavBar`).
   */
  const [quien, setQuien] = useState<string | null>(null);
  // Arranca en `sistema` —igual que el servidor— y se sincroniza al montar: leer
  // la cookie en el render rompería la hidratación.
  const [tema, setTema] = useState<Tema>('sistema');

  /**
   * Las pantallas públicas no llevan barra. La lista vive en `lib/rutas.ts`
   * porque el globo 🌐 toma la decisión CONTRARIA con la misma lista: así o hay
   * barra o hay globo, y ninguna pantalla se queda sin las dos.
   */
  const publica = esPublica(pathname);

  useEffect(() => {
    const crudo = obtenerToken();
    setPase(crudo ? decodificarToken(crudo) : null);
  }, [pathname]);

  useEffect(() => {
    setTema(getTema());
  }, []);

  // Al navegar se cierra. Sin esto, volver atrás encuentra el menú abierto.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const cargar = useCallback(async () => {
    // Las dos deciden qué enlaces salen. Fallan sin romper nada: si no se
    // pueden pedir, la barra se queda con «Mis aplicaciones», que siempre vale.
    const [orgs, club] = await Promise.allSettled([
      misOrganizacionesAPI(),
      miClubAPI(),
    ]);
    setGestiona(orgs.status === 'fulfilled' && orgs.value.length > 0);
    setEnClub(club.status === 'fulfilled' && club.value.length > 0);

    // El rol sale de la organización que gestiona; si no gestiona ninguna, de
    // su club. El nombre del club es lo segundo, y solo si hay sitio: quien
    // pertenece a uno lo tiene delante todo el día, pero verlo confirma en cuál
    // de los dos clubes está la sesión.
    const rol =
      orgs.status === 'fulfilled' && orgs.value.length > 0
        ? orgs.value[0].myRole
        : null;
    const nombreClub =
      club.status === 'fulfilled' && club.value.length > 0 ? club.value[0].name : null;
    const partes = [rol ? nombreRol(rol) : null, nombreClub].filter(Boolean);
    setQuien(partes.length ? partes.join(' · ') : null);
  }, []);

  useEffect(() => {
    if (publica || !pase) return;
    void cargar();
  }, [publica, pase, cargar]);

  // La foto del chip. Se pide una vez por carga de página, no en cada ruta.
  useEffect(() => {
    if (publica || !pase) return;
    let vigente = true;
    void (async () => {
      try {
        const { default: api } = await import('@/lib/api');
        const res = await api.get(`/users/${pase.sub}/profile`);
        if (vigente) setFoto((res.data as { avatarUrl: string | null }).avatarUrl);
      } catch {
        /* sin foto se pintan las iniciales, que es el respaldo de `Avatar` */
      }
    })();
    return () => {
      vigente = false;
    };
  }, [publica, pase]);

  useEffect(() => {
    if (!abierto) return;
    /**
     * ¿Hay una foto abierta en grande encima de todo?
     *
     * El visor vive en un portal colgado del `<body>`, así que para estos
     * manejadores queda «fuera» de la barra. Sin la salvedad, el primer toque
     * dentro del visor cerraría el menú, y al cerrarse se desmontaría el avatar
     * que lo abrió y la foto desaparecería a media maniobra.
     */
    const conVisor = () => !!document.querySelector('.visor-imagen');
    function fuera(e: MouseEvent | TouchEvent) {
      if (conVisor()) return;
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
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

  /**
   * Que la PÁGINA sepa que hay barra.
   *
   * Las pantallas del portal traen su propio título grande, y con la barra
   * encima algunas repetían la marca dos veces. Es la misma marca en el `<body>`
   * que usa Campeonatos (`.solo-sin-barra` en el archivo compartido).
   */
  const visible = !publica && !!pase;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (visible) document.body.dataset.barra = 'si';
    else delete document.body.dataset.barra;
    return () => {
      delete document.body.dataset.barra;
    };
  }, [visible]);

  if (!visible || !pase) return null;

  function cambiarTema() {
    // La cuenta la hace `alternarModo` mirando el DOM y no este `tema`: el
    // estado arranca en `sistema` y se sincroniza en un efecto, así que una
    // pulsación temprana calcularía sobre un valor viejo y aplicaría el modo que
    // ya estaba. Se veía como «tuve que darle dos veces».
    const nuevo = alternarModo();
    setTema(nuevo);
    guardarAparienciaEnLaCuenta({ theme: nuevo });
  }

  function salir() {
    void cerrarSesion();
    setAbierto(false);
    router.replace('/login');
  }

  const nombre = pase.fullName || pase.email;
  const primerNombre = nombre.trim().split(/\s+/)[0];

  const enlaces: Enlace[] = [
    { href: '/dashboard', clave: 'menu.panel', visible: true, principal: true },
    {
      href: '/mi-organizacion',
      clave: 'menu.miOrganizacion',
      visible: gestiona === true,
      principal: true,
    },
    { href: '/mi-club', clave: 'menu.miClub', visible: enClub === true, principal: true },
    {
      href: '/admin',
      clave: 'menu.admin',
      visible: pase.is_super_admin,
      principal: false,
    },
  ];
  const visibles = enlaces.filter((l) => l.visible);

  const activo = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header ref={raiz} className="navbar">
      <div className="navbar-inner">
        {/* La marca lleva al panel. Es la vuelta a casa desde cualquier
            pantalla, y es lo que faltaba para no perderse entre paneles. */}
        <Link href="/dashboard" className="navbar-marca">
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="marca">
            DINAMYT<span className="marca-app">{t('menu.ecosistema')}</span>
          </span>
        </Link>

        <nav className="navbar-links" aria-label={t('menu.navegacion')}>
          {visibles
            .filter((l) => l.principal)
            .map((l) => (
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
          {/* La campana vive FUERA del menú, igual que en Membresías: un aviso
              que hay que abrir un menú para ver no avisa de nada. Y solo para
              quien lleva un club — a un alumno no le llega ninguno de estos, así
              que se dibujaría siempre vacía. */}
          {gestiona === true && <CampanaOrg />}

          <button
            type="button"
            className="navbar-toggle"
            aria-label={abierto ? t('menu.cerrar') : t('menu.abrir')}
            aria-expanded={abierto}
            aria-haspopup="menu"
            onClick={() => setAbierto((a) => !a)}
          >
            <Avatar src={foto} nombre={nombre} size={24} />
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
            {/* Ampliable aquí y no en el chip de arriba: el chip ES el botón que
                abre el menú, y un botón dentro de otro no es HTML válido. */}
            <Avatar src={foto} nombre={nombre} size={38} ampliable />
            <span className="navbar-panel-datos">
              <b>{nombre}</b>
              {/* El super administrador manda sobre todo lo demás: no tiene
                  club y su rol no sale de ninguna organización. Y si todavía no
                  se sabe el rol —o la persona no tiene ni club ni organización—
                  se cae al correo, que es lo único que siempre hay. */}
              <span>
                {pase.is_super_admin
                  ? t('menu.superAdmin')
                  : (quien ?? pase.email)}
              </span>
            </span>
          </div>

          {/* Todos los enlaces, no solo los que faltan: en el teléfono el menú
              es la única navegación que hay. En el monitor, los que ya se ven
              arriba se ocultan por CSS (`data-principal`). */}
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

          <Link href="/perfil" role="menuitem" className="navbar-item">
            {t('menu.perfil')}
          </Link>
          <Link href="/configuracion" role="menuitem" className="navbar-item">
            {t('config.titulo')}
          </Link>

          {/* ── El tema y el idioma, aquí como en las otras tres ──────────
              El portal era el único donde había que ENTRAR a una pantalla para
              cambiar el modo. Las tres opciones escritas siguen estando en
              Configuración, junto a la hora y los dispositivos; esto es el
              interruptor de todos los días. */}
          <div className="navbar-sep" />
          <button type="button" role="menuitem" className="navbar-item" onClick={cambiarTema}>
            {temaEfectivo(tema) === 'oscuro' ? t('menu.modoClaro') : t('menu.modoOscuro')}
          </button>

          <p className="navbar-etiqueta">{t('menu.idioma')}</p>
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

          {/* ── Por qué «Salir» lleva aire por encima ──
              Es la única acción destructiva del menú, y equivocarse cuesta
              volver a escribir la contraseña. Pegado a lo de arriba, al pasar el
              ratón los dos fondos se tocaban y parecían un solo bloque. */}
          <div className="navbar-sep" />
          <button
            type="button"
            onClick={salir}
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '0.45rem' }}
          >
            <IconoSalir />
            {t('menu.salir')}
          </button>
        </div>
      )}
    </header>
  );
}
