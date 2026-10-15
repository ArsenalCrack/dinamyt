'use client';

import { useRef, useState, type FormEvent } from 'react';
import api, { cerrarSesion, extraerError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { CampoContrasena } from '@/components/CampoContrasena';
import { ModalAccesible } from '@/components/Confirmar';

/** La palabra que hay que escribir. El servidor la exige igual. */
const PALABRA = 'BORRAR';

/**
 * «Borrar mi cuenta», al final de Configuración.
 *
 * ── Cómo se pregunta, y por qué así ──
 *
 * Es lo único de DINAMYT que no tiene vuelta atrás para la propia persona, así
 * que pide más que un clic:
 *
 * · el aviso de lo irreversible (borde rojo, icono, la franja que lo dice), con
 *   lo que pasa AHORA, lo que pasa en siete días y lo que se queda;
 * · la contraseña —si quien está delante no es el dueño, aquí se para—;
 * · y escribir BORRAR, que obliga a leer antes de apuntar. El botón no se
 *   enciende hasta que están las dos.
 *
 * El foco arranca en «Cancelar», y los errores (contraseña mal, la única que
 * administra un club) se quedan dentro del aviso, donde se están mirando.
 *
 * Al confirmar, el servidor cierra todas las sesiones; aquí se olvida la de
 * este navegador y se va al login con la fecha a la vista.
 */
export function BorrarMiCuenta() {
  const { t, idioma } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [palabra, setPalabra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const cancelarRef = useRef<HTMLButtonElement>(null);

  const listo = contrasena.length > 0 && palabra.trim().toUpperCase() === PALABRA && !enviando;

  function cerrar() {
    if (enviando) return;
    setAbierto(false);
    setContrasena('');
    setPalabra('');
    setError('');
  }

  async function borrar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    setError('');
    try {
      const res = await api.post('/users/me/borrado', {
        contrasena,
        confirmacion: palabra.trim().toUpperCase(),
      });
      const fecha = new Date((res.data as { borrarEl: string }).borrarEl).toLocaleString(
        idioma === 'en' ? 'en-US' : 'es-CO',
        { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23' },
      );
      await cerrarSesion();
      window.location.href = `/login?motivo=${encodeURIComponent(
        `${t('borrar.hechoA')}${fecha}${t('borrar.hechoB')}`,
      )}`;
    } catch (err) {
      setError(extraerError(err, t('borrar.error')));
      setEnviando(false);
    }
  }

  return (
    <section
      className="card mt-4 flex flex-col gap-3 p-5"
      style={{ borderColor: 'var(--danger)' }}
    >
      <h2 className="text-lg font-semibold">{t('borrar.titulo')}</h2>
      <p className="-mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('borrar.ayuda')}
      </p>
      <button type="button" className="btn btn-danger self-start" onClick={() => setAbierto(true)}>
        {t('borrar.boton')}
      </button>

      {abierto && (
        <ModalAccesible
          titulo={t('borrar.pregunta')}
          tono="irreversible"
          textoIrreversible={t('borrar.sinVuelta')}
          focoInicial={cancelarRef}
          onCancelar={cerrar}
          campos={
            <form id="form-borrar-cuenta" onSubmit={borrar}>
              <label className="confirmar-campo">
                <span>{t('borrar.contrasena')}</span>
                <CampoContrasena
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="confirmar-campo">
                <span>{t('borrar.escribe')}</span>
                <input
                  value={palabra}
                  onChange={(e) => setPalabra(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-describedby={error ? 'borrar-error' : undefined}
                />
              </label>
              {error && (
                <p id="borrar-error" className="confirmar-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          }
          botones={
            <>
              <button
                type="button"
                ref={cancelarRef}
                className="btn btn-outline"
                disabled={enviando}
                onClick={cerrar}
              >
                {t('comun.cancelar')}
              </button>
              <button type="submit" form="form-borrar-cuenta" className="btn btn-danger" disabled={!listo}>
                {enviando ? t('borrar.enviando') : t('borrar.si')}
              </button>
            </>
          }
        >
          <div className="confirmar-detalle">
            <ul>
              <li>{t('borrar.sesiones')}</li>
              <li>{t('borrar.plazo')}</li>
              <li>{t('borrar.queBorra')}</li>
              <li>{t('borrar.queQueda')}</li>
            </ul>
          </div>
        </ModalAccesible>
      )}
    </section>
  );
}
