'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  verifyEmailAPI,
  reenviarCodigoAPI,
  obtenerRegistroPendiente,
  guardarRegistroPendiente,
  olvidarRegistroPendiente,
  guardarToken,
  extraerError,
  type RegistroEnEspera,
} from '@/lib/api';
import { CODIGO_DIGITOS, PROPS_CORREO, validarCorreo } from '@/lib/validacion';
import { CampoCodigo } from '@/components/CampoCodigo';
import { Campo } from '@/components/Campo';

/**
 * Confirmar el correo. **Aquí es donde nace la cuenta.**
 *
 * ── Lo que había, y por qué no servía ──
 *
 * La pantalla pedía dos cosas: «ID de usuario» y «Código». El id es un UUID
 * interno que no significa nada para quien lo lee, que nadie sabe de dónde
 * sacar si se pierde, y que además ya no existe —la cuenta no se crea hasta
 * que el código se teclea—. Y del correo no decía nada: ni a cuál se mandó, ni
 * cuántos dígitos tiene el código, ni cuánto dura.
 *
 * ── Lo que dice ahora, en este orden ──
 *
 * 1. **A QUÉ correo fue.** Es el dato que resuelve el 90 % de los «no me llegó
 *    nada»: casi siempre está mal escrito, y hasta que no se ve escrito no se
 *    nota.
 * 2. **Cuántos dígitos son** — sin decirlo: seis casillas (`CampoCodigo`).
 * 3. **Cuánto queda.** El registro caduca, y un plazo que corre a la vista es
 *    lo que distingue «espera un momento» de «esto ya no sirve».
 * 4. **Qué hacer si no llega**: reenviar (con su espera) o volver a empezar con
 *    otro correo.
 *
 * ── El «volver atrás» ──
 *
 * Se llega aquí con `router.replace`, así que atrás NO devuelve al formulario
 * ya enviado. Y al terminar se vuelve a hacer `replace` al panel: sin eso,
 * atrás traería de vuelta esta pantalla con un código ya gastado y el error
 * «ese código no es» sobre una cuenta que se acaba de crear bien.
 */
export default function VerificarPage() {
  const router = useRouter();

  /** El registro que espera. `undefined` mientras no se ha mirado. */
  const [pendiente, setPendiente] = useState<RegistroEnEspera | null | undefined>(
    undefined,
  );
  /** Correo tecleado a mano, para quien llega aquí sin el registro guardado. */
  const [correoAMano, setCorreoAMano] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  /** Segundos que faltan para poder pedir otro código. */
  const [espera, setEspera] = useState(0);
  /** Segundos que le quedan de vida al registro. */
  const [restante, setRestante] = useState<number | null>(null);

  // Evita que el envío automático (al completar las seis casillas) dispare dos
  // veces con el mismo código: sin esto, un re-render en vuelo lo reintenta y
  // el segundo intento cuenta como código fallado.
  const enviando = useRef(false);

  useEffect(() => {
    setPendiente(obtenerRegistroPendiente());
  }, []);

  // El reloj: uno solo para las dos cuentas atrás.
  useEffect(() => {
    const t = setInterval(() => {
      setEspera((s) => (s > 0 ? s - 1 : 0));
      if (pendiente?.expiresAt) {
        const quedan = Math.max(
          0,
          Math.floor((new Date(pendiente.expiresAt).getTime() - Date.now()) / 1000),
        );
        setRestante(quedan);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pendiente]);

  const correo = pendiente?.email ?? '';

  async function verificar(codigo: string) {
    if (enviando.current) return;
    let email = correo;
    if (!email) {
      const escrito = validarCorreo(correoAMano);
      if (!escrito.ok) {
        setError(escrito.error);
        return;
      }
      email = escrito.valor;
    }

    enviando.current = true;
    setError(null);
    setCargando(true);
    try {
      const res = await verifyEmailAPI(email, codigo);
      olvidarRegistroPendiente();
      if (res.access_token) {
        // La cuenta acaba de nacer y el correo quedó demostrado: se entra sin
        // volver a pedir la contraseña que se acaba de elegir.
        guardarToken(res.access_token);
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (err) {
      setError(extraerError(err, 'Código inválido o expirado.'));
      setCode('');
      setCargando(false);
      enviando.current = false;
    }
  }

  async function reenviar() {
    setError(null);
    setAviso(null);
    setReenviando(true);
    try {
      const r = await reenviarCodigoAPI(correo || correoAMano.trim().toLowerCase());
      const datos = {
        email: r.email,
        expiresAt: r.expiresAt,
        enviado: r.enviado,
      };
      guardarRegistroPendiente(datos);
      setPendiente(datos);
      setEspera(60);
      setCode('');
      setAviso(r.message);
    } catch (err) {
      setError(extraerError(err, 'No se pudo reenviar el código.'));
    } finally {
      setReenviando(false);
    }
  }

  const reloj = (seg: number) =>
    `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

  // ── Sin registro guardado ──────────────────────────────────────────────
  //
  // Pasa de verdad: se abre el enlace en otro navegador, se limpia el
  // almacenamiento, o pasaron los veinte minutos. Antes esto era un campo
  // «ID de usuario» vacío, que no había forma de rellenar. Ahora se pide lo
  // único que la persona sí sabe: su correo.
  const sinRegistro = pendiente === null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Confirma tu correo
        </h1>

        {pendiente === undefined ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Un momento…
          </p>
        ) : (
          <>
            {sinRegistro ? (
              <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                Escribe el correo al que te llegó el código de{' '}
                {CODIGO_DIGITOS} dígitos.
              </p>
            ) : (
              <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                Te enviamos un código de {CODIGO_DIGITOS} dígitos a{' '}
                <b style={{ color: 'var(--text)' }}>{correo}</b>. Escríbelo aquí
                para crear tu cuenta.
              </p>
            )}

            {/* Sin proveedor de correo, el código no salió a ningún sitio. Se
                dice, en vez de dejar a alguien esperando: es un estado válido
                del servidor (ver MailerService), no una avería. */}
            {pendiente?.enviado === false && (
              <p
                className="mb-4 rounded-lg border p-3 text-xs"
                style={{ borderColor: 'var(--gold-dim)', background: 'var(--gold-soft)' }}
              >
                Este servidor todavía no tiene el correo configurado, así que el
                código no salió. Pídeselo a un administrador de DINAMYT.
              </p>
            )}

            {sinRegistro && (
              <Campo etiqueta="Tu correo">
                <input
                  {...PROPS_CORREO}
                  value={correoAMano}
                  onChange={(e) => setCorreoAMano(e.target.value)}
                  autoComplete="email"
                  placeholder="tucorreo@gmail.com"
                />
              </Campo>
            )}

            <label className="mb-2 block text-sm">Código</label>
            <CampoCodigo
              valor={code}
              onChange={setCode}
              onCompleto={verificar}
              error={Boolean(error)}
              autoFocus={!sinRegistro}
              disabled={cargando}
            />

            {restante !== null && !sinRegistro && (
              <p
                className="mt-3 text-center text-xs"
                style={{ color: restante === 0 ? 'var(--danger)' : 'var(--text-muted)' }}
              >
                {restante > 0
                  ? `El código vence en ${reloj(restante)}.`
                  : 'El código venció. Pide uno nuevo.'}
              </p>
            )}

            {error && (
              <p className="mt-3 text-center text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            {aviso && !error && (
              <p className="mt-3 text-center text-sm" style={{ color: 'var(--ok)' }}>
                {aviso}
              </p>
            )}

            <button
              type="button"
              onClick={() => verificar(code)}
              disabled={cargando || code.replace(/\D/g, '').length !== CODIGO_DIGITOS}
              className="btn btn-cta mt-4 w-full"
            >
              {cargando ? 'Comprobando…' : 'Confirmar y crear mi cuenta'}
            </button>

            <button
              type="button"
              onClick={reenviar}
              disabled={reenviando || espera > 0}
              className="btn btn-outline mt-3 w-full"
            >
              {espera > 0
                ? `Reenviar el código (${espera} s)`
                : reenviando
                  ? 'Enviando…'
                  : 'No me llegó: reenviar el código'}
            </button>

            <p className="mt-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Revisa también la carpeta de correo no deseado. ¿Escribiste mal tu
              correo?{' '}
              {/* Empezar de nuevo BORRA el registro guardado: si no, al volver
                  a /verificar reaparecería el correo viejo. */}
              <Link
                href="/registro"
                onClick={olvidarRegistroPendiente}
                style={{ color: 'var(--gold)' }}
              >
                Vuelve a registrarte
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
