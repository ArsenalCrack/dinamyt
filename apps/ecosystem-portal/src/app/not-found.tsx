'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { obtenerToken, tokenVigente } from '@/lib/sesion';

/**
 * La página de «no existe».
 *
 * No había: una dirección mal copiada enseñaba el 404 de Next, en inglés, en
 * blanco y sin salida (auditoría 003, nº 3). Es la misma que la de Membresías:
 * el código grande, qué pasó, la dirección tal como llegó —lo primero que hay
 * que ver para saber si fue un dedazo o un enlace mal copiado— y dos salidas.
 *
 * «Ir a mi inicio» lleva al panel a quien tiene sesión y a la portada a quien
 * no. Se decide en el navegador, que es donde vive el pase.
 */
export default function NoEncontrada() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [inicio, setInicio] = useState('/');

  useEffect(() => {
    const pase = obtenerToken();
    if (pase && tokenVigente(pase)) setInicio('/dashboard');
  }, []);

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card w-full max-w-[460px] p-7 text-center">
        <p className="display acento mb-2 text-[clamp(3.5rem,16vw,5rem)] leading-none">404</p>
        <h1 className="display mb-2 text-[1.35rem]">{t('e404.titulo')}</h1>
        <p className="mb-4 text-sm text-muted">{t('e404.desc')}</p>
        <p className="mono mb-4 rounded-lg border border-line bg-elevated px-3 py-2.5 text-xs [overflow-wrap:anywhere]">
          <span className="text-muted">{t('e404.ruta')}: </span>
          {pathname}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={inicio} className="btn btn-gold">
            {t('e404.inicio')}
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => router.back()}>
            {t('e404.volver')}
          </button>
        </div>
      </div>
    </main>
  );
}
