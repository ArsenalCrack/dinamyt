'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { hoyISO } from '@/lib/formato';
import {
  LIM,
  PROPS_CORREO,
  TIPOS_SANGRE,
  correoValido,
  dominioSugerido,
  enMayusculas,
  nombreCompletoValido,
  soloTelefono,
  telefonoValido,
} from '@/lib/campos';
import { CINTURONES, cinturonPorNombre, fondoCinturon } from '@/lib/cinturones';
import { useFiltros } from '@/lib/preferencias';
import { avisoError, avisoOk } from '@/lib/toast';
import { Avatar } from '@/components/Avatar';
import { CampoContrasena } from '@/components/CampoContrasena';
import { CampoFecha } from '@/components/CampoFecha';
import { Cinturon } from '@/components/Cinturon';
import { Contador } from '@/components/Contador';
import { Etiqueta, LeyendaObligatorios } from '@/components/Etiqueta';
import { Filtros, type GrupoFiltro } from '@/components/Filtros';
import { SelectMenu } from '@/components/SelectMenu';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  trainsSince: string | null;
  birthDate: string | null;
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  role: Rol;
  isActive: boolean;
  /** Si su ficha la gobierna el portal DINAMYT. Ver `lib/ecosistema.ts`. */
  enElEcosistema: boolean;
  /** Su id en el portal, para enlazar derecho a su ficha de allí. */
  ecoSub: string | null;
}

/** Una clase del club, tal como la enseña el desplegable. */
interface Clase {
  id: string;
  name: string;
}

/** Portal DINAMYT: donde se editan los datos de quien llegó por él. */
const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

const ROLES: { valor: Rol; clave: 'rol.student' | 'rol.guardian' | 'rol.staff' }[] = [
  { valor: 'student', clave: 'rol.student' },
  { valor: 'guardian', clave: 'rol.guardian' },
  { valor: 'staff', clave: 'rol.staff' },
];

/** Lo que se edita de una persona. La contraseña va aparte, en su ficha. */
interface FormPersona {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: Rol;
  belt: string;
  trainsSince: string;
  birthDate: string;
  /** En qué clase del club entrena. Vacío = sin clase, o club sin dividir. */
  groupId: string;
  bloodType: string;
  emergencyName: string;
  emergencyPhone: string;
  /**
   * El maestro del club no cambia de rol aquí: a `owner` solo llega alguien por
   * mano del superadmin. Sin esta marca, editarle el teléfono al maestro
   * mandaba `role: 'owner'` y la API lo rechazaba con un 422 desconcertante.
   */
  rolFijo: boolean;
}

const VACIO: FormPersona = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  role: 'student',
  belt: '',
  trainsSince: '',
  birthDate: '',
  groupId: '',
  bloodType: '',
  emergencyName: '',
  emergencyPhone: '',
  rolFijo: false,
};

/**
 * Cómo se mira la lista cuando nadie ha tocado nada: quien tiene acceso, por
 * nombre. Es también a lo que vuelve «Quitar todos».
 *
 * Que el punto de partida sea «con acceso» y no «todos» no es un filtro
 * escondido: la lista es la del club de hoy, y a quien se le cortó el acceso se
 * le busca a propósito. Por eso está a un toque y se ve puesto cuando lo está.
 */
const FILTROS_INICIALES = { rol: '', acceso: 'activos', cinturon: '', orden: 'nombre' };

/** Lo que entiende `GET /users` (ver `lib/filtros.ts` en la API). */
const ORDENES = ['nombre', 'nombre_desc', 'cinturon', 'cinturon_desc', 'reciente', 'antiguo'];
const ACCESOS = ['activos', 'inactivos', 'todos'];
const ROLES_FILTRO = ['student', 'guardian', 'staff'];

/**
 * Lo guardado, puesto en su sitio: viene de `localStorage`, o sea de una
 * versión anterior de esta pantalla y de un texto que cualquiera puede editar a
 * mano. Un valor que ya no existe vuelve al de siempre sin decir nada, en vez
 * de dejar un desplegable en blanco o una lista vacía.
 */
function normalizar(f: typeof FILTROS_INICIALES): typeof FILTROS_INICIALES {
  return {
    rol: ROLES_FILTRO.includes(f.rol) ? f.rol : '',
    acceso: ACCESOS.includes(f.acceso) ? f.acceso : 'activos',
    cinturon: cinturonPorNombre(f.cinturon) ? f.cinturon : '',
    orden: ORDENES.includes(f.orden) ? f.orden : 'nombre',
  };
}

/**
 * Gente del club, a cargo del maestro. Aquí nacen las cuentas: no hay registro
 * abierto en la app, así que esta pantalla es la puerta de entrada del alumno.
 *
 * Y aquí también se corrigen: antes solo se podía dar de alta y cortar el
 * acceso, así que un correo mal escrito no había forma de arreglarlo desde la
 * aplicación.
 */
export default function Alumnos() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, club, cargando: cargandoSesion, esStaff, refrescar } = useAuth();
  /**
   * ¿Este club vive dentro de DINAMYT?
   *
   * Decide quién crea la CUENTA al dar de alta: estando federado la crea el
   * portal y la persona pone su propia contraseña con el enlace de invitación;
   * sola, la crea esta app con la que escriba el maestro. Se mira el club y no
   * un ajuste global porque es lo que el servidor mira también.
   */
  const federado = Boolean(club?.enElEcosistema);
  /** El enlace de «poner contraseña», cuando el correo no salió. */
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [gente, setGente] = useState<Persona[]>([]);
  /**
   * Las clases del club, para repartir al alumno en el momento de inscribirlo.
   *
   * Reasignar a alguien que ya existe se hace en su ficha, junto al plan y al
   * estado: la clase es de la MEMBRESÍA, no de la persona, y este listado no la
   * trae. Ofrecerla aquí obligaría a pedir la membresía de cada fila para saber
   * qué enseñar marcado.
   */
  const [clases, setClases] = useState<Clase[]>([]);
  const [total, setTotal] = useState(0);
  /**
   * Cuánta gente tiene el club, al margen de los filtros.
   *
   * `total` cuenta lo que casa con lo que hay puesto arriba —buscar «ana» lo
   * deja en 1— y el paginador, que era lo único que enseñaba un número, se
   * esconde cuando todo cabe en una página. Un club de doce alumnos no veía la
   * cifra por ningún sitio. Ver el resumen que devuelve `GET /users`.
   */
  const [resumen, setResumen] = useState({ alumnos: 0 });
  const [offset, setOffset] = useState(0);
  /**
   * Con qué se está mirando la lista: rol, acceso, cinturón y orden. Se
   * recuerda de una visita a la siguiente, por persona y por pantalla (ver
   * `lib/preferencias.ts`); `listo` avisa de cuándo se acabó de leer lo
   * guardado, para no pedir una primera lista con los filtros de nadie.
   */
  const { filtros, cambiar, limpiar, listo } = useFiltros(
    'alumnos',
    FILTROS_INICIALES,
    user?.id,
    normalizar,
  );
  const [busqueda, setBusqueda] = useState('');
  /**
   * La búsqueda que de verdad viajó a la API.
   *
   * Va aparte de `busqueda` porque el filtro es del SERVIDOR: no se puede
   * llamar en cada tecla. Se espera a que la mano pare (ver el `useEffect` con
   * el temporizador), y así «Ana» son dos peticiones y no tres.
   */
  const [buscado, setBuscado] = useState('');
  const [cargando, setCargando] = useState(true);
  /** Solo para fallos al CARGAR la lista; lo demás va por la nube flotante. */
  const [error, setError] = useState('');

  /** `null` = formulario cerrado · `'nuevo'` = alta · un id = editando. */
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormPersona>(VACIO);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      // Todo lo que se elige arriba viaja: el listado va por páginas, así que
      // filtrar u ordenar aquí acomodaría veinticinco personas de doscientas.
      // Ver `lib/filtros.ts` en la API.
      const { data } = await api.get<{
        items: Persona[];
        total: number;
        resumen: { alumnos: number };
      }>('/users', {
        params: {
          ...(buscado ? { q: buscado } : {}),
          ...(filtros.rol ? { role: filtros.rol } : {}),
          ...(filtros.cinturon ? { belt: filtros.cinturon } : {}),
          acceso: filtros.acceso,
          orden: filtros.orden,
          limit: POR_PAGINA,
          offset,
        },
      });
      setGente(data.items);
      setTotal(data.total);
      setResumen(data.resumen ?? { alumnos: 0 });
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    } finally {
      setCargando(false);
    }
  }, [filtros, buscado, offset, t]);

  // Al cambiar lo que se busca o un filtro se vuelve a la primera página:
  // quedarse en la página 4 de un resultado de 6 personas deja la pantalla
  // vacía y parece que la búsqueda no encontró nada.
  useEffect(() => {
    setOffset(0);
  }, [buscado, filtros]);

  // Se espera a que deje de escribir antes de preguntarle a la API.
  useEffect(() => {
    const id = setTimeout(() => setBuscado(busqueda.trim()), 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    // Sin los filtros guardados todavía leídos no se pide nada: la primera
    // lista sería la de nadie, y se vería cambiar sola un instante después.
    if (!listo) return;
    void cargar();
    // Las clases se piden una vez y aparte del listado: cambian de higos a
    // brevas y no tienen por qué viajar en cada búsqueda ni en cada página.
    // Que falle no rompe nada: el desplegable sale vacío y el alumno queda sin
    // clase, que es lo mismo que pasa en un club que no las usa.
    void api
      .get<{ grupos: Clase[] }>('/schedule')
      .then((r) => setClases(r.data.grupos ?? []))
      .catch(() => setClases([]));
  }, [cargandoSesion, user, esStaff, router, cargar, listo]);

  function abrirAlta() {
    setForm(VACIO);
    setEditando(editando === 'nuevo' ? null : 'nuevo');
  }

  function abrirEdicion(p: Persona) {
    if (editando === p.id) {
      setEditando(null);
      return;
    }
    setForm({
      fullName: p.fullName,
      email: p.email,
      password: '',
      phone: p.phone ?? '',
      role: p.role,
      belt: p.belt ?? '',
      trainsSince: p.trainsSince ?? '',
      birthDate: p.birthDate ?? '',
      groupId: '',
      bloodType: p.bloodType ?? '',
      emergencyName: p.emergencyName ?? '',
      emergencyPhone: p.emergencyPhone ?? '',
      rolFijo: p.role === 'owner',
    });
    setEditando(p.id);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    // Las mismas tres reglas que aplica la API, comprobadas antes de viajar:
    // un 422 después de rellenar diez campos no explica cuál falló.
    if (!nombreCompletoValido(form.fullName)) {
      avisoError(t('comun.nombreIncompleto'));
      return;
    }
    if (!correoValido(form.email)) {
      avisoError(t('comun.correoInvalido'));
      return;
    }
    if (!telefonoValido(form.phone) || !telefonoValido(form.emergencyPhone)) {
      avisoError(t('comun.telefonoCorto'));
      return;
    }
    setEnviando(true);
    // La ficha de seguridad va igual en el alta y en la edición: son los mismos
    // cuatro campos y el mismo criterio de vacío.
    const ficha = {
      trainsSince: form.trainsSince || null,
      bloodType: form.bloodType || null,
      emergencyName: form.emergencyName || null,
      emergencyPhone: form.emergencyPhone || null,
      // La fecha de nacimiento solo la manda el maestro: la API le responde 403
      // al auxiliar que lo intente, y eso echaría abajo el guardado del resto
      // del formulario, que sí es suyo.
      ...(esMaestro ? { birthDate: form.birthDate || null } : {}),
    };
    const alta = editando === 'nuevo';
    try {
      if (editando === 'nuevo') {
        const { data } = await api.post<{
          invitacion?: { enviadaPorCorreo: boolean; enlace?: string } | null;
        }>('/users', {
          fullName: form.fullName,
          email: form.email,
          // Estando federada, el servidor la rechaza: la contraseña la pone su
          // dueño en el portal. Mandarla igual sería pedirle al maestro un dato
          // que no se va a usar.
          ...(federado ? {} : { password: form.password }),
          phone: form.phone || undefined,
          role: form.role,
          belt: form.belt || undefined,
          // Solo tiene sentido para un alumno: el auxiliar y el acudiente no
          // entrenan, así que no van a ninguna clase.
          ...(form.role === 'student' && form.groupId ? { groupId: form.groupId } : {}),
          ...ficha,
        });
        // Sin proveedor de correo, el enlace vuelve aquí para que el maestro se
        // lo pase por WhatsApp. Con el correo funcionando no llega, y quien
        // inscribe no ve la llave.
        setInvitacion(data?.invitacion?.enlace ?? null);
      } else {
        // El cinturón y el teléfono viajan aunque estén vacíos: quitarlos es
        // una edición tan válida como ponerlos.
        await api.patch(`/users/${editando}`, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || null,
          ...(form.rolFijo ? {} : { role: form.role }),
          belt: form.belt || null,
          ...ficha,
        });
        // Si me acabo de editar a mí mismo, la sesión que tiene la app en
        // memoria quedó vieja: el cinturón nuevo no aparecía en «Mi grado»
        // hasta recargar la página entera.
        if (editando === user?.id) await refrescar();
      }
      setForm(VACIO);
      setEditando(null);
      // El aviso va DESPUÉS de recargar la lista: confirma un hecho consumado.
      // Antes se anunciaba «creado» con la tabla todavía sin la persona, y
      // desde el final de un formulario largo no se veía ninguna de las dos
      // cosas.
      await cargar();
      avisoOk(alta ? t('alumnos.creado') : t('alumnos.actualizado'));
    } catch (err) {
      avisoError(mensajeError(err, t('alumnos.crearTitulo')));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAcceso(p: Persona) {
    try {
      await api.patch(`/users/${p.id}`, { isActive: !p.isActive });
      await cargar();
    } catch (err) {
      avisoError(mensajeError(err, t('comun.editar')));
    }
  }

  if (cargandoSesion || cargando) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {t('comun.cargando')}
      </main>
    );
  }

  // Ya no se filtra aquí: lo hace la API (ver `cargar`). Filtrar en el
  // navegador sobre una sola página escondería a todo el que no estuviera en
  // ella, que es justo lo contrario de lo que hace un buscador.
  const visibles = gente;

  /**
   * Lo que ofrece la barra de arriba.
   *
   * El rol y el acceso van como fichas y no como desplegables: son tres o
   * cuatro opciones cada uno, se leen de un vistazo y se cambian de un toque. El
   * acceso, además, es de los pocos sitios donde importa VER que está puesto:
   * la lista de siempre esconde a quien tiene el acceso cortado, y buscar a
   * alguien que no aparece porque se le desactivó hace tres meses es la clase
   * de rato perdido que este chip evita.
   */
  const grupos: GrupoFiltro[] = [
    {
      clave: 'rol',
      etiqueta: t('comun.rol'),
      valor: filtros.rol,
      onChange: (v) => cambiar({ rol: v }),
      tipo: 'chips',
      ancho: true,
      opciones: [
        { valor: '', etiqueta: t('filtros.todosRoles') },
        { valor: 'student', etiqueta: t('rol.student') },
        { valor: 'guardian', etiqueta: t('rol.guardian') },
        { valor: 'staff', etiqueta: t('rol.staff') },
      ],
    },
    {
      clave: 'acceso',
      etiqueta: t('filtros.acceso'),
      valor: filtros.acceso,
      onChange: (v) => cambiar({ acceso: v }),
      tipo: 'chips',
      ancho: true,
      neutro: 'activos',
      opciones: [
        { valor: 'activos', etiqueta: t('acceso.activos') },
        { valor: 'inactivos', etiqueta: t('acceso.inactivos') },
        { valor: 'todos', etiqueta: t('acceso.todos') },
      ],
    },
    {
      clave: 'cinturon',
      etiqueta: t('comun.cinturon'),
      valor: filtros.cinturon,
      onChange: (v) => cambiar({ cinturon: v }),
      tipo: 'menu',
      opciones: [
        { valor: '', etiqueta: t('filtros.todosCinturones') },
        ...CINTURONES.map((c) => ({
          valor: c.nombre,
          etiqueta: c.nombre,
          punto: fondoCinturon(c),
        })),
      ],
    },
    {
      clave: 'orden',
      etiqueta: t('filtros.orden'),
      valor: filtros.orden,
      onChange: (v) => cambiar({ orden: v }),
      tipo: 'menu',
      neutro: 'nombre',
      opciones: [
        { valor: 'nombre', etiqueta: t('orden.nombre') },
        { valor: 'nombre_desc', etiqueta: t('orden.nombre_desc') },
        { valor: 'cinturon_desc', etiqueta: t('orden.cinturon_desc') },
        { valor: 'cinturon', etiqueta: t('orden.cinturon') },
        { valor: 'reciente', etiqueta: t('orden.reciente') },
        { valor: 'antiguo', etiqueta: t('orden.antiguo') },
      ],
    },
  ];

  /** El desplegable de cinturón DEL FORMULARIO, que no es el del filtro. */
  const opcionesCinturon = [
    { valor: '', etiqueta: t('comun.sinCinturon') },
    ...CINTURONES.map((c) => ({
      valor: c.nombre,
      etiqueta: c.nombre,
      punto: fondoCinturon(c),
    })),
  ];

  /**
   * El enlace de «poner contraseña», cuando el correo no ha salido.
   *
   * Va fuera del formulario a propósito: el formulario se cierra al crear, y
   * este enlace es lo único que le queda al maestro para que esa persona pueda
   * entrar. Perderlo significa volver a invitarla desde el portal.
   */
  const avisoInvitacion = invitacion ? (
    <div
      className="card"
      style={{ padding: '0.9rem 1rem', marginBottom: '1.25rem', borderColor: 'var(--acento)' }}
    >
      <p style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
        {t('alumnos.enlaceInvitacion')}
      </p>
      <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{invitacion}</code>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={() => void navigator.clipboard?.writeText(invitacion)}
        >
          {t('comun.copiarEnlace')}
        </button>
        <button type="button" className="btn" onClick={() => setInvitacion(null)}>
          {t('comun.cerrar')}
        </button>
      </div>
    </div>
  ) : null;

  const formulario = (
    <form onSubmit={guardar} className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
      <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
        {editando === 'nuevo' ? t('alumnos.crearTitulo') : t('ficha.datos')}
      </h2>
      <LeyendaObligatorios />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px, 100%), 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={{ display: 'block' }}>
          <Etiqueta obligatorio>{t('comun.nombre')}</Etiqueta>
          {/* El aviso sale MIENTRAS se escribe, igual que el del teléfono: un
              nombre a medias no se descubre al final del formulario. */}
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: enMayusculas(e.target.value) })}
            maxLength={LIM.nombrePersona}
            required
            style={{
              marginTop: '0.25rem',
              borderColor: nombreCompletoValido(form.fullName) ? undefined : 'var(--danger)',
            }}
          />
          {!nombreCompletoValido(form.fullName) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.nombreIncompleto')}
            </span>
          )}
          <Contador valor={form.fullName} max={LIM.nombrePersona} />
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta obligatorio>{t('comun.correo')}</Etiqueta>
          <input
            {...PROPS_CORREO}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={LIM.correo}
            required
            style={{
              marginTop: '0.25rem',
              borderColor: correoValido(form.email) ? undefined : 'var(--danger)',
            }}
          />
          {!correoValido(form.email) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.correoInvalido')}
            </span>
          )}
          {/* El dedazo típico se PREGUNTA, no se corrige solo: `gmial.com` es
              un dominio legal, y hay clubes con correo propio parecido. */}
          {correoValido(form.email) && dominioSugerido(form.email) && (
            <span className="muted" style={{ fontSize: '0.7rem' }}>
              {t('comun.correoSugerencia')}{' '}
              <button
                type="button"
                className="enlace"
                onClick={() => setForm({ ...form, email: dominioSugerido(form.email)! })}
              >
                {dominioSugerido(form.email)}
              </button>
              ?
            </span>
          )}
          <Contador valor={form.email} max={LIM.correo} />
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('comun.telefono')}</Etiqueta>
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: soloTelefono(e.target.value) })}
            maxLength={LIM.telefono}
            style={{
              marginTop: '0.25rem',
              // El aviso aparece MIENTRAS se escribe, no al enviar: así nadie
              // descubre que le faltan dígitos después de rellenar el resto.
              borderColor: telefonoValido(form.phone) ? undefined : 'var(--danger)',
            }}
          />
          {!telefonoValido(form.phone) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.telefonoCorto')}
            </span>
          )}
          <Contador valor={form.phone} max={LIM.telefono} />
        </label>
        <label style={{ display: 'block' }}>
          {/* El rol no lleva marca: siempre trae uno puesto («Alumno»), así
              que ni es obligatorio de rellenar ni se puede dejar en blanco. */}
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('comun.rol')}
          </span>
          <div style={{ marginTop: '0.25rem' }}>
            {form.rolFijo ? (
              <p style={{ padding: '0.55rem 0', fontWeight: 600 }}>{t('rol.owner')}</p>
            ) : (
              <SelectMenu
                valor={form.role}
                onChange={(v) => setForm({ ...form, role: v as Rol })}
                etiquetaAria={t('comun.rol')}
                opciones={ROLES.map((r) => ({ valor: r.valor, etiqueta: t(r.clave) }))}
              />
            )}
          </div>
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('alumnos.rolAyuda')}
          </span>
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('comun.cinturon')}</Etiqueta>
          <div style={{ marginTop: '0.25rem' }}>
            <SelectMenu
              valor={form.belt}
              onChange={(v) => setForm({ ...form, belt: v })}
              etiquetaAria={t('comun.cinturon')}
              placeholder={t('comun.sinCinturon')}
              opciones={opcionesCinturon}
            />
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('ficha.entrenaDesde')}</Etiqueta>
          {/* Calendario propio y no `type="date"`: esta es justo la fecha
              vieja que en Android obligaba a cruzar los meses de uno en uno.
              Ver `components/CampoFecha.tsx`. */}
          <div style={{ marginTop: '0.25rem' }}>
            <CampoFecha
              valor={form.trainsSince}
              onChange={(v) => setForm({ ...form, trainsSince: v })}
              min="1950-01-01"
              max={hoyISO()}
              ariaLabel={t('ficha.entrenaDesde')}
            />
          </div>
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('ficha.entrenaDesdeAyuda')}
          </span>
        </label>
        {/* La fecha de nacimiento es del maestro: al auxiliar ni se le dibuja,
            porque la API le respondería 403 al guardar. */}
        {esMaestro && (
          <label style={{ display: 'block' }}>
            <Etiqueta>{t('ficha.nacimiento')}</Etiqueta>
            {/* Mismo calendario que el resto del sistema, y por el mismo motivo:
                una fecha de nacimiento es SIEMPRE vieja, y con el selector
                nativo de Android llegar a 1998 son cien toques en la flecha. */}
            <div style={{ marginTop: '0.25rem' }}>
              <CampoFecha
                valor={form.birthDate}
                onChange={(v) => setForm({ ...form, birthDate: v })}
                min="1900-01-01"
                max={hoyISO()}
                ariaLabel={t('ficha.nacimiento')}
              />
            </div>
            <span className="muted" style={{ fontSize: '0.7rem' }}>
              {t('ficha.nacimientoAyuda')}
            </span>
          </label>
        )}
        {/* La clase solo se elige al INSCRIBIR. Cambiársela a alguien que ya
            está se hace en su ficha, junto al plan y al estado: la clase es de
            su membresía, y es ahí donde vive todo lo que se le cambia de ella. */}
        {editando === 'nuevo' && form.role === 'student' && clases.length > 0 && (
          <label style={{ display: 'block' }}>
            <Etiqueta>{t('grupos.asignar')}</Etiqueta>
            <div style={{ marginTop: '0.25rem' }}>
              <SelectMenu
                valor={form.groupId}
                onChange={(v) => setForm({ ...form, groupId: v })}
                etiquetaAria={t('grupos.asignar')}
                placeholder={t('grupos.sinAsignar')}
                opciones={[
                  { valor: '', etiqueta: t('grupos.sinAsignar') },
                  ...clases.map((c) => ({ valor: c.id, etiqueta: c.name })),
                ]}
              />
            </div>
          </label>
        )}
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('ficha.sangre')}</Etiqueta>
          <div style={{ marginTop: '0.25rem' }}>
            <SelectMenu
              valor={form.bloodType}
              onChange={(v) => setForm({ ...form, bloodType: v })}
              etiquetaAria={t('ficha.sangre')}
              placeholder={t('ficha.sinSangre')}
              opciones={[
                { valor: '', etiqueta: t('ficha.sinSangre') },
                ...TIPOS_SANGRE.map((s) => ({ valor: s, etiqueta: s })),
              ]}
            />
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('ficha.emergenciaNombre')}</Etiqueta>
          <input
            value={form.emergencyName}
            onChange={(e) => setForm({ ...form, emergencyName: enMayusculas(e.target.value) })}
            maxLength={LIM.nombrePersona}
            style={{ marginTop: '0.25rem' }}
          />
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('ficha.emergenciaAyuda')}
          </span>
          <Contador valor={form.emergencyName} max={LIM.nombrePersona} />
        </label>
        <label style={{ display: 'block' }}>
          <Etiqueta>{t('ficha.emergenciaTelefono')}</Etiqueta>
          <input
            type="tel"
            inputMode="tel"
            value={form.emergencyPhone}
            onChange={(e) =>
              setForm({ ...form, emergencyPhone: soloTelefono(e.target.value) })
            }
            maxLength={LIM.telefono}
            style={{
              marginTop: '0.25rem',
              borderColor: telefonoValido(form.emergencyPhone) ? undefined : 'var(--danger)',
            }}
          />
          {!telefonoValido(form.emergencyPhone) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.telefonoCorto')}
            </span>
          )}
          <Contador valor={form.emergencyPhone} max={LIM.telefono} />
        </label>
        {/* La contraseña solo se pide cuando el club va SOLO. Estando dentro de
            DINAMYT la cuenta nace allí sin contraseña y su dueño pone la suya
            con el enlace de invitación — el maestro ya no reparte contraseñas,
            que es la misma regla que rige el cambio de contraseña. */}
        {editando === 'nuevo' && federado && (
          <p className="muted" style={{ fontSize: '0.75rem', gridColumn: '1 / -1' }}>
            {t('alumnos.cuentaEnDinamyt')}
          </p>
        )}
        {editando === 'nuevo' && !federado && (
          <label style={{ display: 'block' }}>
            <Etiqueta obligatorio>{t('alumnos.contrasenaInicial')}</Etiqueta>
            {/* Arranca VISIBLE: el maestro la está fijando y se la tiene que
                dictar al alumno. El ojo está para taparla cuando hay gente
                mirando la pantalla. */}
            <CampoContrasena
              verInicial
              autoComplete="new-password"
              minLength={8}
              maxLength={LIM.password}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              style={{ marginTop: '0.25rem' }}
            />
            <span className="muted" style={{ fontSize: '0.7rem' }}>
              {t('alumnos.contrasenaAyuda')}
            </span>
            <Contador valor={form.password} max={LIM.password} />
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-cta" disabled={enviando}>
          {enviando
            ? t('comun.guardando')
            : editando === 'nuevo'
              ? t('comun.crear')
              : t('comun.guardar')}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setEditando(null)}>
          {t('comun.cancelar')}
        </button>
      </div>
    </form>
  );

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: '1.5rem' }}>
            {t('alumnos.titulo')}
          </h1>
          {/* Cuántos son. Va pegado al título y no dentro de la barra de
              filtros porque no depende de ellos: es el club, no el resultado
              de una búsqueda. El «sin acceso» solo aparece si hay alguien, y
              entonces importa: es la gente apagada que nadie está mirando. */}
          {/* Cuántos alumnos hay, y solo eso: los que tienen acceso. A quien
              se le cortó no se cuenta ni se menciona aquí — se le busca a
              propósito con el filtro «Sin acceso», que es donde ese dato
              significa algo. */}
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
            <span className="mono">{resumen.alumnos}</span>{' '}
            {resumen.alumnos === 1 ? t('alumnos.unAlumno') : t('alumnos.cuantos')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* El maestro ya no se lista entre sus alumnos (ver `GET /users`),
              así que su ficha necesita una puerta: esta. */}
          {esMaestro && user && (
            <Link
              href={`/alumnos/${user.id}`}
              className="btn btn-outline btn-sm"
              title={t('alumnos.miFichaAyuda')}
            >
              {t('alumnos.miFicha')}
            </Link>
          )}
          {esMaestro && (
            <button className="btn btn-cta btn-sm" onClick={abrirAlta}>
              {editando === 'nuevo' ? t('comun.cancelar') : `+ ${t('alumnos.nuevo')}`}
            </button>
          )}
        </div>
      </header>

      {/* Solo un fallo al CARGAR la lista se queda escrito aquí: es permanente
          y explica por qué la pantalla está vacía. El resultado de una acción
          se avisa con la nube flotante (ver lib/toast.ts). */}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {avisoInvitacion}
      {editando && esMaestro && formulario}

      <Filtros
        busqueda={busqueda}
        onBuscar={setBusqueda}
        placeholder={t('pag.buscarAlumno')}
        grupos={grupos}
        total={total}
        plegarCon={offset}
        onLimpiar={limpiar}
      />

      {/* Arriba también, y no por simetría: al final de la lista solo lo
          encuentra quien ya bajó los quince, que es el trabajo que este
          control venía a ahorrar. Y el rótulo del medio —«16–30 de 213»— se
          lee antes de empezar, así se entra sabiendo cuánta gente hay. */}
      <Paginacion arriba offset={offset} limit={POR_PAGINA} total={total} onIr={setOffset} />

      {/* Igual que el panel: en el celular cada persona es una ficha que se
          lee hacia abajo, no un renglón que hay que arrastrar de lado (ver
          `.tabla-apilable` en globals.css). */}
      <div className="card tabla-scroll tabla-apilable-caja">
        <table className="tabla-apilable">
          <thead>
            <tr>
              <th>{t('comun.nombre')}</th>
              <th>{t('comun.cinturon')}</th>
              <th>{t('comun.rol')}</th>
              <th>{t('comun.telefono')}</th>
              <th>{t('comun.estado')}</th>
              <th>{t('comun.acciones')}</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr data-vacio>
                <td colSpan={6} className="muted" style={{ padding: '1rem' }}>
                  {buscado ? t('pag.sinResultados') : t('comun.ninguno')}
                </td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id}>
                <td data-cabecera>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {/* La foto se amplía aunque la fila lleve su enlace: aquí
                        el avatar es hermano del `<Link>`, no va dentro, así
                        que tocar la cara abre la foto y tocar el nombre abre
                        la ficha — cada cosa donde se espera. */}
                    <Avatar src={p.avatarUrl} nombre={p.fullName} size={34} ampliable />
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/alumnos/${p.id}`}
                        style={{ fontWeight: 600, color: 'var(--gold)' }}
                      >
                        {p.fullName}
                      </Link>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        {p.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-etq={t('comun.cinturon')}>
                  <Cinturon nombre={p.belt} />
                </td>
                <td className="muted" data-etq={t('comun.rol')}>
                  {t(`rol.${p.role}` as ClaveTexto)}
                </td>
                <td className="muted" data-etq={t('comun.telefono')}>
                  {p.phone || '—'}
                </td>
                <td data-etq={t('comun.estado')}>
                  <span className={p.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                    {p.isActive ? t('comun.activo') : t('comun.inactivo')}
                  </span>
                </td>
                <td data-acciones>
                  {esMaestro && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {/* Quien llegó por DINAMYT tiene su ficha allí: aquí el
                          botón lleva al portal en vez de abrir un formulario
                          que la API va a rechazar. Ver `lib/ecosistema.ts`. */}
                      {p.enElEcosistema ? (
                        PORTAL_URL && (
                          <a
                            className="btn btn-outline btn-sm"
                            href={
                              p.ecoSub
                                ? `${PORTAL_URL}/mi-organizacion/miembro/${p.ecoSub}`
                                : `${PORTAL_URL}/mi-organizacion`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('eco.fichaDelPortal')}
                          >
                            ✎ {t('eco.editarEnPortal')} ↗
                          </a>
                        )
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => abrirEdicion(p)}
                        >
                          ✎ {t('comun.editar')}
                        </button>
                      )}
                      <Link href={`/alumnos/${p.id}`} className="btn btn-outline btn-sm">
                        {t('panel.verFicha')}
                      </Link>
                      {/* Cortarse el acceso a uno mismo deja el club sin
                          maestro y sin forma de volver a entrar. La API lo
                          rechaza con un 400, pero enterarse DESPUÉS de pulsar
                          es peor que ver el botón apagado: aquí ya se ve que
                          no se puede, y por qué. */}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => alternarAcceso(p)}
                        disabled={p.id === user?.id}
                        title={p.id === user?.id ? t('alumnos.noTeDesactivas') : undefined}
                      >
                        {p.isActive ? t('alumnos.desactivar') : t('alumnos.activar')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginacion offset={offset} limit={POR_PAGINA} total={total} onIr={setOffset} />
    </main>
  );
}
