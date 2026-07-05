'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  extraerError,
} from '@/lib/api';

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
  disciplines: Disciplina[];
  guardians: Acudiente[];
}

/**
 * Mi perfil — la persona ÚNICA del ecosistema. Lo que se edita aquí lo ven
 * todas las apps (Campeonatos, Membresías, Academy). El correo y el documento
 * no se editan (identidad); el grado/cinturón lo promueve el maestro.
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

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    setGuardando(true);
    setError('');
    setOk('');
    try {
      await api.patch(`/users/${perfil.id}/profile`, {
        fullName: form.fullName,
        phone: form.phone || null,
        birthDate: form.birthDate || null,
        avatarUrl: form.avatarUrl || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null,
        medicalNotes: form.medicalNotes || null,
      });
      setOk('Perfil guardado. Los cambios se ven en todas las aplicaciones.');
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
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
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

      {/* ── Datos de la persona ── */}
      <form onSubmit={guardar} className="card flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">Datos personales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {campo('Nombre completo', form.fullName, (v) => setForm({ ...form, fullName: v }), { required: true })}
          {campo('Teléfono', form.phone, (v) => setForm({ ...form, phone: v }), { type: 'tel' })}
          {campo('Fecha de nacimiento', form.birthDate, (v) => setForm({ ...form, birthDate: v }), { type: 'date' })}
          {campo('Foto (URL)', form.avatarUrl, (v) => setForm({ ...form, avatarUrl: v }), {
            type: 'url',
            placeholder: 'https://…',
          })}
        </div>

        <h2 className="mt-2 text-lg font-semibold">Contacto de emergencia</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {campo('Nombre', form.emergencyContactName, (v) => setForm({ ...form, emergencyContactName: v }))}
          {campo('Teléfono', form.emergencyContactPhone, (v) => setForm({ ...form, emergencyContactPhone: v }), { type: 'tel' })}
          {campo('Parentesco', form.emergencyContactRelationship, (v) =>
            setForm({ ...form, emergencyContactRelationship: v }),
          )}
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

      {/* ── Cambiar contraseña ── */}
      <form onSubmit={cambiarPassword} className="card mt-4 flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
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
