'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  login,
  guardarToken,
  obtenerToken,
  extraerError,
  seRecuerda,
} from '@/lib/api';
import { getRolEfectivo, limpiarRolCache, rutaInicio } from '@/lib/session';
import { CampoContrasena } from '@/components/CampoContrasena';
import { useI18n } from '@/lib/i18n';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

export default function LoginPage() {
  // `useSearchParams` obliga a un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  /**
   * ¿Guardar la sesión en este equipo?
   *
   * Sin marcar, el pase muere al cerrar el navegador. Es lo que hay que hacer
   * en el computador de la sala o en el de un amigo — hasta ahora no se podía:
   * el pase iba siempre a `localStorage`, que sobrevive a cerrar el navegador,
   * a apagar el equipo y a que la persona se vaya a su casa.
   *
   * Empieza marcada porque casi todo el mundo entra desde su propio celular.
   * Lo que importa es que en el equipo prestado se PUEDA desmarcar.
   */
  const [recordar, setRecordar] = useState(true);
  useEffect(() => setRecordar(seRecuerda()), []);

  /**
   * Por qué se acabó la sesión anterior. Lo pone el interceptor de `lib/api`
   * con el mensaje del ecosystem: sin él, cualquier 401 dejaba a la persona en
   * un login mudo, que se lee como «la aplicación me echó sin motivo».
   *
   * Se enseña UNA vez: viene en `?motivo=`, y leerlo directo del `search` lo
   * dejaba pegado — la frase seguía ahí al recargar, contando algo que ya pasó
   * y que la persona ya leyó. Se copia al estado y se borra de la dirección.
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

  /**
   * Saltar al portal a iniciar sesión y volver aquí con la sesión hecha.
   *
   * **Es un botón y no un enlace, y esa es la corrección.** El `href` se
   * construía en el render con `window.location.origin`, que en el servidor no
   * existe: el HTML salía con `?redirect=` **vacío**, y React —lo dice en la
   * consola— «no corrige atributos que difieren al hidratar». Así que el
   * enlace se quedaba roto: entrabas por el portal y el portal te dejaba en SU
   * panel, sin devolverte nunca a Academy. Calculando la dirección al pulsar,
   * el servidor no tiene que adivinar nada.
   */
  function entrarPorElPortal() {
    const vuelta = encodeURIComponent(`${window.location.origin}/login`);
    window.location.href = `${PORTAL_URL}/login?redirect=${vuelta}`;
  }

  async function entrar() {
    limpiarRolCache();
    const rol = await getRolEfectivo();
    router.replace(rutaInicio(rol));
  }

  // SSO desde el portal del ecosystem: si llega #token=<jwt> en el fragmento,
  // se guarda y se entra directo (el fragmento nunca viaja al servidor).
  //
  // El token se comprueba ANTES de navegar: si el portal entregó uno caducado,
  // `obtenerToken` lo descarta y aquí se dice por qué, en vez de mandar a la
  // persona a una pantalla que la va a devolver al login sin explicación —que
  // es como se construye un bucle.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const token = decodeURIComponent(hash.slice(7));
    if (!token) return;
    guardarToken(token);
    window.history.replaceState(null, '', window.location.pathname);
    if (!obtenerToken()) {
      setError('La sesión del portal ya había caducado. Vuelve a entrar aquí.');
      return;
    }
    void entrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login(email, password, recordar);
      await entrar();
    } catch (err) {
      // El ecosystem explica el motivo real (correo inexistente, contraseña
      // incorrecta, intentos restantes…): se muestra tal cual.
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="eco-login">
      {/* Las medidas ya no van escritas aquí: las pone
          `packages/shared/estilos.css`, que es el mismo archivo para las cuatro
          webs. Así el login no se puede desalinear en una sola de ellas. */}
      <form onSubmit={submit} className="card eco-login-caja">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" className="eco-login-logo" />
        <p className="eyebrow eco-login-eyebrow">{t('login.eyebrow')}</p>
        <h1 className="display eco-login-titulo">
          {t('login.titulo')}{' '}
          <span className="acento">{t('login.tituloAcento')}</span>
        </h1>
        <p className="muted eco-login-subtitulo">{t('login.subtitulo')}</p>

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="email">Correo</label>
        {/* 200 es el tope que valida el ecosystem (`validarCorreo`): más
            largo que eso no es un correo que exista. */}
        <input id="email" type="email" maxLength={200} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ margin: '0.3rem 0 0.9rem' }} />

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="password">Contraseña</label>
        {/* El ojo: el MISMO componente y el mismo dibujo que el portal,
            Membresías y Campeonatos (ver OPERAR.md §4.9). */}
        <div style={{ margin: '0.3rem 0 1.1rem' }}>
          <CampoContrasena
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {/* La contraseña es UNA para todo el ecosistema, así que recuperarla
            también se hace en un solo sitio: el portal. Este enlace no existía
            en ninguna de las cuatro apps, aunque los mensajes de error del
            propio servidor lo mencionaran por su nombre. */}
        <p style={{ marginTop: '-0.6rem', marginBottom: '0.9rem', textAlign: 'right', fontSize: '0.8rem' }}>
          <a
            href={`${PORTAL_URL}/recuperar${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            style={{ color: 'var(--gold)' }}
          >
            ¿Olvidaste tu contraseña?
          </a>
        </p>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.9rem',
            fontSize: '0.85rem',
          }}
        >
          {/* Sin explicación debajo, igual que en el portal: la frase se
              entiende sola, y el cierre por inactividad se cuenta donde alguien
              va a buscarlo (el perfil), no aquí. */}
          <input
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
            style={{ width: 'auto', accentColor: 'var(--gold)' }}
          />
          <span>Mantener la sesión iniciada en este equipo</span>
        </label>

        {motivoDelCierre && !error && (
          <p className="muted" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
            {motivoDelCierre}
          </p>
        )}

        {error && <p className="msg-error" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>{error}</p>}

        <button className="btn btn-cta" type="submit" disabled={cargando} style={{ width: '100%' }}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>

        {/* SSO por redirección: el portal devuelve aquí con #token= */}
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
          o
          <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
        </div>
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: '100%' }}
          onClick={entrarPorElPortal}
        >
          Entrar con el portal DINAMYT
        </button>

        <p className="muted" style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
          ¿No tienes cuenta?{' '}
          <a href={`${PORTAL_URL}/registro`} style={{ color: 'var(--gold)' }}>
            Regístrate en el portal
          </a>
        </p>
        <p style={{ marginTop: '0.25rem', textAlign: 'center', fontSize: '0.85rem' }}>
          <a href={`${PORTAL_URL}/dashboard`} className="muted">
            ⇱ Ir al panel principal DINAMYT
          </a>
        </p>
      </form>
    </main>
  );
}
