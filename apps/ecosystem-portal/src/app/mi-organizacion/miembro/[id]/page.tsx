'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { obtenerToken, extraerError } from '@/lib/api';
import {
  soloLetras,
  soloTelefono,
  limitesFechaNacimiento,
  comprimirAvatar,
  hoyISO,
  PARENTESCOS,
  TIPOS_SANGRE,
  CINTURONES_GRADO,
  GENEROS,
  LIM,
} from '@/lib/validacion';
import { Avatar } from '@/components/Avatar';
import { CampoFecha } from '@/components/CampoFecha';
import { SelectMenu } from '@/components/SelectMenu';

interface PerfilMiembro {
  id: string;
  email: string;
  fullName: string;
  documentId: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  avatarUrl: string | null;
  bloodType: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string | null;
  disciplines: {
    id: string;
    discipline: string;
    currentGrade: string | null;
    /** Desde cuándo entrena. Va impresa en su carnet de Membresías. */
    since: string | null;
  }[];
}

/**
 * EDITOR DE PERFIL DE UN MIEMBRO — exclusivo del maestro del club y los
 * administradores: aquí se corrigen los datos que el propio usuario NO puede
 * tocar (nombre, fecha de nacimiento), se registra el tipo de sangre y se
 * promueve el cinturón. La API rechaza estos cambios si quien pide no
 * gestiona a la persona.
 */
export default function EditarMiembroPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [perfil, setPerfil] = useState<PerfilMiembro | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** La foto tiene su propio «guardando»: se manda sola, sin el formulario. */
  const [foto, setFoto] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    birthDate: '',
    gender: '',
    phone: '',
    bloodType: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    medicalNotes: '',
  });
  const [cinturon, setCinturon] = useState('');
  /**
   * Desde cuándo entrena.
   *
   * Vive con el cinturón porque es la misma fila (`user_disciplines`) y el
   * mismo gesto: los dos los pone el maestro y los dos van impresos en el
   * carnet. Antes se editaba en Membresías, que es donde se imprime, y por eso
   * el maestro tenía que acordarse de que ESE dato —y solo ese— se corregía en
   * la otra app.
   */
  const [desde, setDesde] = useState('');

  const fechas = limitesFechaNacimiento();

  const cargar = useCallback(async () => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    try {
      const res = await api.get(`/users/${userId}/profile`);
      const p = res.data as PerfilMiembro;
      setPerfil(p);
      setForm({
        fullName: p.fullName ?? '',
        birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
        gender: p.gender ?? '',
        phone: p.phone ?? '',
        bloodType: p.bloodType ?? '',
        emergencyContactName: p.emergencyContactName ?? '',
        emergencyContactPhone: p.emergencyContactPhone ?? '',
        emergencyContactRelationship: p.emergencyContactRelationship ?? '',
        medicalNotes: p.medicalNotes ?? '',
      });
      setCinturon(p.disciplines?.[0]?.currentGrade ?? '');
      setDesde(p.disciplines?.[0]?.since?.slice(0, 10) ?? '');
    } catch (e) {
      setError(
        extraerError(e, 'No se pudo cargar el perfil (¿gestionas a esta persona?).'),
      );
    }
  }, [router, userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * La foto del alumno, puesta por su maestro.
   *
   * ── Por qué la pone el maestro y no solo el alumno ──
   *
   * La foto va impresa en el carnet, y el carnet lo expide el club. El alumno
   * de ocho años no tiene ni cuenta de correo propia, y el de cuarenta sube la
   * que le gusta, no la que sirve para reconocerlo en la puerta. Aquí se sube
   * en el mismo sitio donde ya se le corrige el nombre y se le promueve el
   * cinturón.
   *
   * Se guarda al elegirla, sin esperar al botón del formulario: nadie espera
   * tener que confirmar una foto que ya se está viendo puesta. `null` la
   * quita, que es lo que hace falta cuando la que hay está mal recortada o es
   * de otra persona.
   */
  async function guardarFoto(avatarUrl: string | null) {
    if (!perfil) return;
    setFoto(true);
    setError('');
    setOk('');
    try {
      await api.patch(`/users/${perfil.id}/profile`, { avatarUrl });
      await cargar();
      setOk(avatarUrl ? 'Foto guardada.' : 'Foto quitada.');
    } catch (e) {
      setError(extraerError(e, 'No se pudo guardar la foto.'));
    } finally {
      setFoto(false);
    }
  }

  /** Del archivo del dispositivo a un cuadrado pequeño listo para guardar. */
  async function elegirFoto(file: File | undefined) {
    if (!file) return;
    try {
      await guardarFoto(await comprimirAvatar(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    setGuardando(true);
    setError('');
    setOk('');
    try {
      await api.patch(`/users/${perfil.id}/profile`, {
        fullName: form.fullName.trim().toLocaleUpperCase('es'),
        birthDate: form.birthDate || null,
        gender: form.gender || null,
        phone: form.phone || null,
        bloodType: form.bloodType || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null,
        medicalNotes: form.medicalNotes || null,
      });
      // Cinturón y antigüedad viven en la misma fila (`user_disciplines`), así
      // que viajan juntos y en un solo viaje. Se manda si cambió cualquiera de
      // los dos: `null` borra la fecha, que es lo que hace falta cuando se
      // puso mal.
      const disciplinaActual = perfil.disciplines?.[0];
      if (
        cinturon !== (disciplinaActual?.currentGrade ?? '') ||
        desde !== (disciplinaActual?.since?.slice(0, 10) ?? '')
      ) {
        await api.put(`/users/${perfil.id}/disciplines`, {
          discipline: disciplinaActual?.discipline ?? 'hapkido',
          currentGrade: cinturon || null,
          since: desde || null,
        });
      }
      setOk('Perfil guardado.');
      await cargar();
    } catch (e2) {
      setError(extraerError(e2, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  if (!perfil) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <Link href="/mi-organizacion" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Mi organización
        </Link>
        <p className="mt-4" style={{ color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
          {error || 'Cargando el perfil…'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/mi-organizacion" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Mi organización
      </Link>

      <header className="card mt-3 mb-4 flex flex-wrap items-center gap-4 p-5">
        <Avatar src={perfil.avatarUrl} nombre={perfil.fullName} size={72} ampliable />
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1">Edición del staff</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
            {perfil.fullName}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {perfil.email} · Documento {perfil.documentId}
          </p>
          {/* La foto, aquí y no dentro del formulario: se guarda sola al
              elegirla, así que un botón «Guardar cambios» al lado solo
              confundiría sobre qué falta por guardar. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label
              className="btn btn-outline btn-sm cursor-pointer"
              style={foto ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
            >
              {foto ? 'Guardando…' : perfil.avatarUrl ? 'Cambiar foto' : 'Subir foto'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={foto}
                onChange={(e) => {
                  void elegirFoto(e.target.files?.[0]);
                  // Se vacía para que elegir DOS veces el mismo archivo
                  // vuelva a disparar el `change` (si no, el segundo intento
                  // tras un fallo no hace nada).
                  e.target.value = '';
                }}
              />
            </label>
            {perfil.avatarUrl && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={foto}
                onClick={() => void guardarFoto(null)}
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>
      </header>

      <form onSubmit={guardar} className="card flex flex-col gap-4 p-5">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Como maestro/administrador puedes corregir aquí lo que la persona no
          puede tocar por su cuenta: su nombre, su fecha de nacimiento, su tipo
          de sangre y su cinturón.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Nombre completo</span>
            <input
              className="mt-1"
              value={form.fullName}
              maxLength={LIM.nombrePersona}
              onChange={(e) =>
                setForm({ ...form, fullName: soloLetras(e.target.value).toLocaleUpperCase('es') })
              }
              required
            />
          </label>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Fecha de nacimiento</span>
            <div className="mt-1">
              <CampoFecha
                valor={form.birthDate}
                onChange={(v) => setForm({ ...form, birthDate: v })}
                min={fechas.min}
                max={fechas.max}
                etiquetaAria="Fecha de nacimiento"
              />
            </div>
          </div>
          {/* Los cuatro desplegables de esta ficha van con el del ecosistema
              (`SelectMenu`), el mismo de Membresías y Campeonatos. Eran los
              últimos `<select>` nativos del panel del maestro: se pintaban con
              los colores del sistema operativo —gris, distinto en cada
              navegador, y en Android con su propia hoja a pantalla completa—
              dentro de una ficha que no es nada de eso. */}
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Género</span>
            {/* Aquí SÍ se puede corregir: es el maestro. En el perfil de la
                persona el campo se cierra una vez puesto. */}
            <div className="mt-1">
              <SelectMenu
                valor={form.gender}
                onChange={(v) => setForm({ ...form, gender: v })}
                opciones={GENEROS.map((g) => ({
                  valor: g.valor,
                  etiqueta: g.etiqueta,
                }))}
                etiquetaAria="Género"
                placeholder="— Sin registrar —"
              />
            </div>
          </div>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Tipo de sangre</span>
            <div className="mt-1">
              <SelectMenu
                valor={form.bloodType}
                onChange={(v) => setForm({ ...form, bloodType: v })}
                opciones={TIPOS_SANGRE.map((t) => ({ valor: t, etiqueta: t }))}
                etiquetaAria="Tipo de sangre"
                placeholder="— Selecciona —"
              />
            </div>
          </div>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Cinturón (promoción)</span>
            <div className="mt-1">
              {/* El grado que ya lleva la persona va SIEMPRE en la lista,
                  aunque no esté en el catálogo: un desplegable cuyo valor no
                  está entre sus opciones no se queda vacío, enseña la primera
                  — y quien mira cree que ese es su cinturón. */}
              <SelectMenu
                valor={cinturon}
                onChange={setCinturon}
                opciones={[
                  ...(cinturon && !CINTURONES_GRADO.includes(cinturon as never)
                    ? [{ valor: cinturon, etiqueta: cinturon }]
                    : []),
                  ...CINTURONES_GRADO.map((c) => ({ valor: c, etiqueta: c })),
                ]}
                etiquetaAria="Cinturón"
                placeholder="— Sin grado —"
              />
            </div>
          </div>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Teléfono</span>
            <input
              className="mt-1"
              type="tel"
              inputMode="tel"
              value={form.phone}
              maxLength={LIM.telefono}
              onChange={(e) => setForm({ ...form, phone: soloTelefono(e.target.value) })}
            />
          </label>
          {/* ── Entrena desde ──
              Va pegada al cinturón porque es su misma fila y su mismo gesto. Y
              va aquí, y no en Membresías, porque es un dato de la persona: un
              club que estrena la app trae alumnos con años encima y su cuenta
              es de esta semana. Membresías la imprime en el carnet; la recibe
              del portal como la foto y el grado. */}
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Entrena desde</span>
            <div className="mt-1">
              <CampoFecha
                valor={desde}
                onChange={setDesde}
                min="1950-01-01"
                max={hoyISO()}
                etiquetaAria="Entrena desde"
              />
            </div>
          </div>
        </div>

        <h2 className="mt-2 text-lg font-semibold">Contacto de emergencia</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Nombre</span>
            <input
              className="mt-1"
              value={form.emergencyContactName}
              maxLength={LIM.nombrePersona}
              onChange={(e) =>
                setForm({ ...form, emergencyContactName: soloLetras(e.target.value) })
              }
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Teléfono</span>
            <input
              className="mt-1"
              type="tel"
              inputMode="tel"
              value={form.emergencyContactPhone}
              maxLength={LIM.telefono}
              onChange={(e) =>
                setForm({ ...form, emergencyContactPhone: soloTelefono(e.target.value) })
              }
            />
          </label>
          <div className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Parentesco</span>
            <div className="mt-1">
              <SelectMenu
                valor={form.emergencyContactRelationship}
                onChange={(v) =>
                  setForm({ ...form, emergencyContactRelationship: v })
                }
                opciones={PARENTESCOS.map((p) => ({ valor: p, etiqueta: p }))}
                etiquetaAria="Parentesco"
                placeholder="— Selecciona —"
              />
            </div>
          </div>
        </div>

        <label className="block text-sm">
          <span style={{ color: 'var(--text-muted)' }}>
            Notas médicas (se guardan cifradas)
          </span>
          <textarea
            className="mt-1"
            rows={3}
            value={form.medicalNotes}
            maxLength={LIM.notasMedicas}
            onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
          />
        </label>

        {error && <p className="msg-error text-sm">{error}</p>}
        {ok && <p className="msg-ok text-sm">{ok}</p>}
        <button type="submit" disabled={guardando} className="btn btn-gold self-start">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </main>
  );
}
