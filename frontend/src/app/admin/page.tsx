"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listCampeonatosAPI,
  createCampeonatoAPI,
  updateCampeonatoAPI,
  listUsersAPI,
  registerUserAPI,
  updateUserAPI,
  type UserData,
} from "@/lib/api";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import Logo from "@/components/Logo";
import { useI18n } from "@/lib/i18n";

interface Campeonato {
  id: number;
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  num_tatamis: number;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<UserData | null>(null);
  const [campeonatos, setCampeonatos] = useState<Campeonato[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [tab, setTab] = useState<"campeonatos" | "jueces">("campeonatos");
  const [showNewCamp, setShowNewCamp] = useState(false);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newCamp, setNewCamp] = useState({ nombre: "", descripcion: "", num_tatamis: 6 });
  const [newUser, setNewUser] = useState({ email: "", password: "", nombre: "", rol: "juez" });
  const [msg, setMsg] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [rolFiltro, setRolFiltro] = useState<"todos" | "admin" | "juez">("todos");
  const [campSearch, setCampSearch] = useState("");
  const [campFiltro, setCampFiltro] = useState<"todos" | "activos" | "inactivos">("todos");
  const [creandoCamp, setCreandoCamp] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editUserData, setEditUserData] = useState({ nombre: "", email: "", password: "", rol: "juez" });
  const { pedirConfirmacion, dialogo } = useConfirmDialog();

  useEffect(() => {
    const saved = localStorage.getItem("dinamyt_user");
    if (!saved) { router.replace("/login"); return; }
    const u = JSON.parse(saved);
    if (u.rol !== "admin") { router.replace("/juez"); return; }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setUser(u);
      void loadData(showInactive);
    });
    return () => { cancelled = true; };
  }, [router, showInactive]);

  async function loadData(includeInactive = false) {
    try {
      const [c, u] = await Promise.all([
        listCampeonatosAPI(),
        listUsersAPI(includeInactive),
      ]);
      setCampeonatos(c);
      setUsers(u);
    } catch { /* */ }
  }

  function flash(texto: string, tipo: "ok" | "error" = "ok") {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleToggleCampActivo(c: Campeonato) {
    try {
      await updateCampeonatoAPI(c.id, { activo: !c.activo });
      await loadData(showInactive);
      flash(c.activo
        ? t("admin.camp.desactivadoMsg", { nombre: c.nombre })
        : t("admin.camp.activadoMsg", { nombre: c.nombre }), "ok");
    } catch { flash(t("admin.camp.errorEstado"), "error"); }
  }

  async function handleSaveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    const payload: { nombre?: string; email?: string; password?: string; rol?: string } = {};
    if (editUserData.nombre.trim()) payload.nombre = editUserData.nombre.trim();
    if (editUserData.email.trim()) payload.email = editUserData.email.trim();
    if (editUserData.password) payload.password = editUserData.password;
    if (editUserData.rol && editUserData.rol !== editingUser.rol) payload.rol = editUserData.rol;
    try {
      await updateUserAPI(editingUser.id, payload);
      setEditingUser(null);
      await loadData(showInactive);
      flash(t("admin.usuarios.actualizado"), "ok");
    } catch (err) {
      const m = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      flash(m || t("admin.usuarios.errorActualizar"), "error");
    }
  }

  function handleToggleUserActivo(target: UserData) {
    if (target.id === user?.id) {
      flash(t("admin.usuarios.noPropio"), "error");
      return;
    }
    const ejecutar = async () => {
      try {
        await updateUserAPI(target.id, { activo: !target.activo });
        await loadData(showInactive);
        flash(target.activo ? t("admin.usuarios.desactivado") : t("admin.usuarios.reactivado"), "ok");
      } catch { flash(t("admin.usuarios.errorEstado"), "error"); }
    };
    if (target.activo) {
      pedirConfirmacion({
        titulo: t("admin.usuarios.confDesactivar.titulo"),
        mensaje: t("admin.usuarios.confDesactivar.mensaje", { nombre: target.nombre }),
        tipo: "peligro",
        confirmLabel: t("comun.desactivar"),
        onConfirm: ejecutar,
      });
    } else {
      void ejecutar();
    }
  }

  async function handleCreateCamp(e: React.FormEvent) {
    e.preventDefault();
    if (creandoCamp) return;
    setCreandoCamp(true);
    try {
      await createCampeonatoAPI(newCamp);
      setShowNewCamp(false);
      setNewCamp({ nombre: "", descripcion: "", num_tatamis: 6 });
      loadData(showInactive);
      flash(t("admin.camp.creado"), "ok");
    } catch {
      flash(t("admin.camp.errorCrear"), "error");
      loadData(showInactive);
    } finally {
      setCreandoCamp(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await registerUserAPI(newUser);
      setShowNewUser(false);
      setNewUser({ email: "", password: "", nombre: "", rol: "juez" });
      loadData(showInactive);
      flash(t("admin.usuarios.creado"), "ok");
    } catch (err) {
      const m = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      flash(m || t("admin.usuarios.errorCrear"), "error");
    }
  }

  if (!user) return null;

  // Jerarquía: el dato fresco de superadmin viene de la lista de usuarios
  // (el user guardado en localStorage puede ser de un login viejo sin el campo)
  const esSuper = users.some((u) => u.id === user.id && u.es_superadmin);

  // Filtro combinado de campeonatos: búsqueda por nombre + estado activo/inactivo
  const coincideCamp = (c: Campeonato) =>
    c.nombre.toLowerCase().includes(campSearch.trim().toLowerCase())
    && (campFiltro === "todos" || (campFiltro === "activos" ? c.activo : !c.activo));

  return (
    <div className="admin-page" style={{ maxWidth: 960, margin: "0 auto", padding: "20px" }}>
      {/* Header */}
      <div className="admin-header" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div>
          <Logo fontSize="1.8rem" />
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 2 }}>
            {t("admin.panel")} &middot; {user.nombre}
          </p>
        </div>
      </div>

      {/* Mensajes: verde = satisfactorio, rojo = no se pudo realizar */}
      {msg && (
        <div role={msg.tipo === "error" ? "alert" : "status"} style={{
          background: msg.tipo === "error" ? "rgba(255,68,68,0.10)" : "var(--green-bg)",
          border: `1px solid ${msg.tipo === "error" ? "rgba(255,68,68,0.35)" : "rgba(0,196,106,.25)"}`,
          borderRadius: "var(--radius-sm)", padding: "10px 16px",
          color: msg.tipo === "error" ? "var(--red-alert)" : "var(--green)",
          marginBottom: 16, fontSize: "0.9rem", fontWeight: 700,
        }} className="animate-fade">{msg.texto}</div>
      )}
      {dialogo}

      {/* Tabs */}
      <div className="admin-tabs" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {/* "pestana" y no "t": no hacerle sombra a la función de traducción */}
        {(["campeonatos", "jueces"] as const).map((pestana) => (
          <button
            key={pestana}
            className="btn"
            onClick={() => setTab(pestana)}
            style={{
              background: tab === pestana ? "var(--gold-bg)" : undefined,
              borderColor: tab === pestana ? "var(--gold-border)" : undefined,
              color: tab === pestana ? "var(--gold)" : undefined,
              textTransform: "capitalize",
            }}
          >
            {pestana === "campeonatos" ? t("admin.tab.campeonatos") : t("admin.tab.jueces")}
          </button>
        ))}
        <button className="btn" onClick={() => router.push("/admin/competidores")}>
          {t("admin.tab.competidores")}
        </button>
      </div>

      {/* ══════════════ CAMPEONATOS TAB ══════════════ */}
      {tab === "campeonatos" && (
        <div className="animate-fade">
          <div className="admin-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "1.1rem", color: "var(--gold)" }}>
              {t("admin.tab.campeonatos")} ({campeonatos.length})
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewCamp(!showNewCamp)}>
              {t("admin.camp.nuevo")}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <input
              className="input"
              placeholder={t("admin.camp.buscar")}
              value={campSearch}
              onChange={(e) => setCampSearch(e.target.value)}
              style={{ flex: "1 1 200px", maxWidth: 380 }}
            />
            <select
              className="input"
              value={campFiltro}
              onChange={(e) => setCampFiltro(e.target.value as "todos" | "activos" | "inactivos")}
              aria-label={t("admin.camp.filtroAria")}
              style={{ width: "auto", minWidth: 150, padding: "8px 30px 8px 12px", minHeight: 38 }}
            >
              <option value="todos">{t("admin.filtro.todos")}</option>
              <option value="activos">{t("admin.filtro.activos")}</option>
              <option value="inactivos">{t("admin.filtro.inactivos")}</option>
            </select>
          </div>

          {showNewCamp && (
            <div className="card animate-slide" style={{ marginBottom: 16 }}>
              <div className="card-title">{t("admin.camp.crear.titulo")}</div>
              <form onSubmit={handleCreateCamp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input className="input" placeholder={t("admin.camp.nombre")} value={newCamp.nombre}
                  onChange={(e) => setNewCamp({ ...newCamp, nombre: e.target.value })} required />
                <input className="input" placeholder={t("admin.camp.desc")} value={newCamp.descripcion}
                  onChange={(e) => setNewCamp({ ...newCamp, descripcion: e.target.value })} />
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label style={{ color: "var(--text-muted)", fontSize: "0.9rem", whiteSpace: "nowrap" }}>{t("admin.camp.tatamisLabel")}</label>
                  <input className="input" type="number" min={1} max={10} value={newCamp.num_tatamis}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 1;
                      setNewCamp({ ...newCamp, num_tatamis: Math.min(10, Math.max(1, n)) });
                    }}
                    style={{ width: 80 }} />
                  <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{t("admin.camp.max10")}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={creandoCamp}>
                    {creandoCamp ? t("admin.camp.creando") : t("comun.crear")}
                  </button>
                  <button type="button" className="btn" onClick={() => setShowNewCamp(false)} disabled={creandoCamp}>{t("comun.cancelar")}</button>
                </div>
              </form>
            </div>
          )}

          {campeonatos.filter(coincideCamp).length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
              {campeonatos.length === 0
                ? t("admin.camp.vacio")
                : t("admin.camp.sinCoincidencias")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {campeonatos
                .filter(coincideCamp)
                .map((c) => (
                <div key={c.id} className="card" style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/admin/campeonato/${c.id}`)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>
                        {c.nombre}
                        <span className={`badge ${c.activo ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 8, verticalAlign: "middle" }}>
                          {c.activo ? t("comun.activo") : t("comun.inactivo")}
                        </span>
                      </h3>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        {c.num_tatamis} {t("comun.tatamis")}
                        {c.descripcion && ` · ${c.descripcion}`}
                        {!c.activo && t("admin.camp.oculto")}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button
                        className={`btn btn-sm ${c.activo ? "btn-danger" : "btn-primary"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCampActivo(c);
                        }}
                      >
                        {c.activo ? t("comun.desactivar") : t("comun.activar")}
                      </button>
                      <span style={{ color: "var(--gold)", fontSize: "0.9rem" }}>{t("admin.camp.verDetalles")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ JUECES TAB ══════════════ */}
      {tab === "jueces" && (
        <div className="animate-fade">
          <div className="admin-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "1.1rem", color: "var(--gold)" }}>
              {t("admin.usuarios.titulo")} ({users.length})
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewUser(!showNewUser)}>
              {t("admin.usuarios.nuevo")}
            </button>
          </div>

          {showNewUser && (
            <div className="card animate-slide" style={{ marginBottom: 16 }}>
              <div className="card-title">{t("admin.usuarios.crear.titulo")}</div>
              <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input className="input" placeholder={t("admin.usuarios.nombre")} value={newUser.nombre}
                  onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })} required />
                <input className="input" type="email" placeholder={t("admin.usuarios.correo")} value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                <input className="input" type="password" placeholder={t("admin.usuarios.contrasena")} value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
                {/* Jerarquía: solo el superadmin crea administradores; un admin
                    normal solo agrega jueces a su propio equipo */}
                {esSuper ? (
                  <select className="input" value={newUser.rol}
                    onChange={(e) => setNewUser({ ...newUser, rol: e.target.value })}>
                    <option value="juez">{t("rol.juez")}</option>
                    <option value="admin">{t("rol.admin")}</option>
                  </select>
                ) : (
                  <p style={{ color: "var(--text-dim)", fontSize: "0.84rem", margin: 0 }}>
                    {t("admin.usuarios.soloJueces")}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary">{t("comun.crear")}</button>
                  <button type="button" className="btn" onClick={() => setShowNewUser(false)}>{t("comun.cancelar")}</button>
                </div>
              </form>
            </div>
          )}

          {/* Buscador, filtro por tipo y filtro de inactivos */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="input"
              placeholder={t("admin.usuarios.buscar")}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ flex: "1 1 200px", maxWidth: 380 }}
            />
            <select
              className="input"
              value={rolFiltro}
              onChange={(e) => setRolFiltro(e.target.value as "todos" | "admin" | "juez")}
              aria-label={t("admin.usuarios.filtroAria")}
              style={{ width: "auto", minWidth: 150, padding: "8px 30px 8px 12px", minHeight: 38 }}
            >
              <option value="todos">{t("admin.usuarios.filtro.todos")}</option>
              <option value="admin">{t("admin.usuarios.filtro.admins")}</option>
              <option value="juez">{t("admin.usuarios.filtro.jueces")}</option>
            </select>
            <label style={{
              display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              fontSize: "0.88rem", color: "var(--text-muted)", fontWeight: 700,
              userSelect: "none", whiteSpace: "nowrap",
            }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ accentColor: "var(--gold)", width: 16, height: 16 }}
              />
              {t("admin.usuarios.mostrarInactivos")}
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users
              .filter((u) => rolFiltro === "todos" || u.rol === rolFiltro)
              .filter((u) => {
                const q = userSearch.trim().toLowerCase();
                if (!q) return true;
                return `${u.nombre} ${u.email}`.toLowerCase().includes(q);
              })
              .map((u) => (
              <div key={u.id}>
                <div className="admin-user-row card" style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  opacity: u.activo ? 1 : 0.55,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflowWrap: "anywhere" }}>
                      <span style={{ fontWeight: 700 }}>{u.nombre}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: "0.9rem" }}>{u.email}</span>
                      {!u.activo && (
                        <span className="badge badge-gray" style={{ marginLeft: 8 }}>{t("comun.inactivo")}</span>
                      )}
                    </div>
                    <div style={{ color: "var(--text-dim)", fontSize: "0.84rem", marginTop: 4 }}>
                      {t("admin.usuarios.agregado")} {u.created_at ? new Date(u.created_at).toLocaleDateString("es-CO") : "—"}
                      {u.creado_por ? ` ${t("comun.por")} ${u.creado_por.nombre}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem",
                      fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                      background: u.rol === "admin" ? "var(--gold-bg)" : "var(--chung-bg)",
                      color: u.rol === "admin" ? "var(--gold)" : "var(--chung-light)",
                      border: `1px solid ${u.rol === "admin" ? "var(--gold-border)" : "var(--chung-border)"}`,
                    }}>{u.es_superadmin ? t("rol.superadmin") : u.rol === "admin" ? t("rol.admin") : t("rol.juez")}</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        if (editingUser?.id === u.id) {
                          setEditingUser(null);
                        } else {
                          setEditingUser(u);
                          setEditUserData({ nombre: u.nombre, email: u.email, password: "", rol: u.rol });
                        }
                      }}
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                    >
                      {editingUser?.id === u.id ? t("comun.cerrar") : t("comun.editar")}
                    </button>
                    <button
                      className={`btn btn-sm ${u.activo ? "btn-danger" : "btn-primary"}`}
                      onClick={() => handleToggleUserActivo(u)}
                      disabled={u.id === user.id}
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                    >
                      {u.activo ? t("comun.desactivar") : t("comun.reactivar")}
                    </button>
                  </div>
                </div>

                {/* Edición: correo, nombre y restablecer contraseña (solo admin) */}
                {editingUser?.id === u.id && (
                  <form onSubmit={handleSaveUserEdit} className="card animate-slide" style={{
                    display: "flex", flexDirection: "column", gap: 10,
                    marginTop: 6, borderColor: "var(--gold-border)",
                  }}>
                    <div className="card-title">{t("admin.usuarios.editarA", { nombre: u.nombre })}</div>
                    <input className="input" placeholder={t("admin.usuarios.nombre")} value={editUserData.nombre}
                      onChange={(e) => setEditUserData({ ...editUserData, nombre: e.target.value })} />
                    <input className="input" type="email" placeholder={t("admin.usuarios.correo")} value={editUserData.email}
                      onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })} />
                    <input className="input" type="password" autoComplete="new-password"
                      placeholder={t("admin.usuarios.nuevaContrasena")}
                      value={editUserData.password}
                      onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })} />
                    {/* Cambios de rol: exclusivos del superadmin */}
                    {esSuper && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <label style={{ color: "var(--text-muted)", fontSize: "0.9rem", whiteSpace: "nowrap" }}>{t("admin.usuarios.rolLabel")}</label>
                        <select className="input" value={editUserData.rol}
                          disabled={u.id === user.id}
                          onChange={(e) => setEditUserData({ ...editUserData, rol: e.target.value })}>
                          <option value="juez">{t("rol.juez")}</option>
                          <option value="admin">{t("rol.admin")}</option>
                        </select>
                      </div>
                    )}
                    <p style={{ color: "var(--text-dim)", fontSize: "0.84rem", margin: 0 }}>
                      {t("admin.usuarios.notaReset")}
                      {u.id === user.id
                        ? t("admin.usuarios.notaPropio")
                        : t("admin.usuarios.notaRolCambio")}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" className="btn btn-primary btn-sm">{t("comun.guardarCambios")}</button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingUser(null)}>{t("comun.cancelar")}</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        .admin-section-header .btn {
          flex: 0 0 auto;
        }
        @media (max-width: 420px) {
          .admin-section-header {
            flex-direction: column;
            align-items: stretch !important;
          }
          .admin-section-header .btn {
            width: 100%;
          }
        }
        @media (max-width: 640px) {
          .admin-page {
            padding: 14px !important;
          }
          .admin-header {
            align-items: flex-start !important;
            gap: 12px;
            flex-wrap: wrap;
          }
          .admin-tabs {
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .admin-tabs .btn {
            flex: 0 0 auto;
          }
          .admin-user-row {
            align-items: flex-start !important;
            gap: 12px;
            flex-wrap: wrap;
          }
          .admin-user-row > div:last-child {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
