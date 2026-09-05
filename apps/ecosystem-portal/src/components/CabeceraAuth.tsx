'use client';

import Link from 'next/link';

/**
 * La cabecera de las pantallas de entrar: logo, antetítulo y título.
 *
 * ── Por qué es un componente y no seis copias ──
 *
 * Porque ya eran seis copias, y ya se habían separado. Auditado el 5 de
 * septiembre de 2026 en el portal:
 *
 *   · `login` ponía el logo a 72 px FUERA de la tarjeta, con la palabra
 *     «DINAMYT» debajo en `.display`.
 *   · `registro` también a 72 px, pero su «DINAMYT» era
 *     `text-xl font-extrabold tracking-wide` — **no** `.display`—, y su título
 *     un `text-2xl font-bold` dorado en vez de la tipografía de rol.
 *   · `recuperar` a 72 px con `.display`.
 *   · `verificar`, `poner-contrasena` y `salir` no tenían logo ninguno.
 *
 * Seis pantallas de la misma familia y cuatro cabeceras distintas. Nadie lo
 * hizo mal: se copió la de al lado y se retocó, que es como se separan siempre
 * las cosas que no tienen un solo sitio.
 *
 * ── Y el modelo es Membresías ──
 *
 * Logo de 56 px DENTRO de la tarjeta, antetítulo en mono dorado y el título con
 * la segunda palabra en oro. Las medidas viven en
 * `packages/shared/estilos.css` (`.eco-login-*`), así que son literalmente las
 * mismas que las de Membresías, Academy y Campeonatos.
 *
 * El logo lleva al portal: ninguna pantalla del ecosistema es un callejón sin
 * salida. Se puede quitar con `enlazar={false}` donde ya estás en el portal y
 * el enlace no lleva a ninguna parte nueva.
 */
export function CabeceraAuth({
  antetitulo,
  titulo,
  acento,
  subtitulo,
  enlazar = true,
}: {
  antetitulo: string;
  /** La primera mitad del título, en el color del texto. */
  titulo: string;
  /** La segunda mitad, en oro. Es la firma de la pantalla en las cuatro apps. */
  acento?: string;
  subtitulo?: string;
  enlazar?: boolean;
}) {
  /* eslint-disable-next-line @next/next/no-img-element */
  const logo = <img src="/logo.png" alt="DINAMYT" className="eco-login-logo" />;

  return (
    <>
      {enlazar ? (
        <Link href="/" title="DINAMYT">
          {logo}
        </Link>
      ) : (
        logo
      )}
      <p className="eyebrow eco-login-eyebrow">{antetitulo}</p>
      <h1 className="display eco-login-titulo">
        {titulo}
        {acento ? (
          <>
            {' '}
            <span style={{ color: 'var(--gold)' }}>{acento}</span>
          </>
        ) : null}
      </h1>
      {subtitulo ? <p className="muted eco-login-subtitulo">{subtitulo}</p> : null}
    </>
  );
}
