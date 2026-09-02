'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  olvideContrasenaAPI,
  resetearContrasenaAPI,
  extraerError,
} from '@/lib/api';
import {
  CODIGO_DIGITOS,
  PROPS_CORREO,
  validarCorreo,
  validarContrasena,
} from '@/lib/validacion';
import { CampoContrasena } from '@/components/CampoContrasena';
import { CampoCodigo } from '@/components/CampoCodigo';
import { Campo } from '@/components/Campo';
import { MedidorContrasena } from '@/components/MedidorContrasena';

/**
 * Recuperar la contraseña.
 *
 * ── Por qué esta pantalla es nueva ──
 *
 * `POST /auth/forgot-password` y `POST /auth/reset-password` existían en la API
 * desde el principio y estaban terminados. Lo que no existía era la pantalla:
 * en el portal, en Membresías, en Campeonatos y en Academy, **ninguna de las
 * cuatro tenía un enlace de «¿olvidaste tu contraseña?»**. Los mensajes de
 * error del propio servidor lo mencionaban entre comillas —«usa "¿Olvidaste tu
 * contraseña?"»— y mandaban a un sitio que no estaba. Quien no recordaba su
 * clave tenía que escribirle a un administrador.
 *
 * ── Los tres pasos, en una sola dirección ──
 *
 * Los pasos son estado y NO rutas distintas, a propósito. Con tres rutas, el
 * botón «atrás» del navegador vuelve al paso 1 con el código ya gastado, o
 * peor: recarga el paso 2 sin el correo y deja un formulario que no puede
 * funcionar. Aquí atrás sale de la recuperación entera, que es lo que quiere
 * quien lo pulsa, y para retroceder un paso está el enlace de «cambiar el
 * correo», que además vuelve a mandar el código.
 */
export default function RecuperarPage() {
  return (
    <Suspense fallback={null}>
      <Recuperar />
    </Suspense>
  );
}

function Recuperar() {
  const router = useRouter();
  const params = useSearchParams();

  const [paso, setPaso] = useState<'correo' | 'codigo' | 'listo'>('correo');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState(0);

  // Si se llega desde el login, el correo ya escrito viaja en la dirección: no
  // hace falta volver a teclearlo en un celular.
  useEffect(() => {
    const traido = params.get('email');
    if (traido) setEmail(traido);
  }, [params]);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const correoValido = validarCorreo(email);
  const claveValida = validarContrasena(clave, [email]);
  const coinciden = clave === repetida;

  async function pedirCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setTocado((t) => ({ ...t, email: true }));
    if (!correoValido.ok) return;

    setCargando(true);
    try {
      const r = await olvideContrasenaAPI(correoValido.valor);
      // La respuesta es la MISMA exista o no la cuenta —si no, este formulario
      // sería una lista de quién tiene cuenta en DINAMYT—, así que se pasa al
      // paso siguiente en los dos casos. Quien escribió un correo que no
      // existe se entera al escribir el código, que es donde toca.
      setAviso(r.message);
      setPaso('codigo');
      setEspera(60);
    } catch (err) {
      setError(extraerError(err, 'No se pudo enviar el código.'));
    } finally {
      setCargando(false);
    }
  }

  async function cambiar(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setTocado((t) => ({ ...t, code: true, clave: true, repetida: true }));

    if (code.replace(/\D/g, '').length !== CODIGO_DIGITOS) {
      setError(`El código son ${CODIGO_DIGITOS} dígitos.`);
      return;
    }
    if (!claveValida.ok) return;
    if (!coinciden) return;

    setCargando(true);
    try {
      await resetearContrasenaAPI(email.trim().toLowerCase(), code, clave);
      setPaso('listo');
    } catch (err) {
      setError(extraerError(err, 'No se pudo cambiar la contraseña.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="display text-xl" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>

      <div className="card w-full max-w-sm p-6">
        {paso === 'correo' && (
          <form onSubmit={pedirCodigo} noValidate>
            <h1 className="display mb-1 text-2xl">¿Olvidaste tu contraseña?</h1>
            <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              Escribe el correo de tu cuenta y te enviamos un código de{' '}
              {CODIGO_DIGITOS} dígitos para elegir una nueva.
            </p>

            <Campo
              etiqueta="Correo"
              htmlFor="rec-correo"
              error={tocado.email && !correoValido.ok ? correoValido.error : null}
            >
              <input
                id="rec-correo"
                {...PROPS_CORREO}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTocado((t) => ({ ...t, email: true }))}
                autoComplete="username"
                placeholder="tucorreo@gmail.com"
              />
            </Campo>

            {error && (
              <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={cargando} className="btn btn-cta w-full">
              {cargando ? 'Enviando…' : 'Enviarme el código'}
            </button>
            <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/login" style={{ color: 'var(--gold)' }}>
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}

        {paso === 'codigo' && (
          <form onSubmit={cambiar} noValidate>
            <h1 className="display mb-1 text-2xl">Elige tu nueva contraseña</h1>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              Si <b style={{ color: 'var(--text)' }}>{email}</b> tiene una cuenta
              de DINAMYT, ahí está el código. Vence en 10 minutos.
            </p>

            <label className="mb-2 block text-sm">Código</label>
            <CampoCodigo valor={code} onChange={setCode} autoFocus />

            <div className="mt-5">
              <Campo
                etiqueta="Nueva contraseña"
                htmlFor="rec-clave"
                error={tocado.clave && !claveValida.ok ? claveValida.error : null}
              >
                <CampoContrasena
                  id="rec-clave"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onBlur={() => setTocado((t) => ({ ...t, clave: true }))}
                  autoComplete="new-password"
                  maxLength={72}
                />
              </Campo>
              <div className="-mt-2 mb-4">
                <MedidorContrasena clave={clave} />
              </div>

              <Campo
                etiqueta="Repítela"
                error={
                  tocado.repetida && repetida && !coinciden
                    ? 'Las dos contraseñas no coinciden.'
                    : null
                }
                ok={repetida && coinciden && claveValida.ok ? 'Coinciden.' : null}
              >
                <CampoContrasena
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  onBlur={() => setTocado((t) => ({ ...t, repetida: true }))}
                  autoComplete="new-password"
                  maxLength={72}
                />
              </Campo>
            </div>

            {error && (
              <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            {aviso && !error && (
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {aviso}
              </p>
            )}

            <button type="submit" disabled={cargando} className="btn btn-cta w-full">
              {cargando ? 'Guardando…' : 'Cambiar mi contraseña'}
            </button>

            <button
              type="button"
              onClick={() => void pedirCodigo()}
              disabled={cargando || espera > 0}
              className="btn btn-outline mt-3 w-full"
            >
              {espera > 0 ? `Reenviar el código (${espera} s)` : 'Reenviar el código'}
            </button>

            {/* Retroceder un paso SIN tocar el historial del navegador. */}
            <p className="mt-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              ¿Ese no es tu correo?{' '}
              <button
                type="button"
                className="underline"
                style={{ color: 'var(--gold)' }}
                onClick={() => {
                  setPaso('correo');
                  setCode('');
                  setError(null);
                  setAviso(null);
                }}
              >
                Cambiarlo
              </button>
            </p>
          </form>
        )}

        {paso === 'listo' && (
          <div>
            <h1 className="display mb-1 text-2xl">Listo</h1>
            <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              Tu contraseña quedó cambiada. Con ella entras a todo DINAMYT:
              Membresías, Campeonatos y Academy.
            </p>
            <button
              type="button"
              onClick={() => router.replace(`/login?email=${encodeURIComponent(email)}`)}
              className="btn btn-cta w-full"
            >
              Iniciar sesión
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
