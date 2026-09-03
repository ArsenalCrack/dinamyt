'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  cerrarSesion,
  obtenerToken,
  getNotificacionesAPI,
  marcarLeidasAPI,
  getMeAPI,
  type Notificacion,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import {
  getSesion,
  getRolEfectivo,
  limpiarRolCache,
  etiquetaRol,
  type Sesion,
} from '@/lib/session';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Antes era el carácter ⏻ (U+23FB): no es un emoji, es un símbolo técnico que
 * casi ninguna fuente de Android trae, así que en el celular el botón salía
 * con el cuadrito de «glifo que no tengo» delante del texto. Un SVG se ve
 * igual en todos lados y hereda el color del botón. Es el mismo trazo que el
 * de Membresías y el del portal, a propósito.
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
 * Aquí ponía «⇱ Mis aplicaciones», y ese ⇱ (U+21F1) es exactamente el mismo
 * error que el ⏻ de arriba: un símbolo técnico que casi ninguna fuente de
 * Android trae, así que en el celular el botón salía con el cuadrito de
 * «glifo que no tengo» delante del texto. Un SVG se ve igual en todos lados y
 * hereda el color.
 *
 * Es el MISMO dibujo en Academy, Membresías y Campeonatos: la puerta al
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

/**
 * Barra de navegación de Academy: enlaces por rol efectivo (la API decide),
 * «Mis aplicaciones» como salida al ecosistema y «Salir» SIEMPRE diferenciado.
 * En móvil todo vive en el menú de hamburguesa.
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [campana, setCampana] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);
  const [miFoto, setMiFoto] = useState<string | null>(null);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra el menú móvil
    setCampana(false);
    setMasAbierto(false);
    const s = obtenerToken() ? getSesion() : null;
    setSesion(s);
    if (s) {
      void getRolEfectivo().then(setRol);
      void getMeAPI()
        .then((me) => setMiFoto(me.usuario.avatarUrl ?? null))
        .catch(() => undefined);
      getNotificacionesAPI()
        .then((r) => {
          setNotifs(r.notificaciones);
          setNoLeidas(r.noLeidas);
        })
        .catch(() => undefined);
    }
  }, [pathname]);

  async function abrirCampana() {
    const abrir = !campana;
    setCampana(abrir);
    if (abrir && noLeidas > 0) {
      try {
        await marcarLeidasAPI();
        setNoLeidas(0);
      } catch {
        /* best-effort */
      }
    }
  }

  if (pathname === '/login') return null;
  if (!sesion) return null;

  const esMaestro = rol === 'teacher' || rol === 'admin';
  const esAdmin = rol === 'admin';
  // La barra muestra POCOS enlaces primarios según el rol; el resto vive en el
  // menú «Más ▾» (escritorio) o en la hamburguesa (móvil): nadie se pierde.
  const links: { href: string; etiqueta: string; visible: boolean; primario: boolean }[] = [
    { href: '/tablero', etiqueta: 'Tablero', visible: true, primario: true },
    { href: '/maestro', etiqueta: 'Panel del maestro', visible: esMaestro, primario: true },
    { href: '/admin', etiqueta: 'Administración', visible: esAdmin, primario: true },
    { href: '/aprender', etiqueta: 'Aprender', visible: true, primario: !esMaestro },
    { href: '/evaluaciones', etiqueta: 'Evaluaciones', visible: true, primario: !esMaestro },
    { href: '/figuras', etiqueta: 'Figuras', visible: true, primario: false },
    { href: '/notas', etiqueta: 'Mis notas', visible: true, primario: false },
    { href: '/calendario', etiqueta: 'Calendario', visible: true, primario: false },
    { href: '/progreso', etiqueta: 'Mi progreso', visible: true, primario: false },
  ];
  const visibles = links.filter((l) => l.visible);
  const primarios = visibles.filter((l) => l.primario);
  const secundarios = visibles.filter((l) => !l.primario);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const itemNav = (l: (typeof links)[number], enMenu = false) => (
    <Link
      key={l.href}
      href={l.href}
      className={enMenu ? 'block' : ''}
      style={{
        borderRadius: '0.5rem',
        padding: '0.45rem 0.7rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        display: enMenu ? 'block' : undefined,
        ...(activo(l.href)
          ? { background: 'var(--bg-elevated, rgba(255,255,255,0.06))', color: 'var(--gold)' }
          : { color: 'var(--text-muted)' }),
      }}
    >
      {l.etiqueta}
    </Link>
  );

  /**
   * La puerta de vuelta al ecosistema. Va al dashboard **sin `?redirect=`** a
   * propósito: ese parámetro le dice al portal «cuando acabes, devuélvelo
   * aquí», y es justo el que se quedaba pegado en el historial del navegador y
   * acababa metiendo en la app equivocada a quien quería el portal. Ir a
   * DINAMYT significa ir a DINAMYT.
   *
   * El texto es el mismo en las tres apps federadas, y en las tres vive en el
   * mismo sitio del menú: pegado a «Salir», que es la otra cosa que te saca de
   * aquí.
   */
  const linkApps = (enMenu = false) => (
    <a
      href={`${PORTAL_URL}/dashboard`}
      className={enMenu ? 'btn btn-outline' : 'btn btn-outline btn-sm'}
      title="Tu cuenta, tu club y todas tus aplicaciones"
      // El espacio con «Salir» lo pone ahora el contenedor de los dos, para que
      // sea UNA distancia y no la suma de dos márgenes que hay que calcular.
    >
      <IconoEcosistema /> Ir a DINAMYT
    </a>
  );

  function salir() {
    // `void`: el pase local se borra dentro de `cerrarSesion` ANTES de salir a
    // la red, así que la pantalla puede cambiar ya. Esperar a que el ecosystem
    // conteste solo conseguiría que «salir» se quedara colgado cuando la API
    // está lenta.
    void cerrarSesion();
    limpiarRolCache();
    setSesion(null);
    setAbierto(false);
    router.replace('/login');
  }

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.6rem 1rem',
        }}
      >
        <Link
          href="/"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display" style={{ fontSize: '1rem', whiteSpace: 'nowrap' }}>
            Academy
          </span>
        </Link>

        <nav
          className="nav-desktop"
          style={{ flex: 1, alignItems: 'center', gap: '0.15rem', flexWrap: 'nowrap' }}
        >
          {primarios.map((l) => itemNav(l))}
          {secundarios.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMasAbierto(!masAbierto)}
                className="btn btn-outline btn-sm"
                aria-expanded={masAbierto}
                style={{
                  border: 'none',
                  color: secundarios.some((l) => activo(l.href))
                    ? 'var(--gold)'
                    : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Más ▾
              </button>
              {masAbierto && (
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    minWidth: 180,
                    padding: '0.4rem',
                    zIndex: 40,
                    display: 'grid',
                    gap: '0.15rem',
                  }}
                >
                  {secundarios.map((l) => itemNav(l, true))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Campana de notificaciones (todas las pantallas) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => void abrirCampana()}
              className="btn btn-outline btn-sm"
              aria-label="Notificaciones"
              title="Notificaciones"
            >
              🔔
              {noLeidas > 0 && (
                <span
                  className="mono"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: 'var(--danger)',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '0.05rem 0.35rem',
                  }}
                >
                  {noLeidas > 9 ? '9+' : noLeidas}
                </span>
              )}
            </button>
            {campana && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: 'min(340px, 86vw)',
                  maxHeight: 380,
                  overflowY: 'auto',
                  padding: '0.5rem',
                  zIndex: 40,
                }}
              >
                {notifs.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
                    Sin notificaciones todavía.
                  </p>
                ) : (
                  notifs.map((n) => (
                    <Link
                      key={n.id}
                      href={n.link ?? '/tablero'}
                      onClick={() => setCampana(false)}
                      style={{
                        display: 'block',
                        padding: '0.5rem 0.6rem',
                        borderRadius: '0.4rem',
                        background: n.readAt ? 'transparent' : 'var(--gold-soft)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="muted" style={{ fontSize: '0.75rem', display: 'block' }}>
                          {n.body}
                        </span>
                      )}
                      <span className="muted mono" style={{ fontSize: '0.65rem' }}>
                        {new Date(n.createdAt).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="nav-user" style={{ alignItems: 'center', gap: '0.5rem' }}>
            <Avatar src={miFoto} nombre={sesion.fullName || sesion.email} size={32} />
            <span className="muted" style={{ fontSize: '0.72rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                {sesion.fullName || sesion.email}
              </span>
              <span style={{ color: 'var(--gold)' }}>
                {etiquetaRol(rol, sesion.isSuperAdmin)}
              </span>
            </span>
            {linkApps()}
            {/* Salir se distingue del resto: única acción destructiva */}
            <button
              onClick={salir}
              className="btn btn-danger btn-sm"
              title="Cerrar sesión"
              style={{ whiteSpace: 'nowrap' }}
            >
              <IconoSalir /> Salir
            </button>
          </div>

          <button
            onClick={() => setAbierto(!abierto)}
            className="nav-burger btn btn-outline btn-sm"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
          >
            {abierto ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {abierto && (
        <nav
          className="nav-movil"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            padding: '0.75rem 1rem',
          }}
        >
          <p className="muted" style={{ fontSize: '0.72rem', padding: '0 0.75rem 0.5rem' }}>
            {sesion.fullName || sesion.email} ·{' '}
            <span style={{ color: 'var(--gold)' }}>
              {etiquetaRol(rol, sesion.isSuperAdmin)}
            </span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {visibles.map((l) => itemNav(l, true))}
            <div style={{ height: 1, background: 'var(--border)', margin: '0.5rem 0' }} />
            {/* ── Los dos que te sacan de aquí, y por qué se separan MÁS ──
                Van juntos porque hacen lo mismo desde lejos: salir de esta
                aplicación. Pero uno te lleva a tu portal y el otro te cierra la
                sesión, y equivocarse cuesta volver a escribir la contraseña.
                Con los 0,25rem de antes, al pasar el ratón los dos recuadros
                de foco casi se tocaban y parecían un solo bloque. Medio rem no
                es decoración: es el margen de un dedo en un teléfono. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {linkApps(true)}
              <button onClick={salir} className="btn btn-danger">
                <IconoSalir /> Salir
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
