'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { obtenerToken, decodificarToken, extraerError } from '@/lib/api';
import { validarContrasena, LIM } from '@/lib/validacion';
import { CampoContrasena } from '@/components/CampoContrasena';
import { MedidorContrasena } from '@/components/MedidorContrasena';
import { DispositivosConectados } from '@/components/DispositivosConectados';
import { BorrarMiCuenta } from '@/components/BorrarMiCuenta';
import { ZonaHoraria } from '@/components/ZonaHoraria';
import { Apariencia } from '@/components/Apariencia';
import { useI18n } from '@/lib/i18n';
import { Cargando } from '@/components/Cargando';
import { MensajeVivo } from '@/components/MensajeVivo';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN — cómo quiero usar mi cuenta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Por qué existe esta pantalla ─────────────────────────────────────────────
 *
 * Porque todo esto vivía dentro de «Mi perfil», y no es el perfil. El perfil es
 * QUIÉN ERES: el nombre que sale en la llave del campeonato, la foto del
 * carnet, el tipo de sangre que alguien va a leer deprisa, el teléfono de tu
 * contacto de emergencia. Son datos que OTRAS personas leen de ti, y por eso la
 * mitad los corrige tu maestro y no tú.
 *
 * Lo de aquí es lo contrario: el tema, el idioma, la hora a la que se te
 * escribe, tu contraseña y tus sesiones abiertas. No lo lee nadie más y no lo
 * corrige nadie más. Es CÓMO QUIERES USAR la cuenta.
 *
 * Mezclado en una sola pantalla, lo que pasaba era esto: quien entraba a
 * cambiar el modo claro se encontraba primero una barra de «tu perfil está al
 * 71 %» y tres bloques de datos médicos, y quien entraba a rellenar su perfil
 * tenía debajo un botón de cerrar sesiones que no había ido a buscar. Una
 * pantalla que responde dos preguntas distintas no responde bien ninguna.
 *
 * ── Y sigue habiendo una sola fuente de verdad ───────────────────────────────
 *
 * Separar la pantalla no reparte el dato: el tema y el idioma se siguen
 * guardando en `users.theme` y `users.locale`, que es lo que hace que la
 * elección valga en las cuatro webs y en cualquier teléfono. Lo que cambia es
 * dónde se PREGUNTA, no dónde se guarda. Ver `components/Apariencia.tsx`.
 *
 * ── Por qué la contraseña y las sesiones van juntas y en este orden ──────────
 *
 * Son la misma preocupación. Quien viene aquí porque cree que alguien entró en
 * su cuenta necesita las dos cosas: cambiar la cerradura no sirve de nada si el
 * intruso sigue dentro con su sesión abierta.
 */

interface Cuenta {
  id: string;
  timezone: string | null;
  theme: string | null;
  locale: string | null;
  timezoneManual: boolean | null;
}

export default function ConfiguracionPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [error, setError] = useState('');

  // Cambio de contraseña.
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  // Con su tono aparte. Se decidía buscando «actualizada» en el texto, así
  // que en inglés («Password updated.») el éxito salía en rojo.
  const [passMsg, setPassMsg] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    const pase = obtenerToken();
    if (!pase) {
      router.replace('/login');
      return;
    }
    const payload = decodificarToken(pase);
    if (!payload) {
      router.replace('/login');
      return;
    }
    try {
      // El mismo perfil que pinta `/perfil`: no hay endpoint aparte porque no
      // hay dato aparte. Esta pantalla usa cinco campos de los treinta.
      const res = await api.get(`/users/${payload.sub}/profile`);
      setCuenta(res.data as Cuenta);
    } catch (e) {
      setError(extraerError(e, 'No se pudo cargar tu configuración.'));
    }
  }, [router]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    // El botón ya no se apaga antes de escribir: apagado no decía por qué no
    // se podía pulsar (auditoría 003, nº 15). Se valida aquí, se dice qué
    // falta y el foco va al campo que hay que arreglar.
    if (!passActual) {
      setPassMsg({ tono: 'error', texto: t('config.faltaActual') });
      document.getElementById('cfg-actual')?.focus();
      return;
    }
    const nueva = validarContrasena(passNueva);
    if (!nueva.ok) {
      setPassMsg({ tono: 'error', texto: nueva.error ?? t('config.contrasenaNueva') });
      document.getElementById('cfg-nueva')?.focus();
      return;
    }
    setCambiando(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passActual,
        newPassword: passNueva,
      });
      setPassMsg({ tono: 'ok', texto: t('config.contrasenaLista') });
      setPassActual('');
      setPassNueva('');
    } catch (e2) {
      setPassMsg({ tono: 'error', texto: extraerError(e2, 'No se pudo cambiar la contraseña.') });
    } finally {
      setCambiando(false);
    }
  }

  if (!cuenta) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        {error ? (
          <p className="text-danger">{error}</p>
        ) : (
          <Cargando />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6 lg:max-w-5xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1">{t('config.eyebrow')}</p>
          <h1 className="display text-3xl">{t('config.titulo')}</h1>
          <p className="mt-2 text-sm text-muted">
            {t('config.desc')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/perfil" className="btn btn-outline">
            {t('config.irAlPerfil')}
          </Link>
          <Link href="/dashboard" className="btn btn-outline">
            {t('perfil.misApps')}
          </Link>
        </div>
      </header>

      {/* «Cómo veo DINAMYT»: el tema, el idioma y la hora responden la misma
          pregunta, así que van juntos y en este orden — los dos primeros se
          ven al instante, la hora explica algo que pasa cuando no estás. */}
      {/* En escritorio, dos columnas: son tarjetas que no dependen una de otra,
          y en una sola dejaban dos tercios de la pantalla vacíos (003, nº 7).
          El hueco entre ellas lo pone la rejilla, así que el margen de arriba
          de cada tarjeta se anula; «Borrar mi cuenta» va a lo ancho, al final. */}
      <div className="grid gap-4 [&>*]:mt-0 lg:grid-cols-2 lg:items-start [&>*:last-child]:lg:col-span-2">
      <Apariencia
        usuarioId={cuenta.id}
        temaGuardado={cuenta.theme}
        localeGuardado={cuenta.locale}
      />

      <ZonaHoraria
        usuarioId={cuenta.id}
        zonaGuardada={cuenta.timezone}
        manual={!!cuenta.timezoneManual}
      />

      {/* ── Seguridad ── */}
      <form onSubmit={cambiarPassword} className="card mt-4 flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">{t('perfil.cambiarContrasena')}</h2>
        <p className="-mt-2 text-sm text-muted">
          {t('config.seguridadDesc')}
        </p>
        {/* Lado a lado en tableta; en escritorio la tarjeta va a media
            pantalla (la rejilla de abajo) y los dos campos se apilan. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <label className="block text-sm">
            <span className="text-muted">{t('config.contrasenaActual')}</span>
            <span className="mt-1 block">
              <CampoContrasena
                id="cfg-actual"
                name="current-password"
                value={passActual}
                onChange={(e) => setPassActual(e.target.value)}
                autoComplete="current-password"
              />
            </span>
          </label>
          <div>
            <label className="block text-sm">
              <span className="text-muted">{t('config.contrasenaNueva')}</span>
              <span className="mt-1 block">
                <CampoContrasena
                  id="cfg-nueva"
                  name="new-password"
                  value={passNueva}
                  onChange={(e) => setPassNueva(e.target.value)}
                  maxLength={LIM.password}
                  autoComplete="new-password"
                />
              </span>
            </label>
            {/* Los mismos mínimos que el registro, a la vista. «(mín. 8)» en la
                etiqueta era todo lo que se decía, y era todo lo que se exigía:
                `12345678` pasaba. */}
            <MedidorContrasena clave={passNueva} />
          </div>
        </div>
        <MensajeVivo tono={passMsg?.tono ?? 'ok'} texto={passMsg?.texto} className="text-sm" />
        <button type="submit" disabled={cambiando} className="btn btn-outline self-start">
          {cambiando ? t('config.actualizando') : t('config.actualizarContrasena')}
        </button>
      </form>

      <DispositivosConectados />

      {/* Lo último de la pantalla, y aparte: no es un ajuste más. */}
      <BorrarMiCuenta />
      </div>
    </main>
  );
}
