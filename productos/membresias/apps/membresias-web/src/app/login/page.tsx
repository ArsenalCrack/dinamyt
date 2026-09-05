'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { mensajeError, obtenerConfig } from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LIM, PROPS_CORREO } from '@/lib/campos';
import { CampoContrasena } from '@/components/CampoContrasena';
import { ControlesApariencia } from '@/components/ControlesApariencia';

const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

/**
 * Aquí ya NO se toca el historial a mano. Cuesta explicarlo, así que va entero.
 *
 * Los dos tokens que entran por esta pantalla —el `?acceso=` del QR y el
 * `#token=` del portal— no pueden quedarse escritos en la barra. La forma
 * evidente de quitarlos era `history.replaceState(...)`, y de ahí salieron DOS
 * fallos seguidos, los dos con el mismo síntoma: pulsabas «Salir» en otra
 * pantalla, minutos después, y no pasaba nada.
 *
 * 1. Con `replaceState(null, …)`, ese `null` borraba el estado del router que
 *    Next guarda dentro de la entrada del historial. El router perdía el hilo
 *    y `router.replace()` dejaba de navegar — sin lanzar, sin avisar.
 *
 * 2. Conservando `window.history.state` se arreglaba eso… pero ese estado
 *    lleva grabada dentro la URL, y la URL grabada seguía teniendo el
 *    `?acceso=`. La barra decía una cosa y Next creía otra. Con el token del
 *    portal no se notaba —`#token=` es un fragmento y Next ni lo mira—, pero
 *    con el del QR la query SÍ es parte de la ruta que Next gestiona, y el
 *    router volvía a quedarse mudo.
 *
 * ── Lo que se hace ahora ──
 *
 * Nada. El token se va solo: `router.replace()` REEMPLAZA la entrada actual del
 * historial, así que al saltar a la pantalla de destino la dirección con el
 * token desaparece de la barra Y del historial, sin que nadie tenga que
 * borrarla. Si el canje falla y hay que quedarse aquí, se hace lo mismo hacia
 * `/login` a secas.
 *
 * Queda a la vista los ~200 ms que dura el canje. Es un precio que se paga a
 * gusto: lo que se compra es que el historial y Next digan siempre lo mismo.
 *
 * `canjeado` es el pestillo que antes ponía, de rebote, el limpiado de la
 * barra: sin la URL vieja delante, un efecto que se repitiera volvería a
 * canjear el mismo token. Ahora el pestillo es explícito.
 */

export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const { login, loginConCodigo, loginConSso, logout, user, cargando } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sso, setSso] = useState(false);
  const [conCodigo, setConCodigo] = useState(false);
  /** Un token se canjea UNA vez. Ver el comentario largo de arriba. */
  const canjeado = useRef(false);

  /**
   * Se llega aquí desde «Salir» (`?salida=1`), y eso lo cambia todo.
   *
   * ── Qué pasaba sin esto ──
   *
   * Salir terminaba en `/login` a secas, y `/login` es la pantalla que mete
   * dentro a quien tenga sesión. Bastaba con que algo sobreviviera al cierre
   * —la API dormida que no atendió el `POST /auth/logout`, un 503, un corte de
   * red— para que el `GET /auth/me` de esta misma pantalla contestara 200 y la
   * persona apareciera de vuelta dentro de Membresías un segundo después de
   * haber pulsado Salir. Al segundo intento la API ya estaba despierta y sí se
   * salía: de ahí el «hay que pulsarlo dos veces».
   *
   * Con la marca puesta esta pantalla es un punto final, no una puerta: no
   * entra a nadie, no canjea ningún token, y si detecta que quedó sesión viva
   * la vuelve a cerrar. Es la red de seguridad del botón de Salir.
   *
   * Es un `ref` y no estado porque tiene que estar decidido ANTES de que
   * corran los efectos de abajo, y porque deja de valer en cuanto alguien
   * empieza a entrar a propósito desde aquí (ver `enviar`).
   */
  const enSalida = useRef(
    typeof window === 'undefined'
      ? null
      : (new URLSearchParams(window.location.search).get('salida') as
          | 'portal'
          | 'sola'
          | null),
  );
  /**
   * Lo mismo, para poder DECIRLO en pantalla sin romper la hidratación.
   *
   * `portal` = se cerraron las dos sesiones, la de aquí y la de DINAMYT.
   * `sola` = esta instalación no tiene portal, así que solo había una.
   */
  const [avisoSalida, setAvisoSalida] = useState<'portal' | 'sola' | null>(null);
  /** Dos remates y se para: cerrar en bucle sería peor que no cerrar. */
  const remates = useRef(0);

  useEffect(() => {
    setAvisoSalida(enSalida.current);
  }, []);

  // Quien ya tiene sesión no debería quedarse mirando el formulario… salvo
  // cuando acaba de pulsar Salir, que es justo cuando el formulario es lo
  // único correcto que se le puede enseñar.
  useEffect(() => {
    if (enSalida.current) return;
    if (!cargando && user && !conCodigo) router.replace(rutaInicio(user));
  }, [cargando, user, router, conCodigo]);

  /**
   * Se salió, pero el servidor todavía reconoce la sesión: se cierra otra vez.
   *
   * Que `user` tenga valor después de un `/auth/me` cumplido significa que la
   * cookie httpOnly sigue viva, y solo el servidor puede borrarla. Aquí se le
   * vuelve a pedir. El contador es el freno: si el servidor sigue sin poder
   * cerrar, se para y se enseña el formulario — que es la verdad visible más
   * cercana a lo que la persona pidió, y desde donde puede volver a entrar.
   */
  useEffect(() => {
    if (!enSalida.current || cargando || !user) return;
    if (remates.current >= 2) return;
    remates.current += 1;
    void logout();
  }, [cargando, user, logout]);

  /**
   * Entrada por QR: el maestro genera el código en la ficha del alumno y este
   * lo escanea con la cámara de su celular, que abre esta página con
   * `?acceso=<token>`.
   *
   * El token desaparece de la barra al saltar a la pantalla de destino, porque
   * `router.replace()` reemplaza la entrada del historial en vez de añadir una
   * (ver el comentario largo del principio del fichero).
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('acceso');
    if (!codigo) return;

    if (canjeado.current) return;
    canjeado.current = true;

    // Un QR recién escaneado es una entrada deliberada, gane la carrera que
    // gane contra el remate de la salida. Sin esto, el remate cerraría la
    // sesión que este canje acaba de abrir.
    enSalida.current = null;
    setAvisoSalida(null);

    setConCodigo(true);
    loginConCodigo(codigo)
      .then((u) => router.replace(rutaInicio(u)))
      .catch((err) => {
        // Nos quedamos aquí, así que el token sí hay que quitarlo de la barra
        // — y se quita navegando, que es lo único que Next entiende.
        router.replace('/login');
        setError(mensajeError(err, t('login.qrCaducado')));
        setConCodigo(false);
      });
  }, [loginConCodigo, router, t]);

  /** Saltar al portal a iniciar sesión y volver aquí con la sesión hecha. */
  function entrarPorElPortal() {
    const vuelta = encodeURIComponent(`${window.location.origin}/login`);
    window.location.href = `${PORTAL_URL}/login?redirect=${vuelta}`;
  }

  // El botón de SSO solo se dibuja si esta instalación lo tiene configurado.
  useEffect(() => {
    obtenerConfig()
      .then((c) => setSso(c.sso && Boolean(PORTAL_URL)))
      .catch(() => setSso(false));
  }, []);

  /**
   * SSO por redirección: el portal vuelve con #token=<jwt> en el fragmento,
   * que nunca viaja al servidor.
   *
   * Ese token se CANJEA por una sesión de Membresías (`/auth/sso`) en vez de
   * guardarse en memoria y preguntar por `/auth/me`. Antes pasaban dos cosas, y
   * las dos acababan devolviendo a la persona al login: la sesión no
   * sobrevivía a una recarga —vivía en una variable, no en la cookie— y el
   * contexto de sesión nunca se enteraba de que había alguien dentro.
   *
   * `conCodigo` se marca mientras dura el canje por lo mismo que en el QR: sin
   * eso, el efecto de «ya tienes sesión» de arriba compite con este por
   * decidir a dónde se va.
   */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const token = decodeURIComponent(hash.slice(7));
    if (!token) return;

    // Nadie entra por una pantalla a la que se llegó saliendo. El portal nunca
    // manda las dos cosas juntas; el cierre está aquí por si un día lo hace.
    if (enSalida.current) return;
    if (canjeado.current) return;
    canjeado.current = true;

    setConCodigo(true);
    loginConSso(token)
      .then((u) => router.replace(rutaInicio(u)))
      .catch((err) => {
        router.replace('/login');
        setError(mensajeError(err, t('login.error')));
        setConCodigo(false);
      });
  }, [loginConSso, router, t]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // Quien teclea su contraseña aquí ya no está saliendo: está entrando. Sin
    // levantar la marca, el remate de arriba cerraría la sesión recién abierta.
    enSalida.current = null;
    setAvisoSalida(null);
    setError('');
    setEnviando(true);
    try {
      const u = await login(email, password);
      router.replace(rutaInicio(u));
    } catch (err) {
      setError(mensajeError(err, t('login.error')));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <form
        onSubmit={enviar}
        className="card"
        style={{ padding: '1.75rem', width: '100%', maxWidth: 380 }}
      >
        {/* El logo lleva al portal, la convención del ecosistema: ninguna app
            es un callejón sin salida (ver UNA-SOLA-APP.md §3). Solo cuando hay
            portal al que ir: en el modo autónomo se queda como estaba. */}
        {sso ? (
          <a href={PORTAL_URL} title={t('login.volverAlPortal')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="DINAMYT"
              width={56}
              height={56}
              style={{ marginBottom: '0.75rem' }}
            />
          </a>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/logo.png"
            alt="DINAMYT"
            width={56}
            height={56}
            style={{ marginBottom: '0.75rem' }}
          />
        )}
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          {t('login.eyebrow')}
        </p>
        <h1 className="display" style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
          {t('login.titulo')}{' '}
          <span className="acento">{t('login.tituloAcento')}</span>
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          {conCodigo ? t('login.conQr') : t('login.subtitulo')}
        </p>

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="email">
          {t('login.correo')}
        </label>
        <input
          id="email"
          {...PROPS_CORREO}
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={LIM.correo}
          required
          style={{ margin: '0.3rem 0 0.9rem' }}
        />

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="password">
          {t('login.contrasena')}
        </label>
        {/* Sin `maxLength` a propósito: es el único campo de contraseña que no
            fija una nueva, sino que comprueba la que ya existe. Recortar aquí
            dejaría fuera a quien tenga una más larga de lo que hoy se permite
            crear. El tope vive donde se FIJAN (perfil, alta y restablecer). */}
        <CampoContrasena
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ margin: '0.3rem 0 1.1rem' }}
        />

        {avisoSalida && !error && (
          <p className="muted" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
            {t(
              avisoSalida === 'portal'
                ? 'login.sesionCerradaDinamyt'
                : 'login.sesionCerrada',
            )}
          </p>
        )}

        {error && (
          <p className="msg-error" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-cta"
          type="submit"
          disabled={enviando}
          style={{ width: '100%' }}
        >
          {enviando ? t('login.entrando') : t('login.entrar')}
        </button>

        {/* Solo con portal detrás, y por una razón concreta: la contraseña que
            se recupera allí es la de DINAMYT, y el portal la copia hasta aquí
            (`POST /sync/contrasena`), así que la nueva entra también por este
            formulario. Sin ecosistema —Membresías por su cuenta— no hay nada
            que recuperar por correo: esa contraseña se la pone el maestro. */}
        {sso && (
          <p style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.85rem' }}>
            <a
              href={`${PORTAL_URL}/recuperar${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              style={{ color: 'var(--gold)' }}
            >
              {t('login.olvidada')}
            </a>
          </p>
        )}

        {sso && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                margin: '1rem 0',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
              {t('login.o')}
              <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            </div>
            {/* Botón y no enlace: la dirección de vuelta necesita
                `window.location.origin`, que en el servidor no existe. Como
                atributo salía vacío y React no corrige atributos al hidratar,
                así que el portal se quedaba sin saber a dónde devolver. */}
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%' }}
              onClick={entrarPorElPortal}
            >
              {t('login.sso')}
            </button>

            {/* Las cuentas nacen en el ecosistema: aquí no hay registro. */}
            <p
              className="muted"
              style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}
            >
              {t('login.sinCuenta')}{' '}
              <a href={`${PORTAL_URL}/registro`} style={{ color: 'var(--gold)' }}>
                {t('login.registrate')}
              </a>
            </p>
          </>
        )}
      </form>

      {/* Sin sesión no hay NavBar: el tema y el idioma viven aquí. */}
      <ControlesApariencia />
    </main>
  );
}
