'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  extraerError,
  misOrganizacionesAPI,
} from '@/lib/api';
import {
  soloLetras,
  soloTelefono,
  limitesFechaNacimiento,
  PARENTESCOS,
  GENEROS,
  TIPOS_SANGRE,
  CINTURONES_GRADO,
  hoyISO,
  comprimirAvatar,
  LIM,
} from '@/lib/validacion';
import { CampoFecha } from '@/components/CampoFecha';
import { SelectMenu } from '@/components/SelectMenu';
import { Avatar } from '@/components/Avatar';
import { useI18n, type ClaveTexto } from '@/lib/i18n';

interface Disciplina {
  id: string;
  discipline: string;
  currentGrade: string | null;
  since: string | null;
}
interface Acudiente {
  id: string;
  guardianUserId: string;
  relationship: string | null;
}
interface Perfil {
  id: string;
  email: string;
  fullName: string;
  documentId: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  avatarUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string | null;
  bloodType: string | null;
  isEmailVerified: boolean | null;
  /** Zona horaria IANA. Con ella se le escriben los correos y los avisos. */
  timezone: string | null;
  theme: string | null;
  locale: string | null;
  /** ¿La eligió a mano? Entonces la detección automática no la pisa. */
  timezoneManual: boolean | null;
  createdAt: string | null;
  disciplines: Disciplina[];
  guardians: Acudiente[];
}

/**
 * Progreso del perfil: qué tan completo está (orienta al usuario y es lo que
 * Campeonatos exige antes de inscribirse).
 */
function progresoPerfil(p: Perfil, avatarActual: string) {
  // Devuelve CLAVES, no textos: la lista se pinta con `t()` en la pantalla.
  // Escrita con los textos dentro, esta funcion era la unica parte del perfil
  // que se quedaba en español al cambiar a ingles — y es justo la que se lee
  // cuando algo falta.
  const items: { etiqueta: ClaveTexto; ok: boolean }[] = [
    { etiqueta: 'perfil.foto', ok: !!avatarActual },
    { etiqueta: 'perfil.telefono', ok: !!p.phone },
    { etiqueta: 'perfil.nacimiento', ok: !!p.birthDate },
    { etiqueta: 'perfil.emergencia', ok: !!p.emergencyContactName && !!p.emergencyContactPhone },
    { etiqueta: 'perfil.parentescoContacto', ok: !!p.emergencyContactRelationship },
    { etiqueta: 'perfil.tipoSangre', ok: !!p.bloodType },
    { etiqueta: 'perfil.disciplinaGrado', ok: p.disciplines.length > 0 },
  ];
  const hechos = items.filter((i) => i.ok).length;
  return { items, pct: Math.round((hechos / items.length) * 100) };
}

/**
 * Mi perfil — la persona ÚNICA del ecosistema, y **la única puerta a tus
 * propios datos**.
 *
 * ── Las dos puertas que había ────────────────────────────────────────────────
 *
 * Los mismos diez campos —nombre, nacimiento, género, tipo de sangre, teléfono,
 * contacto de emergencia, notas médicas, foto— se editaban en DOS formularios
 * distintos:
 *
 *   · aquí, `/perfil`, con la mitad de los campos bloqueados; y
 *   · en `/mi-organizacion/miembro/<id>`, el editor del maestro, que la lista
 *     de miembros ofrecía **también para la fila de uno mismo**.
 *
 * Y no eran copias: el editor del maestro dejaba corregir el nombre y la fecha
 * de nacimiento, y además el cinturón; este no. Así que el maestro que quería
 * arreglarse un dedazo en su propio nombre tenía que saber que ESA pantalla —la
 * de administrar a su gente— era donde estaba su propio nombre. Dos sitios para
 * un dato es la forma segura de que nadie sepa cuál manda.
 *
 * ── Lo que se hizo ───────────────────────────────────────────────────────────
 *
 * El editor del maestro es ahora para OTRAS personas: entrar en él con el
 * propio identificador redirige aquí, y en la lista de miembros la fila de uno
 * mismo lleva a «Mi perfil». A cambio, esta pantalla **desbloquea los campos de
 * gestor cuando la persona gestiona su propio club** (`gestor`, abajo): es
 * exactamente lo que el servidor ya permitía —`isOrgManagerOf(yo, yo)` es
 * cierto para un maestro— y lo único que faltaba era que el formulario lo
 * ofreciera.
 *
 * El correo y el documento no se editan nunca (son la identidad).
 * La contraseña SOLO se cambia aquí (las apps no tienen su propio formulario).
 */
export default function PerfilPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Campos editables del formulario.
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    birthDate: '',
    gender: '',
    bloodType: '',
    avatarUrl: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    medicalNotes: '',
  });

  // Subida de foto.
  const inputFoto = useRef<HTMLInputElement>(null);
  const [fotoMsg, setFotoMsg] = useState('');

  /**
   * ¿Esta persona gestiona un club?
   *
   * De esto depende que los campos protegidos —nombre, nacimiento, género,
   * tipo de sangre y cinturón— salgan editables. No es un permiso nuevo: el
   * servidor ya los aceptaba de un gestor **aunque el gestionado fuera él
   * mismo** (`isOrgManagerOf(yo, yo)` en `users.service.ts`). Lo que faltaba
   * era ofrecerlos, y por eso el maestro acababa en la pantalla de administrar
   * a su gente para corregirse su propio nombre.
   *
   * `null` mientras no se sabe: se pinta bloqueado, que es lo prudente. Si la
   * consulta falla, se queda bloqueado y el aviso de siempre sigue diciendo a
   * quién pedírselo.
   */
  const [gestor, setGestor] = useState<boolean | null>(null);

  /**
   * Cinturón y antigüedad. Viven en la misma fila (`user_disciplines`) y por
   * eso viajan juntos, igual que en el editor del maestro. Solo se ven —y solo
   * se mandan— si `gestor`.
   */
  const [cinturon, setCinturon] = useState('');
  const [desde, setDesde] = useState('');

  const fechas = limitesFechaNacimiento();

  const cargar = useCallback(async () => {
    const t = obtenerToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    const payload = decodificarToken(t);
    if (!payload) {
      router.replace('/login');
      return;
    }
    try {
      // Las dos en paralelo: el perfil es lo que se pinta y las
      // organizaciones deciden qué campos salen editables. En serie, la
      // pantalla esperaba dos viajes para enseñar lo mismo.
      const [res, orgs] = await Promise.all([
        api.get(`/users/${payload.sub}/profile`),
        misOrganizacionesAPI().catch(() => null),
      ]);
      // `null` = no se pudo preguntar. Se queda bloqueado, que es lo prudente:
      // un campo que se deja escribir y luego el servidor rechaza es peor que
      // uno que nunca se ofreció.
      setGestor(orgs === null ? null : orgs.length > 0);
      const p = res.data as Perfil;
      setPerfil(p);
      setCinturon(p.disciplines?.[0]?.currentGrade ?? '');
      setDesde(p.disciplines?.[0]?.since?.slice(0, 10) ?? '');
      setForm({
        fullName: p.fullName ?? '',
        phone: p.phone ?? '',
        birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
        gender: p.gender ?? '',
        bloodType: p.bloodType ?? '',
        avatarUrl: p.avatarUrl ?? '',
        emergencyContactName: p.emergencyContactName ?? '',
        emergencyContactPhone: p.emergencyContactPhone ?? '',
        emergencyContactRelationship: p.emergencyContactRelationship ?? '',
        medicalNotes: p.medicalNotes ?? '',
      });
    } catch (e) {
      setError(extraerError(e, 'No se pudo cargar tu perfil.'));
    }
  }, [router]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function elegirFoto(file: File | undefined) {
    if (!file) return;
    setFotoMsg('');
    try {
      const dataUrl = await comprimirAvatar(file);
      setForm((f) => ({ ...f, avatarUrl: dataUrl }));
      setFotoMsg('Foto lista: guarda los cambios para conservarla.');
    } catch (e) {
      setFotoMsg(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    setGuardando(true);
    setError('');
    setOk('');
    try {
      // ── Qué se manda y qué no ──────────────────────────────────────────
      // Quien gestiona un club manda TODO, porque el servidor se lo acepta:
      // `isOrgManagerOf(yo, yo)` es cierto para un maestro, y esa es la regla
      // que ya se aplicaba en el editor de miembros. Quien no gestiona sigue
      // pudiendo RELLENAR lo que falta, pero no cambiar lo ya registrado —y
      // por eso esos tres campos se omiten cuando ya tienen valor: mandarlos
      // sería pedir un error que no hace falta pedir.
      const puede = gestor === true;
      await api.patch(`/users/${perfil.id}/profile`, {
        ...(puede
          ? {
              fullName: form.fullName.trim().toLocaleUpperCase('es'),
              birthDate: form.birthDate || null,
              gender: form.gender || null,
              bloodType: form.bloodType || null,
            }
          : {
              ...(perfil.birthDate ? {} : { birthDate: form.birthDate || null }),
              // El género se manda solo si todavía no estaba: rellenar un hueco
              // sí, cambiarlo no. Las cuentas importadas llegan sin él.
              ...(perfil.gender ? {} : { gender: form.gender || null }),
              ...(perfil.bloodType ? {} : { bloodType: form.bloodType || null }),
            }),
        phone: form.phone || null,
        avatarUrl: form.avatarUrl || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null,
        medicalNotes: form.medicalNotes || null,
      });

      // El cinturón y la antigüedad viven en otra tabla, así que van en su
      // propio viaje — y solo si cambió alguno de los dos. Es el mismo código
      // que tenía el editor de miembros: se trae para que esta pantalla no
      // tenga que mandar a nadie a la otra.
      if (puede) {
        const dis = perfil.disciplines?.[0];
        if (
          cinturon !== (dis?.currentGrade ?? '') ||
          desde !== (dis?.since?.slice(0, 10) ?? '')
        ) {
          await api.put(`/users/${perfil.id}/disciplines`, {
            discipline: dis?.discipline ?? 'hapkido',
            currentGrade: cinturon || null,
            since: desde || null,
          });
        }
      }

      setOk('Perfil guardado. Los cambios se ven en todas las aplicaciones.');
      setFotoMsg('');
      // Se relee: el servidor normaliza el nombre a mayúsculas y recalcula el
      // progreso del perfil. Sin esto la pantalla enseñaba lo tecleado y la
      // barra de progreso se quedaba en el número de antes.
      await cargar();
    } catch (e2) {
      setError(extraerError(e2, 'No se pudo guardar el perfil.'));
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Un campo de texto con su etiqueta. Ya no distingue contraseñas: la única
   * que había en esta pantalla se mudó a Configuración, y el `type ===
   * 'password'` que quedaba aquí era una rama muerta que obligaba a importar
   * `CampoContrasena` para nada.
   */
  const campo = (
    etiqueta: string,
    valor: string,
    onChange: (v: string) => void,
    props: Record<string, unknown> = {},
  ) => (
    <label className="block text-sm">
      <span style={{ color: 'var(--text-muted)' }}>{etiqueta}</span>
      <input
        className="mt-1"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );

  if (!perfil) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <p style={{ color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
          {error || 'Cargando tu perfil…'}
        </p>
      </main>
    );
  }

  /**
   * ¿Salen los campos de gestor?
   *
   * `gestor === true` y no `gestor` a secas: mientras se pregunta vale `null`,
   * y `null` tiene que pintar BLOQUEADO. Al revés, la pantalla abría los campos
   * medio segundo y los cerraba de golpe al llegar la respuesta.
   */
  const puedeGestor = gestor === true;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">{t('perfil.eyebrow')}</p>
          <h1 className="display text-3xl">{t('perfil.titulo')}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {perfil.email} · {t('perfil.documento')} {perfil.documentId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/configuracion" className="btn btn-outline">
            {t('config.desdeElPerfil')}
          </Link>
          <Link href="/dashboard" className="btn btn-outline">
            {t('perfil.misApps')}
          </Link>
        </div>
      </header>

      {/* ── Progreso del perfil (Campeonatos exige el perfil completo) ── */}
      {(() => {
        const prog = progresoPerfil(perfil, form.avatarUrl);
        const faltan = prog.items.filter((i) => !i.ok);
        return (
          <section className="card mb-4 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {t('perfil.progreso')} {prog.pct}%
              </h2>
              {prog.pct === 100 ? (
                <span className="badge badge-ok">{t('perfil.completo')}</span>
              ) : (
                <span className="badge badge-gold">
                  {faltan.length} {t('perfil.pendientes')}
                </span>
              )}
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={prog.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ background: 'var(--bg-elevated)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${prog.pct}%`,
                  background: prog.pct === 100 ? 'var(--ok)' : 'var(--gold)',
                }}
              />
            </div>
            {faltan.length > 0 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('perfil.teFalta')}{' '}
                {faltan.map((f) => t(f.etiqueta)).join(' · ')}.{' '}
                {t('perfil.requisito')}
              </p>
            )}
          </section>
        );
      })()}

      {/* ── Foto + datos de cuenta ── */}
      <section className="card mb-4 p-5">
        <div className="flex flex-wrap items-center gap-5">
          {/* ── Por qué esto es `<Avatar>` y no una `<img>` propia ──────────
              Porque era una `<img>` propia, y ahí estaba el fallo de «la foto
              no se ve hasta que le doy clic para ampliarla»: la foto guardada
              se anota como una ruta del disco (`/media/avatars/…`), y esa ruta
              es de la API, no del portal. `<Avatar>` la resuelve con
              `urlImagen`; esta pantalla la metía cruda en el `src`, así que el
              navegador la pedía al origen del portal y recibía un 404. Al
              ampliarla sí aparecía porque el visor sí la resuelve — de ahí que
              pareciera que la foto «estaba» pero no se pintaba.

              La lección es la de todo este cambio: una sola puerta. Mientras
              cada pantalla pinte su propia foto, arreglarlo en `<Avatar>` no
              arregla nada. */}
          <Avatar
            src={form.avatarUrl}
            nombre={perfil.fullName}
            size={96}
            ampliable
            destacada
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{t('perfil.foto')}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('perfil.fotoDesc')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={inputFoto}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void elegirFoto(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => inputFoto.current?.click()}
                className="btn btn-gold"
              >
                Subir foto
              </button>
              {form.avatarUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, avatarUrl: '' }));
                    setFotoMsg('Foto quitada: guarda los cambios para confirmarlo.');
                  }}
                  className="btn btn-outline"
                >
                  Quitar foto
                </button>
              )}
            </div>
            {fotoMsg && (
              <p className="mt-2 text-xs" style={{ color: 'var(--gold)' }}>
                {fotoMsg}
              </p>
            )}
          </div>
        </div>

        <dl
          className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex justify-between gap-2">
            <dt style={{ color: 'var(--text-muted)' }}>Documento</dt>
            <dd className="font-semibold">{perfil.documentId}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: 'var(--text-muted)' }}>{t('perfil.correoVerificado')}</dt>
            <dd>
              <span className={`badge ${perfil.isEmailVerified ? 'badge-ok' : ''}`}>
                {perfil.isEmailVerified ? 'Sí' : 'No'}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: 'var(--text-muted)' }}>{t('perfil.miembroDesde')}</dt>
            <dd className="font-semibold">
              {perfil.createdAt
                ? new Date(perfil.createdAt).toLocaleDateString('es')
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Datos de la persona ── */}
      <form onSubmit={guardar} className="card flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">{t('perfil.datosPersonales')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{t('perfil.nombreCompleto')}</span>
            {/* Editable solo para quien gestiona un club. No es un permiso
                nuevo: es el que el servidor ya daba y que obligaba al maestro a
                irse a la pantalla de administrar a su gente para corregirse el
                propio nombre. Ver el bloque de arriba del archivo. */}
            <input
              className="mt-1"
              value={form.fullName}
              readOnly={!puedeGestor}
              onChange={
                puedeGestor
                  ? (e) => setForm({ ...form, fullName: soloLetras(e.target.value) })
                  : undefined
              }
              maxLength={LIM.nombrePersona}
              style={puedeGestor ? undefined : { opacity: 0.7 }}
            />
            <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
              {puedeGestor
                ? 'Como gestionas un club, puedes corregirlo. Se guarda en mayúsculas.'
                : t('perfil.nombreLoCorrigeMaestro')}
            </span>
          </label>
          {campo(
            t('perfil.telefonoSoloNumeros'),
            form.phone,
            (v) => setForm({ ...form, phone: soloTelefono(v) }),
            {
              type: 'tel',
              inputMode: 'tel',
              placeholder: '300 123 4567',
              maxLength: LIM.telefono,
            },
          )}
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{t('perfil.nacimiento')}</span>
            {/* El calendario propio, el mismo de Membresías y Campeonatos: el
                nativo de Android solo avanza mes a mes y un año de nacimiento
                son trescientos toques. */}
            <div className="mt-1">
              <CampoFecha
                valor={form.birthDate}
                onChange={(v) => setForm({ ...form, birthDate: v })}
                min={fechas.min}
                max={fechas.max}
                disabled={!puedeGestor && !!perfil.birthDate}
                borrable={false}
                etiquetaAria={t('perfil.nacimiento')}
              />
            </div>
            <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
              {puedeGestor
                ? 'Gestionas un club: puedes corregirla.'
                : perfil.birthDate
                  ? 'Ya registrada: solo tu maestro o un administrador puede corregirla.'
                  : 'Regístrala con cuidado: después solo la corrige tu maestro.'}
            </span>
          </div>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{t('perfil.genero')}</span>
            {/* Se puede rellenar si falta —las cuentas importadas llegan sin
                él— pero no cambiar: Campeonatos ya armó categorías con este
                dato, y moverlo a mitad de temporada mueve la llave. */}
            <div className="mt-1">
              <SelectMenu
                valor={form.gender}
                etiquetaAria={t('perfil.genero')}
                disabled={!puedeGestor && !!perfil.gender}
                placeholder={t('perfil.selecciona')}
                onChange={(v) => setForm({ ...form, gender: v })}
                opciones={GENEROS.map((g) => ({
                  valor: g.valor,
                  etiqueta: g.etiqueta,
                }))}
              />
            </div>
            <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
              {puedeGestor
                ? 'Gestionas un club: puedes corregirlo. Mueve tu categoría en Campeonatos.'
                : perfil.gender
                  ? 'Ya registrado: lo corrige tu maestro o un administrador.'
                  : 'Con esto Campeonatos te ubica en tu categoría.'}
            </span>
          </div>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{t('perfil.tipoSangre')}</span>
            {/* ── Se puede rellenar si falta; cambiarlo, no ──
                Era un campo de solo lectura que decía «Por registrar» y no
                dejaba registrar nada: la única salida era pedírselo al
                maestro, para un dato que la persona sabe mejor que nadie y que
                se imprime en su carnet. Ahora sigue la MISMA regla que el
                género y la fecha de nacimiento —se pone una vez y después lo
                corrige el maestro—, que es lo que ya esperaba quien miraba
                esta pantalla. El servidor aplica la misma regla. */}
            <div className="mt-1">
              <SelectMenu
                valor={form.bloodType}
                etiquetaAria={t('perfil.tipoSangre')}
                disabled={!puedeGestor && !!perfil.bloodType}
                placeholder={t('perfil.porRegistrar')}
                onChange={(v) => setForm({ ...form, bloodType: v })}
                opciones={TIPOS_SANGRE.map((s) => ({ valor: s, etiqueta: s }))}
              />
            </div>
            <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
              {puedeGestor
                ? 'Gestionas un club: puedes corregirlo. Va impreso en tu carnet.'
                : perfil.bloodType
                  ? 'Ya registrado: lo corrige tu maestro o un administrador.'
                  : 'Regístralo con cuidado: después solo lo corrige tu maestro.'}
            </span>
          </div>
        </div>

        <h2 className="mt-2 text-lg font-semibold">{t('perfil.emergencia')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {campo(
            t('perfil.nombreSoloLetras'),
            form.emergencyContactName,
            (v) => setForm({ ...form, emergencyContactName: soloLetras(v) }),
            { maxLength: LIM.nombrePersona },
          )}
          {campo(
            t('perfil.telefonoSoloNumeros'),
            form.emergencyContactPhone,
            (v) => setForm({ ...form, emergencyContactPhone: soloTelefono(v) }),
            { type: 'tel', inputMode: 'tel', maxLength: LIM.telefono },
          )}
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{t('perfil.parentesco')}</span>
            <div className="mt-1">
              <SelectMenu
                valor={form.emergencyContactRelationship}
                etiquetaAria={t('perfil.parentesco')}
                placeholder={t('perfil.selecciona')}
                onChange={(v) =>
                  setForm({ ...form, emergencyContactRelationship: v })
                }
                opciones={PARENTESCOS.map((p) => ({ valor: p, etiqueta: p }))}
              />
            </div>
          </div>
        </div>

        <label className="block text-sm">
          <span style={{ color: 'var(--text-muted)' }}>
            Notas médicas (solo las ve tu maestro; se guardan cifradas)
          </span>
          <textarea
            className="mt-1"
            rows={3}
            value={form.medicalNotes}
            maxLength={LIM.notasMedicas}
            onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
            placeholder={t('perfil.notasMedicas')}
          />
        </label>

        {error && <p className="msg-error text-sm">{error}</p>}
        {ok && <p className="msg-ok text-sm">{ok}</p>}
        <button type="submit" disabled={guardando} className="btn btn-gold self-start">
          {guardando ? t('perfil.guardando') : t('perfil.guardarCambios')}
        </button>
      </form>

      {/* ── Disciplinas y grado ──────────────────────────────────────────────
          De solo lectura para quien entrena: el cinturón lo promueve su
          maestro, y esa regla no cambia. Editable para quien gestiona un club,
          porque el suyo tenía que ponérselo desde la pantalla de administrar a
          su gente — el último trozo de «mi perfil» que vivía en otra parte.

          Va FUERA del formulario de arriba a propósito: el cinturón se guarda
          en otra tabla y con otra petición, y mezclarlos escondería que son dos
          cosas. El botón de guardar es el mismo, que es lo que importa. */}
      <section className="card mt-4 p-5">
        <h2 className="text-lg font-semibold">{t('perfil.disciplinas')}</h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          {puedeGestor
            ? 'Gestionas un club, así que tu propio grado lo registras aquí.'
            : 'El cinturón lo actualiza tu maestro cuando te promueve.'}
        </p>

        {puedeGestor ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Cinturón</span>
              <div className="mt-1">
                <SelectMenu
                  valor={cinturon}
                  etiquetaAria="Cinturón"
                  placeholder={t('perfil.selecciona')}
                  onChange={setCinturon}
                  opciones={CINTURONES_GRADO.map((c) => ({ valor: c, etiqueta: c }))}
                />
              </div>
            </div>
            <div className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Entrena desde</span>
              <div className="mt-1">
                <CampoFecha
                  valor={desde}
                  onChange={setDesde}
                  max={hoyISO()}
                  etiquetaAria="Entrena desde"
                />
              </div>
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
                Va impresa en tu carnet de Membresías.
              </span>
            </div>
            <p className="text-xs sm:col-span-2" style={{ color: 'var(--text-muted)' }}>
              Se guarda con el botón «{t('perfil.guardarCambios')}» de arriba.
            </p>
          </div>
        ) : perfil.disciplines.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Aún no tienes disciplinas registradas.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {perfil.disciplines.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-semibold capitalize">{d.discipline}</span>
                <span className="badge badge-gold">{d.currentGrade ?? 'Sin grado'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Por qué aquí ya no hay tarjeta de «Configuración» ───────────────
          Porque el botón está arriba, en la cabecera, y tenerlo también abajo
          eran DOS botones para el mismo sitio en la misma pantalla. Se
          reportó tal cual: «en perfil dejas el botón de configuración dos
          veces». El de la cabecera se queda porque es donde vive la navegación
          de esta pantalla —al lado de «Mis aplicaciones»— y porque se ve sin
          desplazarse.

          Lo que se fue de aquí (contraseña, sesiones, tema, idioma y hora)
          está en `app/configuracion/page.tsx`. */}
    </main>
  );
}
