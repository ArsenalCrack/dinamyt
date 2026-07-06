'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  extraerError,
} from '@/lib/api';
import {
  soloLetras,
  soloTelefono,
  limitesFechaNacimiento,
  PARENTESCOS,
  comprimirAvatar,
} from '@/lib/validacion';

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
  avatarUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string | null;
  isEmailVerified: boolean | null;
  createdAt: string | null;
  disciplines: Disciplina[];
  guardians: Acudiente[];
}

/**
 * Mi perfil — la persona ÚNICA del ecosistema. Lo que se edita aquí lo ven
 * todas las apps (Campeonatos, Membresías, Academy). El correo y el documento
 * no se editan (identidad); el grado/cinturón lo promueve el maestro.
 * La contraseña SOLO se cambia aquí (las apps no tienen su propio formulario).
 */
export default function PerfilPage() {
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
    avatarUrl: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    medicalNotes: '',
  });

  // Cambio de contraseña.
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [passMsg, setPassMsg] = useState('');

  // Subida de foto.
  const inputFoto = useRef<HTMLInputElement>(null);
  const [fotoMsg, setFotoMsg] = useState('');

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
      const res = await api.get(`/users/${payload.sub}/profile`);
      const p = res.data as Perfil;
      setPerfil(p);
      setForm({
        fullName: p.fullName ?? '',
        phone: p.phone ?? '',
        birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
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
      await api.patch(`/users/${perfil.id}/profile`, {
        fullName: form.fullName.trim().toLocaleUpperCase('es'),
        phone: form.phone || null,
        birthDate: form.birthDate || null,
        avatarUrl: form.avatarUrl || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null,
        medicalNotes: form.medicalNotes || null,
      });
      setOk('Perfil guardado. Los cambios se ven en todas las aplicaciones.');
      setFotoMsg('');
    } catch (e2) {
      setError(extraerError(e2, 'No se pudo guardar el perfil.'));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setPassMsg('');
    try {
      await api.post('/auth/change-password', {
        currentPassword: passActual,
        newPassword: passNueva,
      });
      setPassMsg('Contraseña actualizada.');
      setPassActual('');
      setPassNueva('');
    } catch (e2) {
      setPassMsg(extraerError(e2, 'No se pudo cambiar la contraseña.'));
    }
  }

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

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Una persona, un perfil</p>
          <h1 className="display text-3xl">Mi perfil</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {perfil.email} · Documento {perfil.documentId}
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-outline">
          ← Mis aplicaciones
        </Link>
      </header>

      {/* ── Foto + datos de cuenta ── */}
      <section className="card mb-4 p-5">
        <div className="flex flex-wrap items-center gap-5">
          {form.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.avatarUrl}
              alt="Tu foto de perfil"
              className="h-24 w-24 shrink-0 rounded-full object-cover"
              style={{ border: '2px solid var(--gold)' }}
            />
          ) : (
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-3xl font-extrabold"
              style={{
                background: 'var(--bg-elevated)',
                border: '2px solid var(--gold)',
                color: 'var(--gold)',
              }}
            >
              {perfil.fullName
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Foto de perfil</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Sube una foto desde tu computador o celular. Se recorta al centro
              y se guarda al presionar «Guardar cambios».
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
            <dt style={{ color: 'var(--text-muted)' }}>Correo verificado</dt>
            <dd>
              <span className={`badge ${perfil.isEmailVerified ? 'badge-ok' : ''}`}>
                {perfil.isEmailVerified ? 'Sí' : 'No'}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: 'var(--text-muted)' }}>Miembro desde</dt>
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
        <h2 className="text-lg font-semibold">Datos personales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {campo(
            'Nombre completo (solo letras)',
            form.fullName,
            (v) => setForm({ ...form, fullName: soloLetras(v).toLocaleUpperCase('es') }),
            { required: true, autoComplete: 'name' },
          )}
          {campo(
            'Teléfono (solo números)',
            form.phone,
            (v) => setForm({ ...form, phone: soloTelefono(v) }),
            { type: 'tel', inputMode: 'tel', placeholder: '300 123 4567' },
          )}
          {campo(
            'Fecha de nacimiento',
            form.birthDate,
            (v) => setForm({ ...form, birthDate: v }),
            { type: 'date', min: fechas.min, max: fechas.max },
          )}
        </div>

        <h2 className="mt-2 text-lg font-semibold">Contacto de emergencia</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {campo(
            'Nombre (solo letras)',
            form.emergencyContactName,
            (v) => setForm({ ...form, emergencyContactName: soloLetras(v) }),
          )}
          {campo(
            'Teléfono (solo números)',
            form.emergencyContactPhone,
            (v) => setForm({ ...form, emergencyContactPhone: soloTelefono(v) }),
            { type: 'tel', inputMode: 'tel' },
          )}
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Parentesco</span>
            <select
              className="mt-1 w-full"
              value={form.emergencyContactRelationship}
              onChange={(e) =>
                setForm({ ...form, emergencyContactRelationship: e.target.value })
              }
            >
              <option value="">— Selecciona —</option>
              {PARENTESCOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span style={{ color: 'var(--text-muted)' }}>
            Notas médicas (solo las ve tu maestro; se guardan cifradas)
          </span>
          <textarea
            className="mt-1"
            rows={3}
            value={form.medicalNotes}
            onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
            placeholder="Alergias, condiciones, medicamentos…"
          />
        </label>

        {error && <p className="msg-error text-sm">{error}</p>}
        {ok && <p className="msg-ok text-sm">{ok}</p>}
        <button type="submit" disabled={guardando} className="btn btn-gold self-start">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {/* ── Disciplinas y grado (las promueve el maestro) ── */}
      <section className="card mt-4 p-5">
        <h2 className="text-lg font-semibold">Mis disciplinas y grado</h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          El cinturón lo actualiza tu maestro cuando te promueve.
        </p>
        {perfil.disciplines.length === 0 ? (
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

      {/* ── Cambiar contraseña (ÚNICO lugar del ecosistema) ── */}
      <form onSubmit={cambiarPassword} className="card mt-4 flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
        <p className="-mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Tu contraseña es una sola para todo DINAMYT y solo se cambia aquí.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {campo('Contraseña actual', passActual, setPassActual, {
            type: 'password',
            required: true,
            autoComplete: 'current-password',
          })}
          {campo('Nueva contraseña (mín. 8)', passNueva, setPassNueva, {
            type: 'password',
            required: true,
            minLength: 8,
            autoComplete: 'new-password',
          })}
        </div>
        {passMsg && (
          <p
            className="text-sm"
            style={{ color: passMsg.includes('actualizada') ? 'var(--ok)' : 'var(--danger)' }}
          >
            {passMsg}
          </p>
        )}
        <button type="submit" className="btn btn-outline self-start">
          Actualizar contraseña
        </button>
      </form>
    </main>
  );
}
