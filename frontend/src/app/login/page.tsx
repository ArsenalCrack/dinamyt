"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginAPI } from "@/lib/api";
import Logo from "@/components/Logo";
import { IDIOMAS, useI18n } from "@/lib/i18n";
import { aplicarTema, getTema, type Tema } from "@/lib/theme";

export default function LoginPage() {
  const router = useRouter();
  const { t, idioma, setIdioma } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Tema (sin sesión no hay menú global): arranca "dark" como el servidor y
  // se sincroniza al montar para no desajustar la hidratación.
  const [tema, setTema] = useState<Tema>("dark");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setTema(getTema()); });
    return () => { cancelled = true; };
  }, []);
  function cambiarTema() {
    const nuevo: Tema = tema === "dark" ? "light" : "dark";
    aplicarTema(nuevo);
    setTema(nuevo);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await loginAPI(email, password);
      localStorage.setItem("dinamyt_token", data.token);
      localStorage.setItem("dinamyt_user", JSON.stringify(data.user));
      router.push(
        data.user.rol === "admin" ? "/admin"
        : data.user.rol === "maestro" ? "/maestro"
        : "/juez"
      );
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || t("login.errorConexion"));
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="login-page">
      {/* Fondo con gradiente */}
      <div className="login-bg" aria-hidden="true" />

      <div className="login-wrapper animate-slide">
        {/* Logo central */}
        <div className="login-logo">
          <Logo stacked fontSize="clamp(2rem, 6vw, 2.8rem)" />
          <p className="login-tagline">{t("login.tagline")}</p>
          <p className="login-sub">Global Hapkido Association · GHA</p>
        </div>

        {/* GRID: Pantalla Publica | Separator | Login */}
        <div className="login-grid">

          {/* ── PANTALLA PUBLICA ── */}
          <div className="login-card login-card-public animate-fade">
            <div className="login-card-icon" aria-hidden="true">📺</div>
            <h2 className="login-card-title">{t("login.publica.titulo")}</h2>
            <p className="login-card-desc">
              {t("login.publica.desc1")}<br />
              {t("login.publica.desc2")}
            </p>
            <button
              type="button"
              className="btn btn-lg login-btn-public"
              onClick={() => router.push("/pantalla")}
              style={{
                width: "100%",
                fontWeight: 800,
                fontSize: "1rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
              id="public-access-btn"
            >
              {t("login.publica.boton")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => router.push("/resultados")}
              style={{ width: "100%", borderColor: "var(--gold-border)", color: "var(--gold)", fontWeight: 700 }}
              id="public-results-btn"
            >
              {t("res.verResultados")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => router.push("/campeonatos")}
              style={{ width: "100%", borderColor: "var(--gold-border)", color: "var(--gold)", fontWeight: 700 }}
              id="public-champs-btn"
            >
              {t("pub.camp.boton")}
            </button>
            <p className="login-card-note">{t("login.publica.nota")}</p>
          </div>

          {/* ── SEPARADOR ── */}
          <div className="login-separator" aria-hidden="true">
            <div className="login-separator-line" />
            <span className="login-separator-label">{t("login.o")}</span>
            <div className="login-separator-line" />
          </div>

          {/* ── LOGIN JUECES / ADMIN ── */}
          <div className="login-card login-card-auth animate-fade" style={{ animationDelay: "0.1s" }}>
            <div className="login-card-icon" aria-hidden="true">🏅</div>
            <h2 className="login-card-title">{t("login.jueces.titulo")}</h2>
            <p className="login-card-desc">
              {t("login.jueces.desc")}
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label className="login-label" htmlFor="login-email">{t("login.correo")}</label>
                <input
                  type="email"
                  className="input"
                  placeholder="juez@dinamyt.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  id="login-email"
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="login-password">{t("login.contrasena")}</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  id="login-password"
                />
              </div>

              {error && (
                <div className="login-error animate-fade" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: "100%" }}
                disabled={loading}
                id="login-submit"
              >
                {loading ? t("login.verificando") : t("login.entrar")}
              </button>
            </form>
          </div>

        </div>

      </div>

      {/* Aquí no hay menú global (se oculta en /login): selector propio de
          idioma + toggle de tema */}
      <div className="login-idiomas" role="group" aria-label={t("menu.idioma")}>
        {IDIOMAS.map((l) => (
          <button
            key={l.codigo}
            type="button"
            className="login-idioma-btn"
            data-activo={idioma === l.codigo}
            aria-pressed={idioma === l.codigo}
            onClick={() => setIdioma(l.codigo)}
          >
            {l.etiqueta}
          </button>
        ))}
        <button
          type="button"
          className="login-idioma-btn"
          onClick={cambiarTema}
          title={tema === "dark" ? t("menu.modoClaro") : t("menu.modoOscuro")}
        >
          {tema === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      <p className="login-footer">{t("login.footer")}</p>

      <style>{`
        .login-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .login-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 20% 30%, rgba(240,184,0,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 70%, rgba(0,85,255,0.05) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        .login-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .login-logo {
          text-align: center;
        }

        .login-tagline {
          font-family: var(--font-body);
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.04em;
          margin-top: 6px;
        }

        .login-sub {
          font-size: 0.85rem;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-top: 2px;
        }

        .login-grid {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 0;
          width: 100%;
          align-items: start;
        }

        .login-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .login-card-public {
          border-color: var(--chung-border);
        }

        /* CTA de pantalla pública: navy sólido en oscuro; en claro ese navy
           chocaría con el texto azul del tema, así que usa el tinte chung */
        .login-btn-public {
          background: linear-gradient(135deg, #1c2e5e 0%, #0d1d42 100%);
          border: 2px solid var(--chung-border);
          color: var(--chung-light);
        }

        html[data-theme="light"] .login-btn-public {
          background: var(--chung-bg-strong);
        }

        .login-card-auth {
          border-color: var(--gold-border);
        }

        .login-card-icon {
          font-size: 2.2rem;
          line-height: 1;
        }

        .login-card-title {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .login-card-desc {
          font-size: 0.92rem;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .login-card-note {
          font-size: 0.82rem;
          color: var(--text-dim);
          text-align: center;
          margin-top: auto;
        }

        .login-public-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .login-separator {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 24px;
          gap: 8px;
          padding-top: 80px;
        }

        .login-separator-line {
          flex: 1;
          width: 1px;
          background: var(--border);
          min-height: 60px;
        }

        .login-separator-label {
          font-size: 0.875rem;
          font-weight: 800;
          color: var(--text-dim);
          letter-spacing: 0.1em;
          padding: 8px 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .login-label {
          font-size: 0.82rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          color: var(--text-muted);
        }

        .login-error {
          background: rgba(255,68,68,0.10);
          border: 1px solid rgba(255,68,68,0.30);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          color: var(--red-alert);
          font-size: 0.92rem;
          text-align: center;
        }

        .login-idiomas {
          position: relative;
          z-index: 1;
          margin-top: 24px;
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .login-idioma-btn {
          padding: 7px 18px;
          background: transparent;
          border: 1.5px solid var(--border-light);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font: inherit;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: var(--transition);
        }

        .login-idioma-btn:hover,
        .login-idioma-btn:focus-visible {
          background: var(--bg-elevated);
          color: var(--text);
          outline: none;
        }

        .login-idioma-btn[data-activo="true"] {
          background: var(--gold-bg);
          border-color: var(--gold-border);
          color: var(--gold);
          font-weight: 800;
        }

        .login-footer {
          position: relative;
          z-index: 1;
          margin-top: 20px;
          color: var(--text-dim);
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-align: center;
        }

        /* Responsive */
        @media (max-width: 700px) {
          .login-grid {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .login-separator {
            flex-direction: row;
            padding: 16px 0;
          }
          .login-separator-line {
            flex: 1;
            width: auto;
            height: 1px;
            min-height: auto;
          }
        }
      `}</style>
    </div>
  );
}
