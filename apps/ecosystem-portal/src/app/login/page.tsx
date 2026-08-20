'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  loginAPI,
  guardarToken,
  cerrarSesion,
  sesionActual,
  obtenerToken,
  extraerError,
  type TokenPayload,
} from '@/lib/api';
import { CampoContrasena } from '@/components/CampoContrasena';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL =
  process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

/** Los orígenes a los que se puede devolver una sesión, con su nombre. */
function appsDelEcosistema(): { origen: string; nombre: string }[] {
  const apps = [
    { url: CAMPEONATOS_URL, nombre: 'Campeonatos' },
    { url: MEMBRESIAS_URL, nombre: 'Membresías' },
    { url: ACADEMY_URL, nombre: 'Academy' },
  ];
  return apps.flatMap(({ url, nombre }) => {
    try {
      return [{ origen: new URL(url).origin, nombre }];
    } catch {
      return [];
    }
  });
}

/**
 * SSO por redirección: una app federada manda aquí con `?redirect=<su login>`;
 * tras iniciar sesión se vuelve a esa URL con el token en el FRAGMENTO
 * (`#token=` nunca viaja al servidor). Solo se permite volver a orígenes
 * conocidos del ecosistema — jamás a un dominio arbitrario.
 */
function destinoSeguro(
  redirect: string | null,
): { url: string; nombre: string } | null {
  if (!redirect) return null;
  try {
    const url = new URL(redirect);
    const app = appsDelEcosistema().find((a) => a.origen === url.origin);
    return app ? { url: url.toString(), nombre: app.nombre } : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  /**
   * La sesión que ya estaba abierta al llegar, si es que hay alguna VIVA.
   * `undefined` mientras no se ha mirado (el primer render es del servidor y
   * ahí no existe `localStorage`); `null` cuando no hay ninguna.
   */
  const [abierta, setAbierta] = useState<TokenPayload | null | undefined>(
    undefined,
  );

  const destino = destinoSeguro(search.get('redirect'));

  /**
   * **Nunca se entrega la sesión sola.**
   *
   * Antes, si al llegar aquí había un token guardado y una app lo estaba
   * pidiendo, se devolvía sin más. Eso hacía dos cosas malas a la vez:
   *
   * - Salías de Membresías con tu cuenta, pulsabas «entrar con DINAMYT» y
   *   volvías dentro **con la cuenta de otro** — la que quedó guardada en el
   *   portal—, sin que nada te lo dijera.
   * - Si ese token estaba caducado, la app lo rechazaba y te devolvía al
   *   login, que volvía a encontrarlo y volvía a entregarlo: el bucle.
   *
   * Ahora se mira si la sesión está viva (`obtenerToken` borra las muertas) y,
   * si lo está, se PREGUNTA de quién es antes de entregarla.
   */
  useEffect(() => {
    setAbierta(sesionActual());
  }, []);

  function entregarSesion(token: string) {
    if (destino) {
      window.location.href = `${destino.url}#token=${encodeURIComponent(token)}`;
      return;
    }
    router.push('/dashboard');
  }

  function continuarConLaSesionAbierta() {
    const t = obtenerToken();
    // Pudo caducar entre que se pintó la tarjeta y se pulsó el botón.
    if (!t) {
      setAbierta(null);
      setError('Tu sesión caducó. Vuelve a escribir tu contraseña.');
      return;
    }
    entregarSesion(t);
  }

  function entrarConOtraCuenta() {
    cerrarSesion();
    setAbierta(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token);
      entregarSesion(access_token);
    } catch (err) {
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="display text-xl" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>

      {abierta ? (
        <section className="card w-full max-w-sm p-6">
          <h1 className="display mb-1 text-2xl">Ya hay una sesión abierta</h1>
          <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
            {destino
              ? `${destino.nombre} está pidiendo entrar con tu cuenta DINAMYT.`
              : 'Esta es la cuenta con la que estás dentro ahora mismo.'}
          </p>
          <div
            className="mb-5 rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <p className="font-semibold">{abierta.fullName}</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {abierta.email}
              {abierta.is_super_admin ? ' · Super administrador' : ''}
            </p>
          </div>
          {error && (
            <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={continuarConLaSesionAbierta}
            className="btn btn-cta w-full"
          >
            {destino
              ? `Continuar a ${destino.nombre} como ${primerNombre(abierta.fullName)}`
              : `Continuar como ${primerNombre(abierta.fullName)}`}
          </button>
          <button
            type="button"
            onClick={entrarConOtraCuenta}
            className="btn btn-outline mt-3 w-full"
          >
            Entrar con otra cuenta
          </button>
        </section>
      ) : (
        <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
          <h1 className="display mb-1 text-2xl">Iniciar sesión</h1>
          <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            {destino
              ? `Una cuenta para todo el ecosistema. Al entrar, vuelves a ${destino.nombre}.`
              : 'Una cuenta para todo el ecosistema.'}
          </p>
          <label className="mb-3 block text-sm">
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="mt-1"
            />
          </label>
          <label className="mb-1 block text-sm">
            Contraseña
            {/* El ojo no es un adorno: la mitad de los «no puedo entrar» son una
                letra mal tecleada en un teclado de celular. Es el MISMO
                componente —el mismo dibujo— que Membresías y Campeonatos. */}
            <span className="mt-1 block">
              <CampoContrasena
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </span>
          </label>
          {error && (
            <p className="mb-3 mt-3 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={cargando}
            className="btn btn-cta mt-4 w-full"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
          <p
            className="mt-4 text-center text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            ¿No tienes cuenta?{' '}
            <Link href="/registro" style={{ color: 'var(--gold)' }}>
              Regístrate
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}

/** «Pablo Restrepo» → «Pablo». Para que el botón no se parta en tres líneas. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}
