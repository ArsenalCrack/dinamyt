"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { aplicarTema, getTema, type Tema } from "@/lib/theme";
import { IDIOMAS, useI18n } from "@/lib/i18n";

interface SesionUser {
  nombre?: string;
  rol?: "admin" | "juez" | "maestro";
}

/**
 * Barra superior global con menú hamburguesa. Va montada en el layout, así que
 * acompaña al usuario en casi toda la app (fija arriba, también en móvil): desde
 * cualquier página puede volver al inicio o cerrar sesión sin devolverse hasta
 * el panel principal. Es una BARRA (no un botón flotante) para que el contenido
 * pase por debajo sin chocar con los botones de cada página.
 *
 * Se OCULTA en: /login y en las pantallas inmersivas que ya tienen su propia
 * barra superior (el tatami del Juez Central/jueces, con "Volver" y
 * "Activar/Desactivar"). Ahí no aporta y chocaría.
 */
export default function AppMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, idioma, setIdioma } = useI18n();
  const [user, setUser] = useState<SesionUser | null>(null);
  const [open, setOpen] = useState(false);
  // Arranca en "dark" (igual que el servidor) y se sincroniza al montar:
  // así el HTML del servidor y el primer render del cliente coinciden.
  const [tema, setTema] = useState<Tema>("dark");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTema(getTema());
    });
    return () => { cancelled = true; };
  }, []);

  function cambiarTema() {
    const nuevo: Tema = tema === "dark" ? "light" : "dark";
    aplicarTema(nuevo);
    setTema(nuevo);
  }

  // Releer la sesión en cada cambio de ruta (tras login/logout) y cerrar el panel
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dinamyt_user");
      setUser(raw ? (JSON.parse(raw) as SesionUser) : null);
    } catch {
      setUser(null);
    }
    setOpen(false);
  }, [pathname]);

  // Cerrar al hacer clic/tocar fuera o con Escape
  useEffect(() => {
    if (!open) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  const oculta =
    pathname === "/login" ||
    pathname.startsWith("/tatami");
  const visible = !!user && !oculta;

  // Reservar el alto de la barra en el body para que el contenido no quede
  // tapado (la barra es fija). Solo cuando la barra se muestra.
  useEffect(() => {
    document.body.classList.toggle("has-appmenu", visible);
    return () => document.body.classList.remove("has-appmenu");
  }, [visible]);

  if (!visible || !user) return null;

  const inicio = user.rol === "admin" ? "/admin" : user.rol === "maestro" ? "/maestro" : "/juez";
  const rolLabel =
    user.rol === "admin" ? t("rol.admin")
    : user.rol === "maestro" ? t("rol.maestro")
    : t("rol.juez");

  function ir(ruta: string) {
    setOpen(false);
    router.push(ruta);
  }

  return (
    <header ref={ref} className="appmenu">
      <button
        type="button"
        className="appmenu-toggle"
        aria-label={open ? t("menu.cerrar") : t("menu.abrir")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="appmenu-bars" data-open={open} aria-hidden="true">
          <span /><span /><span />
        </span>
        <span className="appmenu-toggle-label">{t("menu.etiqueta")}</span>
      </button>

      {open && (
        <div className="appmenu-panel" role="menu">
          <div className="appmenu-user">
            <div className="appmenu-user-name">{user.nombre || t("menu.sesion")}</div>
            <div className="appmenu-user-role">{rolLabel}</div>
          </div>
          <button type="button" role="menuitem" className="appmenu-item" onClick={() => ir(inicio)}>
            {t("menu.inicio")}
          </button>
          <button type="button" role="menuitem" className="appmenu-item" onClick={() => ir("/pantalla")}>
            {t("menu.pantallaPublica")}
          </button>
          <button type="button" role="menuitem" className="appmenu-item" onClick={() => ir("/campeonatos")}>
            {t("menu.campeonatos")}
          </button>
          <button type="button" role="menuitem" className="appmenu-item" onClick={cambiarTema}>
            {tema === "dark" ? t("menu.modoClaro") : t("menu.modoOscuro")}
          </button>
          <div className="appmenu-sep" />
          {/* Selector de idioma: los disponibles, con el activo resaltado */}
          <div className="appmenu-lang" role="group" aria-label={t("menu.idioma")}>
            <span className="appmenu-lang-label">🌐 {t("menu.idioma")}</span>
            <div className="appmenu-lang-btns">
              {IDIOMAS.map((l) => (
                <button
                  key={l.codigo}
                  type="button"
                  className="appmenu-lang-btn"
                  data-activo={idioma === l.codigo}
                  aria-pressed={idioma === l.codigo}
                  onClick={() => setIdioma(l.codigo)}
                >
                  {l.etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div className="appmenu-sep" />
          <LogoutButton />
        </div>
      )}
    </header>
  );
}
