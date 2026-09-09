'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  sesionesAbiertasAPI,
  cerrarSesionAPI,
  cerrarLasDemasAPI,
  extraerError,
  INACTIVIDAD_MINUTOS,
  type SesionAbierta,
} from '@/lib/api';
import { haceCuanto, lugarDeSesion } from '@/lib/fechas';
import { useI18n } from '@/lib/i18n';

/**
 * Desde dónde está abierta tu cuenta, y el botón para cerrarlo.
 *
 * ── Por qué esto es la parte que de verdad tranquiliza ─────────────────────
 *
 * Los relojes del servidor cierran las sesiones abandonadas solas, y eso
 * arregla el caso general. Pero el miedo concreto —«entré desde el computador
 * de la sala y me fui»— no se cura con una promesa: se cura viendo la lista y
 * pulsando un botón. Esta pantalla convierte una sospecha en algo que la
 * persona puede comprobar y resolver desde su celular, en diez segundos, sin
 * llamar a nadie.
 *
 * La sesión desde la que se mira aparece marcada y **no se puede cerrar desde
 * aquí**: para eso está «Salir», y ofrecer dos botones que hacen lo mismo con
 * nombres distintos solo consigue que alguien se eche a sí mismo sin querer
 * mientras intenta echar a otro.
 */
export function DispositivosConectados() {
  const { t } = useI18n();
  const [sesiones, setSesiones] = useState<SesionAbierta[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setSesiones(await sesionesAbiertasAPI());
      setError('');
    } catch (e) {
      setError(extraerError(e, 'No se pudo consultar tus dispositivos.'));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cerrarUna(s: SesionAbierta) {
    setOcupado(true);
    setAviso('');
    try {
      await cerrarSesionAPI(s.id);
      setAviso(`Se cerró la sesión de ${s.dispositivo}.`);
      await cargar();
    } catch (e) {
      setError(extraerError(e, 'No se pudo cerrar esa sesión.'));
    } finally {
      setOcupado(false);
    }
  }

  async function cerrarTodas() {
    setOcupado(true);
    setAviso('');
    try {
      const r = await cerrarLasDemasAPI();
      setAviso(r.message);
      await cargar();
    } catch (e) {
      setError(extraerError(e, 'No se pudieron cerrar las otras sesiones.'));
    } finally {
      setOcupado(false);
    }
  }

  const otras = (sesiones ?? []).filter((s) => !s.actual);

  return (
    <section className="card mt-4 p-5">
      {/* ── Por qué esta descripción es una línea y no un párrafo ───────────
          Porque eran cinco renglones explicando el mecanismo —una fila por
          dispositivo, los veinte minutos de inactividad, qué pasa al volver a
          entrar— en una pantalla de ajustes que ya tiene tres bloques encima.
          Nadie viene aquí a estudiar cómo funcionan las sesiones: viene a mirar
          la lista y, como mucho, a cerrar una.

          Lo que se quitó no se pierde: está en el `title` de la sección, y sobre
          todo está en la propia lista, que ya dice desde dónde y desde cuándo.
          El comportamiento se explica solo en cuanto se mira. */}
      <h2
        className="text-lg font-semibold"
        title={`Hay una fila por dispositivo: volver a entrar desde el mismo navegador sustituye la anterior. Sin actividad, una sesión se cierra sola a los ${INACTIVIDAD_MINUTOS} minutos.`}
      >
        {t('config.dispositivos')}
      </h2>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('config.dispositivosDesc')}
      </p>

      {sesiones === null && !error && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Consultando…
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {aviso && (
        <p className="mb-3 text-sm" style={{ color: 'var(--ok)' }}>
          {aviso}
        </p>
      )}

      {sesiones && sesiones.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sesiones.map((s) => {
            const lugar = lugarDeSesion(s.zona, s.pais);
            return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <p className="font-semibold">
                  {s.dispositivo}
                  {s.actual && (
                    <span className="badge badge-gold ml-2">Este</span>
                  )}
                </p>
                {/* ── El sitio primero, la IP después y en pequeño ──────
                    Aquí solo salían el navegador y la IP, y con varias filas
                    del mismo navegador y la misma IP no había forma de
                    distinguirlas — que es justo la decisión que esta pantalla
                    pide tomar. «Bogotá · Colombia» sí se reconoce.

                    La IP se queda porque para quien sabe leerla es la prueba, y
                    para quien no, no estorba: va debajo y en gris. Ver
                    `lugarDeSesion`. */}
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {/* La hora se pinta en la zona de quien mira: el navegador ya
                      lo hace solo, y es la correcta por definición. */}
                  Activa {haceCuanto(s.lastSeenAt)}
                  {lugar ? ` · ${lugar}` : ''}
                </p>
                {s.ip && (
                  <p className="mono text-xs" style={{ color: 'var(--text-dim)' }}>
                    {s.ip}
                  </p>
                )}
              </div>
              {!s.actual && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void cerrarUna(s)}
                  className="btn btn-outline"
                >
                  Cerrar
                </button>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {otras.length > 0 && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void cerrarTodas()}
          className="btn btn-outline mt-4 self-start"
        >
          {ocupado
            ? 'Cerrando…'
            : `Cerrar las otras ${otras.length === 1 ? 'sesión' : `${otras.length} sesiones`}`}
        </button>
      )}

      {sesiones && otras.length === 0 && !error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('config.sinOtrasSesiones')}
        </p>
      )}
    </section>
  );
}
