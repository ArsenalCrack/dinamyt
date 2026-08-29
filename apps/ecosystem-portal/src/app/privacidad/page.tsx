import type { Metadata } from 'next';
import Link from 'next/link';
import { CORREO_ADMIN, CORREO_SOPORTE } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Política de privacidad — DINAMYT',
  description:
    'Cómo DINAMYT trata los datos personales de deportistas, maestros, jueces y organizaciones (Ley 1581 de 2012, Colombia).',
};

/**
 * Política de tratamiento de datos personales (Ley 1581 de 2012 — Colombia).
 * Es la política que el registro referencia al pedir el consentimiento.
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="eyebrow mb-1">Ley 1581 de 2012 · Colombia</p>
        <h1 className="display text-3xl">Política de privacidad</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Última actualización: julio de 2026 · Responsable: DINAMYT Ecosystem
        </p>
      </header>

      <div className="flex flex-col gap-6 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Qué datos tratamos
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong style={{ color: 'var(--text)' }}>Identificación:</strong> nombre,
              documento, correo, teléfono y fecha de nacimiento.
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Deportivos:</strong> club,
              disciplina, grado (cinturón), peso, inscripciones, resultados de
              competencia y asistencia a clases.
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Sensibles (opcionales):</strong>{' '}
              contacto de emergencia, notas médicas y plantilla de huella para el
              check-in del club. Se guardan <strong>cifrados</strong> (AES-256-GCM) y
              solo los ve el maestro/administrador de tu club.
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>De pago:</strong> registro de
              pagos hechos en el club (efectivo, transferencia, Nequi, Daviplata).
              DINAMYT <strong>no procesa pagos en línea</strong> ni guarda datos de
              tarjetas.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Para qué los usamos
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Operar tu cuenta única del ecosistema (identidad y accesos por rol).</li>
            <li>Gestionar campeonatos: inscripciones, categorías, llaves y resultados públicos.</li>
            <li>Controlar mensualidades y asistencia del club, y enviarte recordatorios (correo y notificaciones push que tú activas).</li>
            <li>Conservar tu historial deportivo: cada participación guarda el grado y club del momento en que competiste.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Con quién se comparten
          </h2>
          <p>
            Con tu club/federación (sus administradores ven a sus propios miembros) y,
            en campeonatos, los resultados son públicos con tu nombre y club, como en
            cualquier evento deportivo. No vendemos ni cedemos datos a terceros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Tus derechos (habeas data)
          </h2>
          <p>
            Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar la
            autorización. La mayoría los editas tú en{' '}
            <Link href="/perfil" style={{ color: 'var(--gold)' }}>
              Mi perfil
            </Link>
            ; para supresión de la cuenta o reclamos escribe a{' '}
            <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
              {CORREO_ADMIN}
            </a>
            , y si lo que tienes es un problema para entrar o usar tu cuenta,
            a{' '}
            <a href={`mailto:${CORREO_SOPORTE}`} style={{ color: 'var(--gold)' }}>
              {CORREO_SOPORTE}
            </a>
            . Los menores de edad se registran y gestionan con autorización de su
            acudiente.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Seguridad y conservación
          </h2>
          <p>
            Contraseñas con hash (bcrypt), datos sensibles cifrados, acceso por roles y
            comunicación por HTTPS. Los datos se conservan mientras tu cuenta exista;
            el historial deportivo es inmutable por diseño (registra lo que ocurrió en
            cada competencia).
          </p>
        </section>
      </div>

      <footer className="mt-10 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <Link href="/" className="btn btn-outline">
          ← Volver al inicio
        </Link>
      </footer>
    </main>
  );
}
