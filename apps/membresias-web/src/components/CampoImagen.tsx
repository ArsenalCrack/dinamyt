'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { ErrorFoto, fotoDesdeArchivo, logoDesdeArchivo } from '@/lib/imagen';
import { Avatar } from './Avatar';
import { LogoClub } from './LogoClub';

/**
 * Subir una imagen: la foto de una persona o el escudo del club.
 *
 * El archivo NO se sube tal cual: se recorta y se recomprime en el propio
 * navegador hasta dejarlo en unas decenas de KB (ver `lib/imagen.ts`). Lo que
 * sale de aquí es un data-URL pequeño, y lo que se hace con él lo decide quien
 * monta el componente: la foto propia va a `/auth/me`, la de un alumno a
 * `/users/:id` y el escudo a `/mi-club`.
 *
 * Las dos variantes comparten este archivo porque lo que cuesta —esperar, dar
 * el error donde se está mirando, no dejar el input pegado— es idéntico; lo que
 * cambia (recortar o encajar, JPEG o PNG, redondo o cuadrado) está en dos
 * líneas.
 *
 * `accept="image/*"` sin `capture`: en el celular eso abre el selector con la
 * cámara Y la galería. Forzar la cámara obligaría a repetir la foto que el
 * maestro ya tiene guardada del día de la inscripción.
 */
export function CampoImagen({
  variante = 'foto',
  src,
  nombre,
  onCambiar,
}: {
  variante?: 'foto' | 'logo';
  src?: string | null;
  /** Nombre de la persona o del club: da las iniciales y el texto alternativo. */
  nombre: string;
  /** Recibe el data-URL, o `null` cuando se quita la imagen. */
  onCambiar: (imagen: string | null) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const entrada = useRef<HTMLInputElement | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<ClaveTexto | null>(null);

  const esLogo = variante === 'logo';
  const preparar = esLogo ? logoDesdeArchivo : fotoDesdeArchivo;
  const textos = esLogo
    ? { poner: 'logo.poner', cambiar: 'logo.cambiar', ayuda: 'logo.ayuda' }
    : { poner: 'foto.poner', cambiar: 'foto.cambiar', ayuda: 'foto.ayuda' };

  async function elegida(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // El input se limpia SIEMPRE: sin esto, volver a elegir el mismo archivo
    // (tras un error, por ejemplo) no dispara ningún evento.
    e.target.value = '';
    if (!file) return;

    setError(null);
    setTrabajando(true);
    try {
      await onCambiar(await preparar(file));
    } catch (err) {
      setError(err instanceof ErrorFoto ? err.clave : 'foto.errorGuardar');
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar() {
    setError(null);
    setTrabajando(true);
    try {
      await onCambiar(null);
    } catch {
      setError('foto.errorGuardar');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
      {esLogo ? (
        <LogoClub src={src} nombre={nombre} size={72} />
      ) : (
        <Avatar src={src} nombre={nombre} size={72} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          onChange={elegida}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={trabajando}
            onClick={() => entrada.current?.click()}
          >
            {trabajando
              ? t('foto.procesando')
              : t((src ? textos.cambiar : textos.poner) as ClaveTexto)}
          </button>
          {src && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={trabajando}
              onClick={quitar}
            >
              {t('foto.quitar')}
            </button>
          )}
        </div>
        <p className={error ? 'msg-error' : 'muted'} style={{ fontSize: '0.7rem' }}>
          {error ? t(error) : t(textos.ayuda as ClaveTexto)}
        </p>
      </div>
    </div>
  );
}
