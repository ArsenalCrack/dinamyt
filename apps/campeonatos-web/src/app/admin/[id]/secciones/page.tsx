'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  listSeccionesAPI,
  generarSeccionesAPI,
  asignarSeccionesAPI,
  generarBracketAPI,
  getCampeonatoAPI,
  guardarCategoriasAPI,
  extraerError,
  type Seccion,
  type ModalidadCampeonato,
  type CategoriasConfig,
} from '@/lib/api';
import { ConfigCategorias, esConfigCompleta } from './ConfigCategorias';
import { getSesion, esAdmin } from '@/lib/session';

export default function SeccionesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [modalidades, setModalidades] = useState<ModalidadCampeonato[]>([]);
  const [estadoCamp, setEstadoCamp] = useState<string | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Con el evento EN CURSO o FINALIZADO la configuración queda congelada
  // (la API también lo exige): regenerar destruiría colas y llaves.
  const congelado = estadoCamp === 'EN_CURSO' || estadoCamp === 'FINALIZADO';

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [secs, detalle] = await Promise.all([
        listSeccionesAPI(campId),
        getCampeonatoAPI(campId),
      ]);
      setSecciones(secs);
      setModalidades(detalle.modalidades);
      setEstadoCamp(detalle.estado);
      setEstado('ok');
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar las secciones.') });
      setEstado('error');
    }
  }, [campId]);

  async function guardarCategorias(modalidad: string, categorias: CategoriasConfig) {
    setMsg(null);
    setOcupado(true);
    try {
      await guardarCategoriasAPI(campId, modalidad as ModalidadCampeonato['modalidad'], categorias);
      setMsg({ tipo: 'ok', texto: `Categorías de ${modalidad} guardadas.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron guardar las categorías.') });
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    // Secciones y llaves son SOLO del administrador (la API también lo exige).
    if (!esAdmin(getSesion())) {
      router.replace('/admin');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function generar() {
    setMsg(null);
    setOcupado(true);
    try {
      const { total } = await generarSeccionesAPI(campId);
      setMsg({ tipo: 'ok', texto: `Se generaron ${total} secciones.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron generar las secciones.') });
    } finally {
      setOcupado(false);
    }
  }

  async function asignar() {
    setMsg(null);
    setOcupado(true);
    try {
      const { asignadas } = await asignarSeccionesAPI(campId);
      setMsg({ tipo: 'ok', texto: `Se asignaron ${asignadas} inscripciones a sus secciones.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron asignar las inscripciones.') });
    } finally {
      setOcupado(false);
    }
  }

  async function generarLlave(seccionId: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await generarBracketAPI(seccionId);
      setMsg({ tipo: 'ok', texto: 'Llave generada para la sección.' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudo generar la llave (¿al menos 2 competidores?).') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Secciones y llaves
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Genera las secciones del campeonato, asigna las inscripciones a la sección
        que les corresponde y crea la llave (bracket) de cada sección de combate.
      </p>

      {/* Candado: con el evento en curso ya no se toca la configuración */}
      {congelado && (
        <div
          className="mb-5 rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{ borderColor: 'var(--gold)', background: 'rgba(240,184,0,0.07)', color: 'var(--gold)' }}
        >
          🔒 El campeonato está {estadoCamp}: las categorías y secciones quedaron
          congeladas. Dirige el evento desde{' '}
          <Link href={`/admin/${campId}/tatamis`} style={{ textDecoration: 'underline' }}>
            Tatamis
          </Link>.
        </div>
      )}

      {/* Configuración de categorías por modalidad (rangos → secciones) */}
      {modalidades.length > 0 && !congelado && (
        <section className="mb-6">
          <h2 className="mb-1 text-lg font-semibold">Paso 1 · Configura cada modalidad</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Abre cada modalidad y responde: <strong>¿compiten géneros por
            separado o mixto?</strong>, <strong>¿qué cinturones entran y cómo se
            agrupan?</strong>, <strong>¿qué edades?</strong> y (si aplica){' '}
            <strong>¿qué pesos?</strong>. Con eso el sistema genera las
            secciones automáticamente — cada combinación es una categoría que
            se abre en el campeonato.
          </p>
          <div className="grid gap-2">
            {modalidades.map((m) => (
              <details key={m.id} className="card p-0">
                <summary
                  className="flex cursor-pointer items-center justify-between px-4 py-3 font-semibold"
                  style={{ listStyle: 'none' }}
                >
                  <span>
                    ⚙ {m.modalidad.replaceAll('_', ' ')}
                    {/* "Configurada" SOLO si todas las dimensiones requeridas
                        (cinturón, edad y peso donde aplique) están completas. */}
                    <span
                      className={`badge ml-2 ${
                        esConfigCompleta(m.modalidad, m.categorias)
                          ? 'badge-ok'
                          : m.categorias
                            ? 'badge-live'
                            : 'badge-info'
                      }`}
                    >
                      {esConfigCompleta(m.modalidad, m.categorias)
                        ? 'Configurada'
                        : m.categorias
                          ? 'Incompleta'
                          : 'Sin configurar'}
                    </span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>▾</span>
                </summary>
                <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                  <ConfigCategorias
                    modalidad={m.modalidad}
                    inicial={m.categorias}
                    guardando={ocupado}
                    onGuardar={(c) => guardarCategorias(m.modalidad, c)}
                  />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {!congelado && (
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={generar}
          disabled={ocupado}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
          title="Crea las secciones (categorías) a partir de la configuración de arriba"
        >
          Paso 2 · Generar secciones
        </button>
        <button
          onClick={asignar}
          disabled={ocupado}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
          title="Toma TODAS las inscripciones ya aprobadas y las coloca en su sección por cinturón, edad, peso y género (útil si generaste las secciones después de aprobar)"
        >
          Paso 3 · Colocar aprobados en sus llaves
        </button>
        <Link
          href={`/admin/${campId}/inscripciones`}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Revisar inscripciones
        </Link>
        <Link
          href={`/admin/${campId}`}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Inscribir competidores
        </Link>
        <Link
          href={`/admin/${campId}/tatamis`}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Paso 4 · Tatamis (evento en vivo)
        </Link>
      </div>
      )}

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}>
          {msg.texto}
        </p>
      )}

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'ok' && secciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          Aún no hay secciones. Pulsa «Generar secciones».
        </p>
      )}

      {/* Secciones agrupadas por modalidad: con muchas categorías abiertas,
          cada modalidad se pliega y muestra su total. */}
      <div className="grid gap-2">
        {[...new Set(secciones.map((s) => s.modalidad))].map((mod) => {
          const deMod = secciones.filter((s) => s.modalidad === mod);
          return (
            <details key={mod} className="card p-0" open={deMod.length <= 6}>
              <summary
                className="flex cursor-pointer items-center justify-between px-4 py-3 font-semibold"
                style={{ listStyle: 'none' }}
              >
                <span>
                  {mod.replaceAll('_', ' ')}
                  <span className="badge badge-gold ml-2">{deMod.length} secciones</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>▾</span>
              </summary>
              <ul className="grid gap-2 border-t px-3 py-3 sm:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
                {deMod.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold" title={s.nombre}>
                        {s.nombre}
                      </h3>
                      <span
                        className={`badge mt-0.5 ${s.estado === 'EN_CURSO' ? 'badge-live' : s.estado === 'FINALIZADA' ? 'badge-ok' : ''}`}
                      >
                        {s.estado}
                      </span>
                    </div>
                    {s.modalidad === 'combate' && !congelado && (
                      <button
                        onClick={() => generarLlave(s.id)}
                        disabled={ocupado}
                        className="btn btn-gold btn-sm shrink-0"
                      >
                        Llave
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </main>
  );
}
