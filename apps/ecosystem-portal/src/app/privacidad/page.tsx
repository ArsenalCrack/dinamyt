import type { Metadata } from 'next';
import { PoliticaPrivacidad } from '@/components/PoliticaPrivacidad';

/**
 * Los metadatos se quedan en español y a propósito.
 *
 * Son para los buscadores, no para quien lee: se resuelven en el servidor,
 * antes de saber en qué idioma tiene puesta la aplicación esta persona, y el
 * dominio es colombiano. El texto que sí se lee —y que sí cambia de idioma—
 * vive en `components/PoliticaPrivacidad.tsx`.
 */
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
      <PoliticaPrivacidad />
    </main>
  );
}
