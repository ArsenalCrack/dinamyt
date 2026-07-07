'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { obtenerToken, extraerError } from '@/lib/api';
import {
  soloLetras,
  soloTelefono,
  limitesFechaNacimiento,
  PARENTESCOS,
  TIPOS_SANGRE,
  CINTURONES_GRADO,
} from '@/lib/validacion';
import { Avatar } from '@/components/Avatar';

interface PerfilMiembro {
  id: string;
  email: string;
  fullName: string;
  documentId: string;
  phone: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  bloodType: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string | null;
  disciplines: { id: string; discipline: string; currentGrade: string | null }[];
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

  const [form, setForm] = useState({
    fullName: '',
    birthDate: '',
    phone: '',
    bloodType: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    medicalNotes: '',
  });
  const [cinturon, setCinturon] = useState('');

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
        phone: p.phone ?? '',
        bloodType: p.bloodType ?? '',
        emergencyContactName: p.emergencyContactName ?? '',
        emergencyContactPhone: p.emergencyContactPhone ?? '',
        emergencyContactRelationship: p.emergencyContactRelationship ?? '',
        medicalNotes: p.medicalNotes ?? '',
      });
      setCinturon(p.disciplines?.[0]?.currentGrade ?? '');
    } catch (e) {
      setError(
        extraerError(e, 'No se pudo cargar el perfil (¿gestionas a esta persona?).'),
      );
    }
  }, [router, userId]);

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
        fullName: form.fullName.trim().toLocaleUpperCase('es'),
        birthDate: form.birthDate || null,
        phone: form.phone || null,
        bloodType: form.bloodType || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null,
        medicalNotes: form.medicalNotes || null,
      });
      // Promoción de cinturón (disciplina Hapkido) si cambió.
      if (cinturon && cinturon !== (perfil.disciplines?.[0]?.currentGrade ?? '')) {
        await api.put(`/users/${perfil.id}/disciplines`, {
          discipline: perfil.disciplines?.[0]?.discipline ?? 'hapkido',
          currentGrade: cinturon,
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
        <Avatar src={perfil.avatarUrl} nombre={perfil.fullName} size={64} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1">Edición del staff</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
            {perfil.fullName}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {perfil.email} · Documento {perfil.documentId}
          </p>
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
              onChange={(e) =>
                setForm({ ...form, fullName: soloLetras(e.target.value).toLocaleUpperCase('es') })
              }
              required
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Fecha de nacimiento</span>
            <input
              className="mt-1"
              type="date"
              value={form.birthDate}
              min={fechas.min}
              max={fechas.max}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Tipo de sangre</span>
            <select
              className="mt-1 w-full"
              value={form.bloodType}
              onChange={(e) => setForm({ ...form, bloodType: e.target.value })}
            >
              <option value="">— Selecciona —</option>
              {TIPOS_SANGRE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Cinturón (promoción)</span>
            <select
              className="mt-1 w-full"
              value={cinturon}
              onChange={(e) => setCinturon(e.target.value)}
            >
              <option value="">— Sin grado —</option>
              {cinturon && !CINTURONES_GRADO.includes(cinturon as never) && (
                <option value={cinturon}>{cinturon}</option>
              )}
              {CINTURONES_GRADO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Teléfono</span>
            <input
              className="mt-1"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: soloTelefono(e.target.value) })}
            />
          </label>
        </div>

        <h2 className="mt-2 text-lg font-semibold">Contacto de emergencia</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Nombre</span>
            <input
              className="mt-1"
              value={form.emergencyContactName}
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
              onChange={(e) =>
                setForm({ ...form, emergencyContactPhone: soloTelefono(e.target.value) })
              }
            />
          </label>
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
            Notas médicas (se guardan cifradas)
          </span>
          <textarea
            className="mt-1"
            rows={3}
            value={form.medicalNotes}
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
