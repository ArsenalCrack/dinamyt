'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ponerContrasenaAPI, extraerError } from '@/lib/api';
import { CampoContrasena } from '@/components/CampoContrasena';
import { Campo } from '@/components/Campo';
import { MedidorContrasena } from '@/components/MedidorContrasena';
import { validarContrasena } from '@/lib/validacion';

/**
 * Donde aterriza el enlace de invitación del maestro (camino B, §2.1).
 *
 * La cuenta ya existe y no tiene contraseña. Abrir este enlace ES la prueba de
 * que el correo es de quien dice ser, así que poner la contraseña deja además
 * el correo verificado: no hay un segundo código que pedir.
 */
function PonerContrasena() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Las MISMAS reglas que el registro y que el servidor, y enseñadas igual: con
  // el medidor delante. Aquí se decía «mín. 8 caracteres» y se rechazaba
  // después, que es la peor forma de pedir una contraseña.
  const claveValida = validarContrasena(clave);
  const coinciden = clave === repetida;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTocado({ clave: true, repetida: true });

    if (!claveValida.ok || !coinciden) return;

    setCargando(true);
    try {
      await ponerContrasenaAPI(token, clave);
      setListo(true);
    } catch (err) {
      setError(
        extraerError(err, 'No se pudo guardar la contraseña. Pídele a tu club que te invite otra vez.'),
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Pon tu contraseña
        </h1>

        {!token ? (
          <div>
            <p className="mb-4 text-sm">
              Este enlace está incompleto. Ábrelo tal cual te llegó, sin recortarlo.
            </p>
            <Link href="/login" className="text-sm underline">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : listo ? (
          <div>
            <p className="mb-4">
              Listo. Tu cuenta de DINAMYT ya es tuya: entra con tu correo y esta
              contraseña.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-lg px-4 py-2 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              Tu club ya creó tu cuenta. Elige una contraseña y con ella entras a
              todo DINAMYT.
            </p>

            {/* El mismo ojo que el login, Membresías y Campeonatos, en vez de
                la casilla «ver lo que escribo» que solo existía aquí (ver
                OPERAR.md §4.9). Cada campo lleva el suyo: quien se
                equivoca al repetirla necesita mirar ESA, no las dos. */}
            <Campo
              etiqueta="Contraseña"
              htmlFor="nueva-clave"
              error={tocado.clave && !claveValida.ok ? claveValida.error : null}
            >
              <CampoContrasena
                id="nueva-clave"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onBlur={() => setTocado((t) => ({ ...t, clave: true }))}
                autoComplete="new-password"
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
              />
            </Campo>

            {error && (
              <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg px-4 py-2 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              {cargando ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function PonerContrasenaPage() {
  // `useSearchParams` obliga a un límite de Suspense para que la página se
  // pueda pre-renderizar en el build.
  return (
    <Suspense fallback={null}>
      <PonerContrasena />
    </Suspense>
  );
}
