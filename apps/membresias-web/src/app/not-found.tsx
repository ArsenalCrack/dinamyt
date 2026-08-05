'use client';

import { usePathname, useRouter } from 'next/navigation';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

/**
 * Página no encontrada (404).
 *
 * Next atrapa con este archivo CUALQUIER dirección que no corresponda a una
 * pantalla de la app. Sin él, quien se equivoca al teclear la URL —o abre un
 * enlace viejo desde el celular— se encontraba la pantalla en blanco y negro
 * que trae Next de fábrica, en inglés y sin ninguna salida.
 *
 * Hermana de `error.tsx`: mismo diseño y mismo criterio —decir qué pasó en
 * español y ofrecer la salida que sirve—, pero esto no es un fallo de la app,
 * así que no se registra nada en la consola.
 *
 * «Mi inicio» depende de quién seas: el maestro va al panel del club y el
 * alumno a su estado. Sin sesión, al login (ver `rutaInicio`).
 */
export default function NoEncontrada() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{ padding: '1.75rem', width: '100%', maxWidth: 460, textAlign: 'center' }}
      >
        <p
          className="display"
          style={{
            fontSize: 'clamp(3.5rem, 16vw, 5rem)',
            lineHeight: 1,
            color: 'var(--gold)',
            marginBottom: '0.5rem',
          }}
        >
          {t('e404.codigo')}
        </p>
        <h1 className="display" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          {t('e404.titulo')}
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          {t('e404.desc')}
        </p>

        {/* La dirección pedida, tal cual: es lo primero que hay que ver para
            saber si fue un dedazo o un enlace mal copiado. */}
        <p
          className="mono"
          style={{
            fontSize: '0.75rem',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '0.6rem 0.7rem',
            marginBottom: '1rem',
            overflowWrap: 'anywhere',
          }}
        >
          <span className="muted">{t('e404.ruta')}: </span>
          {pathname}
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-cta" onClick={() => router.push(rutaInicio(user))}>
            {t('e404.inicio')}
          </button>
          <button className="btn btn-outline" onClick={() => router.back()}>
            {t('e404.volver')}
          </button>
        </div>
      </div>
    </main>
  );
}
