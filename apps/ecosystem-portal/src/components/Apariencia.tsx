'use client';

import { useEffect, useState } from 'react';
import api, { extraerError } from '@/lib/api';
import { aplicarTema, getTema, temaDelSistema, type Tema } from '@/lib/tema';
import { IDIOMAS, idiomaDeLocale, useI18n, type Idioma } from '@/lib/i18n';

/**
 * Cómo veo DINAMYT: el tema y el idioma.
 *
 * Va en el perfil, al lado de «Tu hora», porque las tres responden la misma
 * pregunta —cómo quiero ver esto— y porque esa pantalla ya existía para una de
 * ellas. Tres pantallas para tres preferencias del mismo tipo es la forma
 * segura de que nadie encuentre ninguna.
 *
 * ── Por qué se guarda en el servidor y no solo en el navegador ──
 *
 * Porque las cuatro webs viven en subdominios distintos —`dinamyt.org`,
 * `club.dinamyt.org`, `campeonatos.dinamyt.org`, `academy.dinamyt.org`— y
 * `localStorage` es **por origen**. Membresías y Campeonatos ya tenían modo
 * claro, cada una guardándolo en su propio navegador y con su propia clave: o
 * sea que quien prefiere el claro tenía que pedirlo cuatro veces, y otra vez en
 * cada dispositivo.
 *
 * Con `users.theme` y `users.locale` la respuesta es UNA, viaja con la cuenta y
 * vale en cualquier teléfono. El navegador se queda una copia, y hace falta: es
 * lo que permite pintar el tema bueno antes de saber quién eres (§4.9).
 *
 * ── Y por qué el tema se aplica ANTES de guardarlo ──
 *
 * Porque es lo único de esta pantalla que se ve al instante. Esperar a que el
 * servidor conteste para cambiar el color deja medio segundo en el que el botón
 * ya está pulsado y no ha pasado nada, y eso se lee como que no funcionó. Si el
 * guardado falla, se dice — pero la pantalla ya cambió, que es lo que se pedía.
 */
export function Apariencia({
  usuarioId,
  temaGuardado,
  localeGuardado,
}: {
  usuarioId: string;
  temaGuardado: string | null;
  localeGuardado: string | null;
}) {
  const { t, idioma, setIdioma } = useI18n();
  const [tema, setTema] = useState<Tema>('sistema');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // El servidor manda. Se aplica tras montar —no en el render— porque el HTML
  // se pinta antes de saber quién eres, y cambiarlo durante la hidratación
  // rompería el emparejamiento con lo que dejó el script anti-parpadeo.
  useEffect(() => {
    const delServidor = (temaGuardado ?? '') as Tema;
    const valido =
      delServidor === 'claro' ||
      delServidor === 'oscuro' ||
      delServidor === 'sistema';
    const elegido = valido ? delServidor : getTema();
    setTema(elegido);
    aplicarTema(elegido);
  }, [temaGuardado]);

  useEffect(() => {
    if (localeGuardado) setIdioma(idiomaDeLocale(localeGuardado));
  }, [localeGuardado, setIdioma]);

  async function guardar(cambios: { theme?: Tema; locale?: string }) {
    setOcupado(true);
    setMsg('');
    setError('');
    try {
      await api.patch(`/users/${usuarioId}/profile`, cambios);
      setMsg(t('perfil.guardado'));
    } catch (e) {
      setError(extraerError(e, t('comun.error')));
    } finally {
      setOcupado(false);
    }
  }

  function elegirTema(nuevo: Tema) {
    setTema(nuevo);
    aplicarTema(nuevo); // primero se ve, después se guarda
    void guardar({ theme: nuevo });
  }

  function elegirIdioma(nuevo: Idioma) {
    setIdioma(nuevo);
    // Se guarda el locale COMPLETO, no solo el idioma: de esta columna dependen
    // también las fechas y los números (§4.12), y `en` a secas daría formato
    // estadounidense a quien lo que quería era leer en inglés desde Colombia.
    void guardar({ locale: nuevo === 'en' ? 'en-US' : 'es-CO' });
  }

  const TEMAS: { valor: Tema; etiqueta: string }[] = [
    { valor: 'sistema', etiqueta: t('perfil.temaSistema') },
    { valor: 'claro', etiqueta: t('perfil.temaClaro') },
    { valor: 'oscuro', etiqueta: t('perfil.temaOscuro') },
  ];

  return (
    <section className="card mt-4 p-5">
      <h2 className="text-lg font-semibold">{t('perfil.apariencia')}</h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('perfil.aparienciaDesc')}
      </p>

      {/* ── Tema ── */}
      <div className="mt-4">
        <span className="text-sm font-semibold">{t('perfil.tema')}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMAS.map((op) => (
            <button
              key={op.valor}
              type="button"
              disabled={ocupado}
              onClick={() => elegirTema(op.valor)}
              className="btn btn-outline btn-sm"
              aria-pressed={tema === op.valor}
              style={
                tema === op.valor
                  ? {
                      background: 'var(--gold-soft)',
                      borderColor: 'var(--gold-dim)',
                      color: 'var(--gold)',
                      fontWeight: 800,
                    }
                  : undefined
              }
            >
              {op.etiqueta}
            </button>
          ))}
        </div>
        {tema === 'sistema' && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {/* Sin esto, «Como el sistema» es la única opción que no dice qué
                hace: las otras dos se ven al pulsarlas. */}
            {temaDelSistema() === 'claro'
              ? t('perfil.temaClaro')
              : t('perfil.temaOscuro')}
          </p>
        )}
      </div>

      {/* ── Idioma ── */}
      <div className="mt-4">
        <span className="text-sm font-semibold">{t('perfil.idioma')}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {IDIOMAS.map((l) => (
            <button
              key={l.codigo}
              type="button"
              disabled={ocupado}
              onClick={() => elegirIdioma(l.codigo)}
              className="btn btn-outline btn-sm"
              aria-pressed={idioma === l.codigo}
              style={
                idioma === l.codigo
                  ? {
                      background: 'var(--gold-soft)',
                      borderColor: 'var(--gold-dim)',
                      color: 'var(--gold)',
                      fontWeight: 800,
                    }
                  : undefined
              }
            >
              {l.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="msg-ok mt-3 text-sm">{msg}</p>}
      {error && <p className="msg-error mt-3 text-sm">{error}</p>}
    </section>
  );
}
