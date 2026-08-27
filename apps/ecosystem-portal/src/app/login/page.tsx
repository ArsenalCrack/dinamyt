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
  seRecuerda,
  INACTIVIDAD_MINUTOS,
  type TokenPayload,
} from '@/lib/api';
import { CampoContrasena } from '@/components/CampoContrasena';
import { Campo } from '@/components/Campo';
import { validarCorreo } from '@/lib/validacion';
import { destinoSeguro } from '@/lib/apps';

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
  const [email, setEmail] = useState(search.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const [cargando, setCargando] = useState(false);

  /**
   * ¿Guardar la sesión en este equipo?
   *
   * ── Por qué existe esta casilla ──
   *
   * Hasta ahora el pase iba SIEMPRE a `localStorage`, que sobrevive a cerrar
   * el navegador, a apagar el equipo y a que la persona se vaya a su casa.
   * Quien entraba desde un computador prestado —el de un amigo, el de un
   * locutorio, el del club— dejaba su cuenta abierta ahí y no tenía forma de
   * evitarlo.
   *
   * Sin marcar, el pase vive solo mientras la ventana esté abierta.
   *
   * Empieza marcada porque casi todo el mundo entra desde su propio celular, y
   * desmarcarla ahí sería pedir la contraseña cada vez sin ganar nada. Lo que
   * importa es que en el equipo prestado se PUEDA desmarcar — y que el estado
   * se recuerde, para que quien lo hizo una vez no tenga que acordarse la
   * siguiente.
   */
  const [recordar, setRecordar] = useState(true);
  useEffect(() => setRecordar(seRecuerda()), []);

  /**
   * Por qué se acabó la sesión anterior, si es que se acabó por algo.
   *
   * Lo pone el interceptor de `lib/api.ts` con el mensaje que mandó el
   * servidor. Antes cualquier 401 dejaba a la persona en un login mudo, sin
   * pista de qué había pasado, y eso se lee como «la aplicación me echó sin
   * motivo».
   */
  const motivoDelCierre = search.get('motivo');

  const correo = validarCorreo(email);
  /**
   * ¿El fallo es «tu correo no está verificado»?
   *
   * Solo les pasa a las cuentas creadas antes del registro en dos actos, que
   * quedaron en la base sin confirmar. Su código de verificación caducó hace
   * mucho y no hay forma de reenviárselo —el reenvío es para registros
   * pendientes, y esa cuenta ya existe—, así que el camino bueno es recuperar
   * la contraseña: eso demuestra que el correo es suyo y lo deja verificado de
   * paso. Sin este aviso, esa cuenta es un callejón sin salida.
   */
  const faltaVerificar = Boolean(error && /verificar tu correo/i.test(error));

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

  /**
   * Dónde acaba quien inicia sesión.
   *
   * Con `?redirect=` se devuelve a la app que lo pidió; sin él, al portal.
   * `soloAlPortal` es la escapatoria: **ignora el redirect a propósito**.
   *
   * ── Por qué hace falta una escapatoria ──
   *
   * Sin ella, caer en `/login?redirect=…` era un CALLEJÓN: continuar con la
   * sesión abierta, entrar con otra cuenta o escribir la contraseña acababan
   * los tres aquí, y los tres se iban a la app. No existía forma de llegar al
   * portal — ni siquiera para el que solo quería mirar su perfil—, y el
   * síntoma que se veía era «no me deja entrar a DINAMYT, me manda a
   * Membresías». El enlace queda pegado en el historial y en el botón «entrar
   * con DINAMYT» de la app, así que no es un caso raro: es el normal.
   */
  function entregarSesion(token: string, soloAlPortal = false) {
    if (destino && !soloAlPortal) {
      window.location.href = `${destino.url}#token=${encodeURIComponent(token)}`;
      return;
    }
    router.push('/dashboard');
  }

  function continuarConLaSesionAbierta(soloAlPortal = false) {
    const t = obtenerToken();
    // Pudo caducar entre que se pintó la tarjeta y se pulsó el botón.
    if (!t) {
      setAbierta(null);
      setError('Tu sesión caducó. Vuelve a escribir tu contraseña.');
      return;
    }
    entregarSesion(t, soloAlPortal);
  }

  function entrarConOtraCuenta() {
    // `void`: cerrar en el servidor puede tardar, y la pantalla tiene que
    // cambiar ya. El pase local se borra dentro de `cerrarSesion` antes de
    // salir a la red, así que aquí no queda nada que entregar.
    void cerrarSesion();
    setAbierta(null);
    setError(null);
  }

  /**
   * `soloAlPortal` viaja desde el botón que se pulsó, y NO desde un estado.
   *
   * Con un `useState` el valor lo leería el `onSubmit` de la vuelta siguiente
   * del render —React agrupa las actualizaciones—, así que el primer clic se
   * iría a la app igual. Aquí el formulario tiene dos botones de envío y cada
   * uno dice a dónde va.
   */
  async function entrar(soloAlPortal: boolean) {
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token, recordar);
      entregarSesion(access_token, soloAlPortal);
    } catch (err) {
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTocado(true);
    // Un correo mal escrito se dice aquí y no después de un viaje al servidor
    // que iba a contestar «no existe una cuenta con ese correo» — que es la
    // misma frase para «lo escribiste mal» y para «no tienes cuenta», y son
    // dos cosas muy distintas.
    if (!correo.ok) {
      setError(null);
      return;
    }
    await entrar(false);
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

      {motivoDelCierre && !abierta && (
        <p
          className="w-full max-w-sm rounded-lg border p-3 text-sm"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          {motivoDelCierre}
        </p>
      )}

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
            onClick={() => continuarConLaSesionAbierta()}
            className="btn btn-cta w-full"
          >
            {destino
              ? `Continuar a ${destino.nombre} como ${primerNombre(abierta.fullName)}`
              : `Continuar como ${primerNombre(abierta.fullName)}`}
          </button>
          {/* La salida del embudo. Solo aparece cuando una app está pidiendo la
              sesión: sin `?redirect=` el botón de arriba YA lleva al portal y
              este sería el mismo botón dos veces. */}
          {destino && (
            <button
              type="button"
              onClick={() => continuarConLaSesionAbierta(true)}
              className="btn btn-outline mt-3 w-full"
            >
              Ir a mi cuenta DINAMYT
            </button>
          )}
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
          <Campo
            etiqueta="Correo"
            htmlFor="login-correo"
            error={tocado && !correo.ok ? correo.error : null}
          >
            <input
              id="login-correo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTocado(true)}
              autoComplete="username"
              placeholder="tucorreo@gmail.com"
            />
          </Campo>
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
          {/* El enlace que no existía en ninguna de las cuatro apps, aunque los
              mensajes de error del servidor lo mencionaran por su nombre. Va
              debajo del campo de contraseña, que es donde se busca. El correo
              ya escrito viaja con él: nadie quiere teclearlo dos veces. */}
          <p className="mt-2 text-right text-sm">
            <Link
              href={`/recuperar${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              style={{ color: 'var(--gold)' }}
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          {error && (
            <p className="mb-1 mt-3 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          {faltaVerificar && (
            <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              Puedes desbloquearla ahora mismo:{' '}
              <Link
                href={`/recuperar${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                style={{ color: 'var(--gold)' }}
              >
                cambia tu contraseña con un código
              </Link>
              . Con eso tu correo queda confirmado.
            </p>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="mt-0.5"
              style={{ accentColor: 'var(--gold)' }}
            />
            <span>
              Mantener la sesión iniciada en este equipo
              <span
                className="mt-0.5 block text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {recordar
                  ? `Desmárcalo si el equipo no es tuyo. En cualquier caso, la sesión se cierra sola tras ${INACTIVIDAD_MINUTOS} minutos sin actividad.`
                  : 'La sesión se cerrará al cerrar el navegador.'}
              </span>
            </span>
          </label>
          <button
            type="submit"
            disabled={cargando}
            className="btn btn-cta mt-4 w-full"
          >
            {cargando ? 'Entrando…' : destino ? `Entrar y volver a ${destino.nombre}` : 'Entrar'}
          </button>
          {destino && (
            <button
              type="button"
              disabled={cargando}
              onClick={() => void entrar(true)}
              className="btn btn-outline mt-3 w-full"
            >
              Entrar solo a DINAMYT
            </button>
          )}
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
