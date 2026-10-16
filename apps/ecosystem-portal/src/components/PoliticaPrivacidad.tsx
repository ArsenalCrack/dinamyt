'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CORREO_ADMIN, CORREO_SOPORTE, RESPONSABLE } from '@/lib/contacto';
import { useI18n } from '@/lib/i18n';

/** Un apartado de la política: el título se escribe igual en todos. */
function Seccion({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="mb-2 text-lg font-semibold text-ink">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

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
        <p className="mt-2 text-sm text-muted">
          {t('priv.actualizado')}
        </p>
      </header>

      <div
        className="flex flex-col gap-6 text-base leading-relaxed text-muted"
      >
        {/* Lo que pide el Decreto 1377 (art. 13). Los datos, en `lib/contacto.ts`. */}
        <Seccion titulo={t('priv.responsable')}>
          <p className="mb-2">{t('priv.responsableIntro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">{t('priv.respNombre')}</strong>{' '}
              {RESPONSABLE.nombre}
            </li>
            <li>
              <strong className="text-ink">{t('priv.respDomicilio')}</strong>{' '}
              {RESPONSABLE.domicilio}
            </li>
            <li>
              <strong className="text-ink">{t('priv.respCorreo')}</strong>{' '}
              <a href={`mailto:${RESPONSABLE.correo}`} className="text-gold">
                {RESPONSABLE.correo}
              </a>
            </li>
          </ul>
        </Seccion>

        <Seccion titulo={t('priv.queDatos')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">{t('priv.identificacion')}</strong>{' '}
              {t('priv.identificacionTexto')}
            </li>
            <li>
              <strong className="text-ink">{t('priv.deportivos')}</strong>{' '}
              {t('priv.deportivosTexto')}
            </li>
            <li>
              <strong className="text-ink">{t('priv.sensibles')}</strong>{' '}
              {t('priv.sensiblesA')} <strong>{t('priv.cifrados')}</strong>{' '}
              {t('priv.sensiblesB')}
            </li>
            <li>
              <strong className="text-ink">{t('priv.pago')}</strong>{' '}
              {t('priv.pagoA')} <strong>{t('priv.noProcesa')}</strong> {t('priv.pagoB')}
            </li>
            <li>
              <strong className="text-ink">{t('priv.tecnicos')}</strong>{' '}
              {t('priv.tecnicosTexto')}
            </li>
          </ul>
        </Seccion>

        <Seccion titulo={t('priv.paraQue')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('priv.uso1')}</li>
            <li>{t('priv.uso2')}</li>
            <li>{t('priv.uso3')}</li>
            <li>{t('priv.uso4')}</li>
            <li>{t('priv.uso5')}</li>
          </ul>
        </Seccion>

        <Seccion titulo={t('priv.conQuien')}>
          <p>{t('priv.conQuienTexto')}</p>
        </Seccion>

        <Seccion titulo={t('priv.proveedores')}>
          <p className="mb-2">{t('priv.proveedoresIntro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('priv.prov1')}</li>
            <li>{t('priv.prov2')}</li>
            <li>{t('priv.prov3')}</li>
            <li>{t('priv.prov4')}</li>
            <li>{t('priv.prov5')}</li>
          </ul>
          <p className="mt-2">{t('priv.proveedoresCierre')}</p>
        </Seccion>

        {/* Los pies del portal, de Membresías y de Campeonatos enlazan a
            `/privacidad#ia`: este `id` no se renombra sin tocar los otros dos
            repositorios. */}
        <Seccion titulo={t('priv.ia')} id="ia">
          <p>{t('priv.iaTexto')}</p>
        </Seccion>

        <Seccion titulo={t('priv.cookies')}>
          <p>{t('priv.cookiesTexto')}</p>
        </Seccion>

        <Seccion titulo={t('priv.derechos')}>
          <p>
            {t('priv.derechosA')}{' '}
            <Link href="/perfil" className="text-gold">
              {t('priv.miPerfil')}
            </Link>
            {t('priv.derechosB')}{' '}
            <a href={`mailto:${CORREO_ADMIN}`} className="text-gold">
              {CORREO_ADMIN}
            </a>{' '}
            {t('priv.derechosC')}{' '}
            <a href={`mailto:${CORREO_SOPORTE}`} className="text-gold">
              {CORREO_SOPORTE}
            </a>
            {t('priv.derechosD')}
          </p>
          <p className="mt-2">{t('priv.sic')}</p>
        </Seccion>

        <Seccion titulo={t('priv.supresion')}>
          <p>{t('priv.supresionTexto')}</p>
        </Seccion>

        <Seccion titulo={t('priv.seguridad')}>
          <p>{t('priv.seguridadTexto')}</p>
        </Seccion>
      </div>

      <footer className="mt-10 border-t pt-6 border-line">
        <Link href="/" className="btn btn-outline">
          {t('priv.volver')}
        </Link>
      </footer>
    </>
  );
}
