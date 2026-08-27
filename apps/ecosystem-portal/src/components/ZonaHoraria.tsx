'use client';

import { useEffect, useState } from 'react';
import api, { extraerError } from '@/lib/api';
import { nombreDeZona, zonaDelNavegador, instante } from '@/lib/fechas';

/**
 * A qué hora se te escribe.
 *
 * ── Qué arregla, y qué NO hacía falta arreglar ─────────────────────────────
 *
 * En pantalla las horas ya salían bien: el navegador sabe dónde está y
 * `toLocaleString` usa su zona. Eso no era el problema.
 *
 * El problema es todo lo que se escribe en el SERVIDOR, cuando la persona no
 * está delante: los correos de vencimiento, los avisos de Academy. Ahí no hay
 * navegador al que preguntar, y el VPS corre con `TZ=America/Bogota`, así que
 * a un maestro en Madrid le llegaba «vence el martes» calculado con el día de
 * Bogotá. Por eso la zona se GUARDA, y por eso solo hay una pantalla para
 * ella: esta.
 *
 * ── Por qué normalmente no hay que tocar nada ──
 *
 * Se detecta sola al entrar y se vuelve a comprobar en cada renovación de la
 * sesión, así que quien viaja o se muda empieza a recibir las cosas en su hora
 * sin enterarse de que esta pantalla existe. Elegirla a mano es para el caso
 * contrario: quien está de viaje y quiere que le sigan escribiendo a la hora
 * de su club. Esa elección queda protegida de la detección automática — una
 * preferencia que se borra sola no es una preferencia.
 */
export function ZonaHoraria({
  usuarioId,
  zonaGuardada,
  manual,
}: {
  usuarioId: string;
  zonaGuardada: string | null;
  manual: boolean;
}) {
  const [zona, setZona] = useState(zonaGuardada);
  const [aMano, setAMano] = useState(manual);
  const [detectada, setDetectada] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => setDetectada(zonaDelNavegador()), []);

  async function guardar(nueva: string | null) {
    setOcupado(true);
    setMsg('');
    setError('');
    try {
      await api.patch(`/users/${usuarioId}/profile`, { timezone: nueva });
      setZona(nueva ?? detectada);
      setAMano(!!nueva);
      setMsg(
        nueva
          ? 'Guardada. Te escribiremos siempre a esta hora.'
          : 'Volvemos a detectarla sola cada vez que entres.',
      );
    } catch (e) {
      setError(extraerError(e, 'No se pudo guardar la zona horaria.'));
    } finally {
      setOcupado(false);
    }
  }

  const distinta = !!detectada && !!zona && detectada !== zona;

  return (
    <section className="card mt-4 p-5">
      <h2 className="text-lg font-semibold">Tu hora</h2>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Con esta zona te escribimos los correos y los avisos. En pantalla las
        horas ya salen en la de tu dispositivo, siempre.
      </p>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Zona guardada</dt>
          <dd className="font-semibold">
            {nombreDeZona(zona)}
            {aMano && (
              <span className="badge ml-2">Elegida por ti</span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>
            Zona de este dispositivo
          </dt>
          <dd>{nombreDeZona(detectada)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt style={{ color: 'var(--text-muted)' }}>Ahora mismo son</dt>
          {/* La prueba de que está bien puesta, en una línea: si esta hora no
              es la del reloj de la pared, la zona está mal. */}
          <dd className="font-mono">{instante(new Date())}</dd>
        </div>
      </dl>

      {msg && (
        <p className="mt-3 text-sm" style={{ color: 'var(--ok)' }}>
          {msg}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {distinta && !aMano && (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Este dispositivo está en otra zona. Se guardará sola la próxima vez
          que entres; si quieres que sea esta desde ya, fíjala.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {detectada && detectada !== zona && (
          <button
            type="button"
            disabled={ocupado}
            className="btn btn-outline"
            onClick={() => void guardar(detectada)}
          >
            Usar la de este dispositivo
          </button>
        )}
        {!aMano && zona && (
          <button
            type="button"
            disabled={ocupado}
            className="btn btn-outline"
            onClick={() => void guardar(zona)}
          >
            Fijar {nombreDeZona(zona)} y no cambiarla al viajar
          </button>
        )}
        {aMano && (
          <button
            type="button"
            disabled={ocupado}
            className="btn btn-outline"
            onClick={() => void guardar(null)}
          >
            Volver a detectarla sola
          </button>
        )}
      </div>
    </section>
  );
}
