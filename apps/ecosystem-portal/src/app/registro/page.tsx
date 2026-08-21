'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAPI, guardarUsuarioPendiente, extraerError } from '@/lib/api';
import {
  soloLetras,
  soloDigitos,
  soloTelefono,
  limitesFechaNacimiento,
  GENEROS,
} from '@/lib/validacion';
import { CampoContrasena } from '@/components/CampoContrasena';
import { CampoFecha } from '@/components/CampoFecha';

/**
 * Crear cuenta en DINAMYT.
 *
 * ── Qué se pide y por qué son estos y no otros ──
 *
 * La cuenta es de la PERSONA y la usan las tres apps, así que lo que no se
 * pregunte aquí lo tiene que perseguir después el maestro, alumno por alumno.
 * Al revés, cada campo de más es gente que abandona el formulario. El corte
 * está en «lo que otra app va a necesitar sí o sí»:
 *
 *   · Nombre, correo, contraseña → la cuenta. Sin discusión.
 *   · Documento    → Campeonatos lo usa como identificador natural del atleta
 *                    (`competidores.documento`, único) para no duplicarlo entre
 *                    campeonatos.
 *   · Nacimiento   → Campeonatos arma las categorías por edad; Membresías sabe
 *                    a quién felicitar.
 *   · Género       → Campeonatos separa las llaves. Es el único de los tres que
 *                    el ecosistema NO tenía, y por eso cada inscripción lo
 *                    volvía a preguntar.
 *   · Teléfono     → es como el club contacta a alguien cuando el correo no
 *                    llega, que es la mitad de las veces.
 *
 * Lo que NO se pide aquí, a propósito: cinturón, club, peso, tipo de sangre,
 * contacto de emergencia, foto. Todo eso lo pone el maestro cuando la persona
 * llega a su club — preguntárselo a alguien que aún no entrena a nada sería
 * pedirle datos que todavía no tiene.
 *
 * ── Dos bloques, no una lista de siete ──
 *
 * Siete campos seguidos se leen como un trámite. Separados en «tu cuenta» y
 * «tus datos deportivos», cada uno se lee como una pregunta con sentido.
 */
export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    documentId: '',
    password: '',
    birthDate: '',
    gender: '',
    phone: '',
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Entre 3 y 100 años, el mismo rango que valida el servidor. Sin los topes,
  // el calendario abriría en la década actual y dejaría elegir el año que
  // viene — un error que solo se descubriría al enviar el formulario.
  const fechas = limitesFechaNacimiento();

  // Saneo por campo: el nombre solo letras (y se guarda en MAYÚSCULAS), el
  // documento solo números, el teléfono solo números y separadores. Es más
  // barato impedir que se teclee mal que explicar después por qué no vale.
  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      let v = e.target.value;
      if (k === 'fullName') v = soloLetras(v).toLocaleUpperCase('es');
      if (k === 'documentId') v = soloDigitos(v);
      if (k === 'phone') v = soloTelefono(v);
      setForm({ ...form, [k]: v });
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError('Debes aceptar el tratamiento de datos personales (Ley 1581).');
      return;
    }
    // El calendario propio no es un `<input required>`, así que su hueco no lo
    // detecta el navegador: hay que decirlo aquí o el formulario se envía sin
    // fecha y el error llega del servidor, tarde y en otro sitio de la pantalla.
    if (!form.birthDate) {
      setError('Falta tu fecha de nacimiento.');
      return;
    }
    setCargando(true);
    try {
      const { userId } = await registerAPI({ ...form, dataConsent: consent });
      guardarUsuarioPendiente(userId);
      router.push('/verificar');
    } catch (err) {
      setError(extraerError(err, 'No se pudo crear la cuenta.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="text-xl font-extrabold tracking-wide" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Crear cuenta
        </h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
          Una sola cuenta para Membresías, Campeonatos y Academy.
        </p>

        {/* ── Tu cuenta ─────────────────────────────────────────────────── */}
        <h2 className="eyebrow mb-2">Tu cuenta</h2>
        <label className="mb-3 block text-sm">
          Nombre completo (como en tu documento)
          <input
            value={form.fullName}
            onChange={set('fullName')}
            required
            autoComplete="name"
            placeholder="NOMBRE APELLIDO"
            className="mt-1"
          />
        </label>
        <label className="mb-3 block text-sm">
          Correo
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            autoComplete="email"
            className="mt-1"
          />
        </label>
        <label className="mb-5 block text-sm">
          Contraseña (mín. 8 caracteres)
          {/* El mismo ojo que Membresías y Campeonatos (ver UNA-SOLA-APP.md §2). */}
          <span className="mt-1 block">
            <CampoContrasena
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </span>
        </label>

        {/* ── Tus datos deportivos ──────────────────────────────────────── */}
        <h2 className="eyebrow mb-1">Tus datos deportivos</h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Con esto tu club y tus campeonatos te reconocen sin volver a
          preguntártelo cada vez.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Documento (solo números)
            <input
              value={form.documentId}
              onChange={set('documentId')}
              required
              inputMode="numeric"
              minLength={4}
              maxLength={20}
              placeholder="1000000000"
              className="mt-1"
            />
          </label>
          <label className="block text-sm">
            Teléfono
            <input
              value={form.phone}
              onChange={set('phone')}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="3001112233"
              className="mt-1"
            />
          </label>
          <div className="block text-sm">
            <span>Fecha de nacimiento</span>
            {/* El calendario propio, no el del sistema: el nativo de Android
                solo avanza mes a mes y poner un año de nacimiento cuesta cien
                toques. Ver `components/CampoFecha.tsx`. */}
            <div className="mt-1">
              <CampoFecha
                valor={form.birthDate}
                onChange={(v) => setForm({ ...form, birthDate: v })}
                min={fechas.min}
                max={fechas.max}
                borrable={false}
                placeholder="Elige tu fecha"
                etiquetaAria="Fecha de nacimiento"
              />
            </div>
          </div>
          <label className="block text-sm">
            Género
            <select
              value={form.gender}
              onChange={set('gender')}
              required
              className="mt-1 w-full"
            >
              <option value="">— Selecciona —</option>
              {GENEROS.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label
          className="mb-4 mt-5 flex items-start gap-2 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-auto"
          />
          <span>
            Acepto el tratamiento de mis datos personales según la{' '}
            <Link href="/privacidad" target="_blank" style={{ color: 'var(--gold)' }}>
              política de privacidad
            </Link>{' '}
            (Ley 1581 de 2012).
          </span>
        </label>
        {error && (
          <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={cargando} className="btn btn-cta w-full">
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--gold)' }}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
