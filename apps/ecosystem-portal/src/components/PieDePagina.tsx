'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Version } from '@/components/Version';
import { CORREO_SOPORTE } from '@/lib/contacto';
import { useI18n } from '@/lib/i18n';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';

/**
 * El aviso de derechos, que hasta ahora solo llevaba Membresías.
 *
 * Los dos pies eran distintos en dos aplicaciones que son la misma cuenta: el
 * de aquí tenía marca, enlaces y soporte pero ningún aviso de derechos; el del
 * club tenía el aviso y nada más. Ahora los dos dicen lo mismo en el mismo
 * orden —arriba quién es y dónde pedir ayuda, abajo de quién es esto— y solo
 * cambia el nombre de la aplicación y sus enlaces.
 *
 * El año va desde el de creación hasta el actual y se calcula al vuelo: un
 * aviso que dice 2026 en 2030 se lee como un proyecto abandonado.
 */
const AÑO_INICIAL = 2026;
const AUTOR = 'Amir Sarmiento';

/**
 * El pie del portal. Va en el `layout`, así que sale en TODAS las pantallas
 * —incluidas login, registro, recuperar y poner-contraseña—, y esa es la
 * razón de que exista: hasta hoy las dos únicas direcciones del portal
 * estaban en la página de planes y en la política de privacidad, que no es
 * donde busca ayuda quien no consigue entrar a su cuenta.
 *
 * ── Por qué dejó de ser de servidor ──
 *
 * Lo era, y era una ventaja de verdad: no pesaba ni un byte en el paquete del
 * navegador. Pero el pie sale en TODAS las pantallas y estaba escrito solo en
 * castellano, así que era la línea sin traducir que más veces se lee de toda la
 * aplicación — y `useI18n` es un hook, que en un componente de servidor no
 * existe.
 *
 * El cambio cuesta unos cientos de bytes; el pie no tiene estado ni efectos,
 * solo lee el idioma. Es lo mismo que ya hacía `PieLegal` en Membresías.
 *
 * ── Cómo se reparte, y por qué cambia en el celular ───────────────────────
 *
 * En escritorio son dos bloques a los extremos (`justify-between`); en el
 * celular no caben en una fila, y `flex-wrap` los dejaba pegados a la
 * izquierda con la dirección de correo colgando fuera de la pantalla. Debajo
 * de `sm` la fila se convierte en **columna centrada**, que es la única forma
 * de que una lista de cuatro enlaces de anchos distintos no parezca rota.
 *
 * La dirección de soporte va **en su propia línea**, separada de su etiqueta:
 * «¿Necesitas ayuda? soporte@dinamyt.org» junto es un solo bloque de texto
 * demasiado largo para 320 px, y un correo partido por la mitad no se puede
 * ni leer ni copiar.
 */
export function PieDePagina() {
  const { t } = useI18n();
  const ahora = new Date().getFullYear();
  const años = ahora > AÑO_INICIAL ? `${AÑO_INICIAL}–${ahora}` : String(AÑO_INICIAL);

  return (
    <footer className="border-t py-8" style={{ borderColor: 'var(--border)' }}>
      <div
        className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center text-sm sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" width={22} height={22} />
          DINAMYT Ecosystem · Hapkido
        </span>
        <nav className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-x-4 sm:gap-y-2">
          <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {/* Las tres claves existian desde el principio y NADIE las usaba:
                el pie imprimia los literales en espaniol al lado de un
                `t('pie.ayuda')` que si traducia. Media traduccion es peor que
                ninguna, porque nadie la busca. */}
            <Link href="/planes">{t('pie.planes')}</Link>
            <Link href="/privacidad">{t('pie.privacidad')}</Link>
            <a href={`${CAMPEONATOS_URL}/pantalla`}>{t('pie.resultados')}</a>
          </span>
          <a
            href={`mailto:${CORREO_SOPORTE}`}
            style={{ color: 'var(--gold)' }}
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5"
          >
            <span aria-hidden="true">✉</span>
            <span style={{ color: 'var(--text-muted)' }}>{t('pie.ayuda')}</span>
            <span className="break-all">{CORREO_SOPORTE}</span>
          </a>
        </nav>
      </div>

      {/* La franja de derechos, separada por una raya: no es navegación, es un
          aviso legal, y va debajo de todo lo que sí se toca. */}
      <div
        className="mx-auto mt-6 max-w-6xl border-t px-4 pt-4 text-center sm:px-6"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <p className="text-xs">
          © {años} <strong style={{ color: 'var(--text)' }}>{AUTOR}</strong> ·{' '}
          {t('pie.derechos')}
        </p>
        <p className="mt-0.5 text-xs opacity-75">
          {t('pie.obra')}
        </p>
        {/* La versión que está corriendo. Va aquí, al final del todo, porque no
            es algo que nadie venga a buscar — es algo que hace falta tener a
            mano el día que alguien dice «me sigue pasando». */}
        <p className="mt-1.5">
          <Version />
        </p>
      </div>
    </footer>
  );
}
