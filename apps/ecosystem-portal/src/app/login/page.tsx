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
  type TokenPayload,
} from '@/lib/api';
import { CampoContrasena } from '@/components/CampoContrasena';
import { Campo } from '@/components/Campo';
import { PROPS_CORREO, validarCorreo } from '@/lib/validacion';
import {
  destinoSeguro,
  fueUnaRecarga,
  guardarVuelta,
  laPidioEsaApp,
  olvidarVuelta,
  recuperarVuelta,
} from '@/lib/apps';

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
   *
   * ── Se enseña UNA vez, y por eso no se lee de la URL al pintar ──
   *
   * Viene en `?motivo=`, y leerlo directo del `search` lo dejaba pegado: la
   * frase seguía ahí al recargar, y al recargar otra vez, contando algo que ya
   * pasó y que la persona ya leyó. Un aviso que no se va deja de ser un aviso
   * y pasa a ser parte de la pantalla.
   *
   * Se copia al estado y se borra de la dirección con `replaceState` —sin
   * `router.replace`, que volvería a renderizar y no hace falta—. El resto de
   * parámetros (`redirect`, `email`) se conservan: son los que dicen a dónde
   * volver y qué correo ya venía escrito.
   */
  const [motivoDelCierre, setMotivoDelCierre] = useState<string | null>(null);
  useEffect(() => {
    const m = search.get('motivo');
    if (!m) return;
    setMotivoDelCierre(m);
    const url = new URL(window.location.href);
    url.searchParams.delete('motivo');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // Solo al llegar: es un mensaje de una vez, no un valor que se siga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * A dónde hay que volver al terminar, y si ese destino llega FRESCO.
   *
   * El `?redirect=` se lee una vez, se borra de la barra y vive aquí — el
   * porqué, largo, está en `lib/apps.ts`. `fresca` dice si la app lo acaba de
   * pedir (lo corrobora el referente), y de eso depende **qué hace el botón de
   * enviar**, que es el único que el gestor de contraseñas de Android puede
   * disparar sin que nadie lo toque.
   */
  const [destino, setDestino] = useState<
    { url: string; nombre: string; fresca: boolean } | null
  >(null);

  /**
   * El `?redirect=` se consume: se lee, se guarda y se BORRA de la barra.
   *
   * Mismo gesto que el `?motivo=` de arriba y por la misma razón —lo que queda
   * en el historial es lo que el navegador te va a ofrecer mañana—, solo que
   * lo que se quedaba pegado aquí no era una frase: era el destino del botón
   * principal.
   *
   * ── Por qué el destino empieza en `null` y se llena DESPUÉS de montar ──
   *
   * Porque esta pantalla se pinta también en el servidor, y allí no hay barra
   * de direcciones ni referente: calcularlo en el primer render dejaba al
   * servidor diciendo «Entrar» y al navegador «Entrar y volver a Membresías»,
   * que es un fallo de hidratación con todas las letras. React lo arreglaba
   * volviendo a pintar —el resultado que se veía era el bueno—, pero por el
   * camino tiraba el error a la consola y podía descartar el árbol entero.
   * Empezando en `null` los dos coinciden, y el efecto cambia el texto del
   * botón un instante después. Lo que se ve es lo mismo; lo que desaparece es
   * el error.
   */
  useEffect(() => {
    const enLaBarra = search.get('redirect');
    if (enLaBarra) {
      const pedido = destinoSeguro(enLaBarra);
      if (pedido) {
        const fresca = laPidioEsaApp(pedido);
        setDestino({ ...pedido, fresca });
        guardarVuelta(enLaBarra, fresca);
      }
      // Se borra de la barra aunque el destino NO estuviera en la lista
      // blanca: con más razón, porque entonces es un desvío que además no
      // lleva a ninguna parte.
      const url = new URL(window.location.href);
      url.searchParams.delete('redirect');
      window.history.replaceState(
        null,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
      return;
    }

    // Sin parámetro, solo se rescata lo guardado si esto fue un F5 de esta
    // misma pantalla. `sessionStorage` dura toda la pestaña, así que sin esa
    // condición estaríamos resucitando el desvío de un viaje ya terminado.
    if (!fueUnaRecarga()) {
      olvidarVuelta();
      return;
    }
    const guardada = recuperarVuelta();
    const rescatado = guardada && destinoSeguro(guardada.redirect);
    if (guardada && rescatado) {
      setDestino({ ...rescatado, fresca: guardada.fresca });
    }
    // Solo al llegar: es un billete de un viaje, no un valor que se siga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ¿El botón de ENVIAR devuelve a la app, o entra al portal?
   *
   * Con el enlace fresco devuelve, que es lo que pidió quien pulsó «entrar con
   * DINAMYT» hace tres segundos. Sin corroborar —un enlace viejo del
   * historial, un marcador, uno pegado en un chat— enviar entra al portal y la
   * vuelta a la app baja al segundo botón. El segundo siempre hace lo
   * contrario que el primero, así que ninguna de las dos puertas desaparece:
   * lo único que cambia es cuál se puede disparar sola.
   */
  const elSubmitVuelve = Boolean(destino?.fresca);

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
    // El billete ya se usó, o se descartó a propósito. Dejarlo vivo haría que
    // una recarga del login más tarde, en esta misma pestaña, volviera a
    // ofrecer un viaje que ya terminó.
    olvidarVuelta();
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
      /**
       * Se envía el correo NORMALIZADO, no lo que quedó en la caja.
       *
       * `validarCorreo` ya lo devuelve sin espacios y en minúsculas, que es la
       * forma con la que está guardado. El servidor tampoco distingue
       * mayúsculas desde `normalizarCorreo`, así que esto no es lo que hace
       * que la cuenta se encuentre — es lo que evita mandar `  Juan@Gmail.com `
       * con un espacio pegado del portapapeles y que el fallo se explique en
       * el otro extremo.
       */
      const { access_token } = await loginAPI(
        correo.ok ? correo.valor : email.trim().toLowerCase(),
        password,
        // La casilla, hasta el servidor: es él quien lleva el reloj de
        // inactividad, y sin esto lo aplicaba igual.
        recordar,
      );
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
    await entrar(!elSubmitVuelve);
  }

  // `py-10` no es cosmética: sin relleno vertical la tarjeta queda pegada a la
  // raya del pie, y cuando el contenido crece —el aviso de por qué se cerró la
  // sesión, el error, la línea de «puedes desbloquearla ahora mismo»— la caja
  // llega justo al borde y se lee como si chocara con él. Las otras pantallas
  // de esta familia (registro, recuperar, verificar) ya lo tenían; ésta,
  // `poner-contrasena` y `salir` se habían quedado sin él.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
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
            {destino && destino.fresca
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
            onClick={() => continuarConLaSesionAbierta(!elSubmitVuelve)}
            className="btn btn-cta w-full"
          >
            {destino && destino.fresca
              ? `Continuar a ${destino.nombre} como ${primerNombre(abierta.fullName)}`
              : `Continuar como ${primerNombre(abierta.fullName)}`}
          </button>
          {/* La otra puerta, siempre la contraria a la de arriba. Solo aparece
              cuando hay una app en juego: sin destino, el botón de arriba YA
              lleva al portal y este sería el mismo botón dos veces. */}
          {destino && (
            <button
              type="button"
              onClick={() => continuarConLaSesionAbierta(elSubmitVuelve)}
              className="btn btn-outline mt-3 w-full"
            >
              {destino.fresca
                ? 'Ir a mi cuenta DINAMYT'
                : `Ir a ${destino.nombre}`}
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
            {destino && destino.fresca
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
              {...PROPS_CORREO}
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
          {/* La casilla va sola, sin explicación debajo. La frase se entiende
              por sí misma, y contar aquí el cierre por inactividad era
              adelantar una regla que a quien va a entrar no le sirve para
              decidir nada. Donde sí se cuenta es en el perfil, junto a los
              dispositivos conectados, que es donde alguien va a buscarla. */}
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              style={{ accentColor: 'var(--gold)' }}
            />
            <span>Mantener la sesión iniciada en este dispositivo</span>
          </label>
          <button
            type="submit"
            disabled={cargando}
            className="btn btn-cta mt-4 w-full"
          >
            {cargando
              ? 'Entrando…'
              : destino && destino.fresca
                ? `Entrar y volver a ${destino.nombre}`
                : 'Entrar'}
          </button>
          {/* Es `type="button"` a propósito, y ahí está la mitad del arreglo:
              el gestor de contraseñas de Android rellena y ENVÍA el formulario
              él solo, y un envío dispara siempre el de enviar — nunca este.
              Por eso el destino que puede dispararse solo es el de arriba, y
              por eso arriba manda la frescura del enlace. */}
          {destino && (
            <button
              type="button"
              disabled={cargando}
              onClick={() => void entrar(elSubmitVuelve)}
              className="btn btn-outline mt-3 w-full"
            >
              {destino.fresca
                ? 'Entrar solo a DINAMYT'
                : `Entrar y volver a ${destino.nombre}`}
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
