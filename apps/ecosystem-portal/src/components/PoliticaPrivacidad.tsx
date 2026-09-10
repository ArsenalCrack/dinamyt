'use client';

import Link from 'next/link';
import { CORREO_ADMIN, CORREO_SOPORTE } from '@/lib/contacto';
import { useI18n } from '@/lib/i18n';

/**
 * El cuerpo de la política de privacidad.
 *
 * ── Por qué está separado de la página ──────────────────────────────────────
 *
 * `app/privacidad/page.tsx` exporta `metadata`, y eso solo lo puede hacer un
 * componente de SERVIDOR. `useI18n` es un hook de cliente. Las dos cosas no
 * caben en el mismo archivo, así que la página se queda con los metadatos —que
 * son para los buscadores, no para quien lee— y el texto, que sí cambia de
 * idioma, vive aquí.
 *
 * ── La huella ya no se menciona, y era importante ───────────────────────────
 *
 * Los datos sensibles decían «contacto de emergencia, notas médicas y plantilla
 * de huella para el check-in del club». **El lector de huella se retiró del
 * producto** (ver el comentario de la portada: el valor `fingerprint` sigue en
 * el enum de la base solo para no reescribir asistencias viejas, y nada lo
 * emite; hoy son carnet QR, PIN y lista manual).
 *
 * O sea que esta política declaraba tratar un dato BIOMÉTRICO que ya no se
 * recoge. Un dato biométrico no es una viñeta más: es la categoría que más
 * obligaciones arrastra, y anunciarlo de más compromete a algo que no se hace.
 * Se retira, y la fecha de actualización se mueve con él — una política que
 * cambia de contenido y no de fecha no se puede auditar.
 */
export function PoliticaPrivacidad() {
  const { t } = useI18n();

  return (
    <>
      <header className="mb-8">
        <p className="eyebrow mb-1">{t('priv.ley')}</p>
        <h1 className="display text-3xl">{t('priv.titulo')}</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('priv.actualizado')}
        </p>
      </header>

      <div
        className="flex flex-col gap-6 text-sm leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('priv.queDatos')}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong style={{ color: 'var(--text)' }}>{t('priv.identificacion')}</strong>{' '}
              {t('priv.identificacionTexto')}
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>{t('priv.deportivos')}</strong>{' '}
              {t('priv.deportivosTexto')}
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>{t('priv.sensibles')}</strong>{' '}
              {t('priv.sensiblesA')} <strong>{t('priv.cifrados')}</strong>{' '}
              {t('priv.sensiblesB')}
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>{t('priv.pago')}</strong>{' '}
              {t('priv.pagoA')} <strong>{t('priv.noProcesa')}</strong> {t('priv.pagoB')}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('priv.paraQue')}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('priv.uso1')}</li>
            <li>{t('priv.uso2')}</li>
            <li>{t('priv.uso3')}</li>
            <li>{t('priv.uso4')}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('priv.conQuien')}
          </h2>
          <p>{t('priv.conQuienTexto')}</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('priv.derechos')}
          </h2>
          <p>
            {t('priv.derechosA')}{' '}
            <Link href="/perfil" style={{ color: 'var(--gold)' }}>
              {t('priv.miPerfil')}
            </Link>
            {t('priv.derechosB')}{' '}
            <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
              {CORREO_ADMIN}
            </a>
            {t('priv.derechosC')}{' '}
            <a href={`mailto:${CORREO_SOPORTE}`} style={{ color: 'var(--gold)' }}>
              {CORREO_SOPORTE}
            </a>
            {t('priv.derechosD')}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('priv.seguridad')}
          </h2>
          <p>{t('priv.seguridadTexto')}</p>
        </section>
      </div>

      <footer className="mt-10 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <Link href="/" className="btn btn-outline">
          {t('priv.volver')}
        </Link>
      </footer>
    </>
  );
}
