'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { LIM } from '@/lib/campos';
import { CampoFecha } from '@/components/CampoFecha';
import { Contador } from '@/components/Contador';
import { SelectMenu } from '@/components/SelectMenu';
import { avisoError, avisoOk } from '@/lib/toast';

interface Exc {
  id: string;
  date: string;
  isClosed: boolean;
  note: string | null;
}

/**
 * ── Los topes de los calendarios de esta pantalla ──
 *
 * Un `<input type="date">` —y el calendario propio que lo sustituye— acepta lo
 * que se le ponga como límite, así que sin topes razonables la fecha de un
 * festivo podía caer en 2003 o en 2087. No es maldad: es que el año se teclea
 * o se pasa con una flecha, y una cifra de más no se nota hasta que la lista
 * sale desordenada.
 */
function haceUnMes(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function dentroDeAnos(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

/** Una clase del club. `null` como id no existe: eso es «todo el club». */
interface Grupo {
  id: string;
  name: string;
  descripcion: string | null;
}

/** Un día de clase. `groupId` nulo = del club sin dividir. */
interface Dia {
  groupId: string | null;
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
}

interface Nota {
  groupId: string | null;
  semana: string;
  nota: string;
}

/**
 * La clave con la que se identifica una clase en los diccionarios de esta
 * pantalla. El club sin dividir es la cadena vacía, no `null`: un objeto no
 * puede tener `null` de clave, y con `'null'` como texto se confundiría con una
 * clase que se llamara así.
 */
const CLUB = '';

/** Nombres de los días en el idioma activo, sin diccionario propio. */
function nombresDias(idioma: string, largo = true): string[] {
  const fmt = new Intl.DateTimeFormat(idioma === 'en' ? 'en-GB' : 'es-CO', {
    weekday: largo ? 'long' : 'short',
  });
  // 2024-01-07 fue domingo: la semana arranca ahí para que el índice 0..6
  // coincida con el `weekday` que guarda la API.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i);
    const nombre = fmt.format(d);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  });
}

/**
 * El LUNES de la semana que contiene esa fecha.
 *
 * La misma regla que aplica la API al guardar la nota (`lunesDe` en su
 * `lib/schedule.ts`): la semana va de lunes a domingo, así que el domingo
 * pertenece a la semana que empezó SEIS días antes, no a la que empieza mañana.
 * Sin esto, el maestro que escribe la nota un domingo la guardaría en la semana
 * siguiente sin enterarse.
 */
function lunesDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dia = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dia - 1));
  return d.toISOString().slice(0, 10);
}

/** Corre la semana `n` semanas adelante (o atrás si es negativo). */
function masSemanas(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/** Las horas que ofrece el desplegable: de 5:00 a 22:30, de media en media. */
const HORAS = (() => {
  const out: string[] = [];
  for (let h = 5; h <= 22; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

/**
 * Las clases del club y su calendario.
 *
 * **Qué cambió aquí.** Esta pantalla eran siete casillas: los días que abre el
 * club. Eso le bastaba al club que da una sola clase, pero no al que parte a sus
 * alumnos —los niños a las cuatro, los adultos a las seis—, que no tenía dónde
 * decirlo: las dos mitades compartían un horario que no le servía a ninguna.
 *
 * Ahora el club puede tener clases, cada una con sus días, sus horas, su
 * descripción y su nota de la semana. Si no crea ninguna, esta pantalla se
 * comporta igual que antes: un horario y ya.
 */
export default function Calendario() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  /** Los días marcados, tal como se están editando. Se guardan todos de golpe. */
  const [dias, setDias] = useState<Dia[]>([]);
  const [exc, setExc] = useState<Exc[]>([]);
  const [nueva, setNueva] = useState({ date: '', isClosed: true, note: '' });
  const [nuevaClase, setNuevaClase] = useState({ name: '', descripcion: '' });
  const [creando, setCreando] = useState(false);
  /** Qué clase está esperando confirmación para borrarse. */
  const [borrando, setBorrando] = useState<string | null>(null);
  /** La semana que se está mirando, siempre un lunes. */
  const [semana, setSemana] = useState(() => lunesDe(hoyISO()));
  /** La nota de cada clase para esa semana, indexada por id (o `CLUB`). */
  const [notas, setNotas] = useState<Record<string, string>>({});
  /**
   * Lo mismo, pero tal como está EN EL SERVIDOR.
   *
   * Es la copia contra la que se compara para saber qué queda por guardar. Sin
   * ella no hay forma de dibujar el aviso de «sin guardar», y ese aviso es la
   * mitad del arreglo: la otra mitad —los dos botones que decían «Guardar»—
   * solo explica por qué se perdían las horas, no evita que se vuelvan a
   * perder al salir de la pantalla sin pulsar nada.
   */
  const [guardado, setGuardado] = useState<{
    dias: Dia[];
    notas: Record<string, string>;
    /** El nombre y la descripción de cada clase, tal como están guardados. */
    grupos: Grupo[];
  }>({ dias: [], notas: {}, grupos: [] });
  /** Qué clase se está guardando (su id, o `CLUB`). */
  const [guardando, setGuardando] = useState<string | null>(null);
  /** Solo para fallos al CARGAR el calendario; lo demás va por la nube flotante. */
  const [error, setError] = useState('');

  const cargar = useCallback(
    async (deLaSemana: string) => {
      try {
        const { data } = await api.get<{
          grupos: Grupo[];
          dias: Dia[];
          excepciones: Exc[];
          semana: string;
          notas: Nota[];
        }>('/schedule', { params: { semana: deLaSemana } });
        setGrupos(data.grupos);
        const dias = data.dias.map((d) => ({
          groupId: d.groupId ?? null,
          weekday: d.weekday,
          opensAt: d.opensAt ?? null,
          closesAt: d.closesAt ?? null,
        }));
        setDias(dias);
        setExc(data.excepciones);
        const porClase: Record<string, string> = {};
        for (const n of data.notas) porClase[n.groupId ?? CLUB] = n.nota;
        setNotas(porClase);
        setGuardado({ dias, notas: porClase, grupos: data.grupos });
      } catch (e) {
        setError(mensajeError(e, t('comun.ninguno')));
      }
    },
    [t],
  );

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar(semana);
  }, [cargandoSesion, user, esStaff, router, cargar, semana]);

  /** ¿Está marcado ese día para esa clase? */
  function marcado(clase: string, w: number): Dia | undefined {
    const id = clase === CLUB ? null : clase;
    return dias.find((d) => d.groupId === id && d.weekday === w);
  }

  function alternarDia(clase: string, w: number) {
    const id = clase === CLUB ? null : clase;
    setDias((lista) =>
      lista.some((d) => d.groupId === id && d.weekday === w)
        ? lista.filter((d) => !(d.groupId === id && d.weekday === w))
        : [...lista, { groupId: id, weekday: w, opensAt: null, closesAt: null }],
    );
  }

  function ponerHora(clase: string, w: number, campo: 'opensAt' | 'closesAt', v: string) {
    const id = clase === CLUB ? null : clase;
    setDias((lista) =>
      lista.map((d) =>
        d.groupId === id && d.weekday === w ? { ...d, [campo]: v || null } : d,
      ),
    );
  }

  /** Los días de una clase, en un texto comparable (mismo orden siempre). */
  function huellaDias(lista: Dia[], clase: string): string {
    const id = clase === CLUB ? null : clase;
    return lista
      .filter((d) => d.groupId === id)
      .map((d) => `${d.weekday}|${d.opensAt ?? ''}|${d.closesAt ?? ''}`)
      .sort()
      .join(',');
  }

  /** ¿Cambió el nombre o la descripción de esta clase? */
  function textoCambiado(clase: string): boolean {
    if (clase === CLUB) return false;
    const ahora = grupos.find((g) => g.id === clase);
    const antes = guardado.grupos.find((g) => g.id === clase);
    if (!ahora || !antes) return false;
    return (
      ahora.name !== antes.name ||
      (ahora.descripcion ?? '') !== (antes.descripcion ?? '')
    );
  }

  /** ¿Queda algo por guardar en esta clase —nombre, días, horas o nota—? */
  function sinGuardar(clase: string): boolean {
    return (
      textoCambiado(clase) ||
      huellaDias(dias, clase) !== huellaDias(guardado.dias, clase) ||
      (notas[clase] ?? '') !== (guardado.notas[clase] ?? '')
    );
  }

  /**
   * Guarda una clase entera: sus días con sus horas, y su nota de la semana.
   *
   * ── Por qué es UN botón y no dos ──
   *
   * Porque dos era el fallo. La tarjeta tenía un «Guardar» para la nota, justo
   * debajo de los selectores de hora, y el del horario vivía al final de la
   * pantalla, después de todas las clases. El maestro elegía la hora, pulsaba
   * el botón que tenía al lado, veía un «guardado» verde —cierto: la nota se
   * había guardado— y las horas no habían salido del navegador. Al recargar
   * volvían las de antes y parecía que la aplicación no las guardaba.
   *
   * ── Por qué el horario se manda entero ──
   *
   * Porque así es la ruta: `PUT /schedule` borra los días del club y escribe
   * los que van, que es lo que permite quitar un martes y poner un jueves en
   * un solo viaje. Consecuencia buena: guardar una clase arrastra también lo
   * que estuviera pendiente en otra, así que nada se queda por el camino. El
   * aviso de «sin guardar» de cada tarjeta desaparece a la vez, y eso es
   * exactamente lo que ha pasado.
   */
  async function guardarClaseEntera(clase: string) {
    setGuardando(clase);
    try {
      // El nombre y la descripción, PRIMERO y solo si cambiaron. Antes esto no
      // estaba aquí: se mandaba solo al salir del campo (ver el comentario de
      // `guardarClase`), que es lo que guardaba cosas que nadie había mandado
      // guardar.
      const g = grupos.find((x) => x.id === clase);
      if (g && textoCambiado(clase)) {
        await api.patch(`/schedule/groups/${g.id}`, {
          name: g.name,
          descripcion: g.descripcion,
        });
      }
      await api.put('/schedule', { dias });
      await api.put('/schedule/notes', {
        groupId: clase === CLUB ? null : clase,
        semana,
        nota: notas[clase] ?? '',
      });
      // Se relee del servidor: lo que se confirma es lo que quedó guardado, no
      // lo que se acaba de marcar en pantalla.
      await cargar(semana);
      avisoOk(clase === CLUB ? t('grupos.horarioGuardado') : t('grupos.guardada'));
    } catch (e) {
      avisoError(mensajeError(e, t('comun.guardar')));
    } finally {
      setGuardando(null);
    }
  }

  async function crearClase(e: FormEvent) {
    e.preventDefault();
    if (!nuevaClase.name.trim()) return;
    setCreando(true);
    try {
      await api.post('/schedule/groups', nuevaClase);
      setNuevaClase({ name: '', descripcion: '' });
      await cargar(semana);
      avisoOk(t('grupos.creada'));
    } catch (err) {
      avisoError(mensajeError(err, t('grupos.nueva')));
    } finally {
      setCreando(false);
    }
  }

/*
   * ── El renombrado al perder el foco: BORRADO a propósito ──
   *
   * Aquí había un `guardarClase(g)` que mandaba el nombre y la descripción en
   * cuanto el campo perdía el foco. Guardaba cosas que nadie había mandado
   * guardar: se tocaba el nombre para ver cómo quedaba, se pulsaba en
   * cualquier otro sitio de la pantalla —o simplemente se pasaba al campo de
   * al lado— y el cambio ya estaba en el servidor. Sin haber pulsado nada, sin
   * poder deshacerlo y sin que ninguna pantalla lo dijera.
   *
   * Peor: el aviso de «sin guardar» de cada tarjeta miraba los días y la nota,
   * pero no el nombre. Así que el único campo que se guardaba solo era también
   * el único que no aparecía como pendiente.
   *
   * Ahora el nombre y la descripción van con los días y la nota, en el botón
   * de guardar de la tarjeta, que es lo que este archivo ya defendía en el
   * comentario de `guardarClaseEntera`: **un botón por clase, y guarda todo lo
   * de esa clase.**
   */

  async function borrarClase(id: string) {
    try {
      await api.delete(`/schedule/groups/${id}`);
      setBorrando(null);
      await cargar(semana);
      avisoOk(t('grupos.eliminada'));
    } catch (err) {
      avisoError(mensajeError(err, t('grupos.eliminar')));
    }
  }

  async function agregarExc(e: FormEvent) {
    e.preventDefault();
    if (!nueva.date) return;
    try {
      await api.post('/schedule/exceptions', nueva);
      setNueva({ date: '', isClosed: true, note: '' });
      await cargar(semana);
      avisoOk(t('alumnos.actualizado'));
    } catch (err) {
      avisoError(mensajeError(err, t('calendario.agregarExcepcion')));
    }
  }

  async function borrarExc(id: string) {
    try {
      await api.delete(`/schedule/exceptions/${id}`);
      await cargar(semana);
      avisoOk(t('alumnos.actualizado'));
    } catch (e) {
      avisoError(mensajeError(e, t('comun.eliminar')));
    }
  }

  const DIAS = nombresDias(idioma);
  /**
   * Los mismos días, abreviados, para los siete botones de marcar.
   *
   * Iban con el nombre completo, y siete botones que dicen «Miércoles» con el
   * relleno de un `.btn` miden más de mil píxeles: se partían en tres o cuatro
   * renglones desiguales y el bloque de una clase ocupaba media pantalla antes
   * de llegar a las horas. Abreviados caben en una fila en un portátil y en dos
   * en el teléfono, y el nombre entero sigue estando donde hace falta leerlo
   * —el renglón de la hora— y en el `aria-label` del botón, que es lo que oye
   * quien no lo ve.
   */
  const DIAS_CORTOS = nombresDias(idioma, false);
  const opcionesHora = [
    { valor: '', etiqueta: '—' },
    ...HORAS.map((h) => ({ valor: h, etiqueta: h })),
  ];

  /**
   * El horario se dibuja igual para una clase que para el club entero: lo único
   * que cambia es qué `groupId` llevan las filas. Por eso es una función y no
   * dos bloques de JSX casi iguales.
   */
  function bloqueHorario(clase: string) {
    return (
      <>
        <div className="horario-dias">
          {DIAS.map((nombre, w) => (
            <button
              key={w}
              type="button"
              className={marcado(clase, w) ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
              aria-pressed={Boolean(marcado(clase, w))}
              // Abreviado en pantalla, entero para quien lo oye: «mié» leído en
              // voz alta no es una palabra.
              aria-label={nombre}
              title={nombre}
              // El auxiliar mira el calendario, no lo escribe: la ruta que lo
              // guarda es de `owner`. Sin esto los botones respondían al clic y
              // no había ningún sitio donde guardar lo que marcara.
              disabled={!esMaestro}
              onClick={() => alternarDia(clase, w)}
            >
              {DIAS_CORTOS[w]}
            </button>
          ))}
        </div>
        {/* La hora solo aparece en los días marcados: un selector de hora para
            un día en que no hay clase no significa nada. */}
        {DIAS.map((nombre, w) => {
          const d = marcado(clase, w);
          if (!d) return null;
          return (
            <div key={w} className="horario-dia">
              <span className="horario-dia-nombre">{nombre}</span>
              <SelectMenu
                valor={d.opensAt ?? ''}
                onChange={(v) => ponerHora(clase, w, 'opensAt', v)}
                etiquetaAria={`${t('grupos.abre')} · ${nombre}`}
                placeholder={t('grupos.abre')}
                opciones={opcionesHora}
                disabled={!esMaestro}
              />
              <SelectMenu
                valor={d.closesAt ?? ''}
                onChange={(v) => ponerHora(clase, w, 'closesAt', v)}
                etiquetaAria={`${t('grupos.cierra')} · ${nombre}`}
                placeholder={t('grupos.cierra')}
                opciones={opcionesHora}
                disabled={!esMaestro}
              />
            </div>
          );
        })}
      </>
    );
  }

  /**
   * La nota de la semana, igual para una clase que para el club entero.
   *
   * Ya no lleva botón propio: la guarda el «Guardar esta clase» de abajo, junto
   * con los días y las horas. Tenerlo era lo que hacía que las horas se
   * perdieran —dos botones que decían lo mismo y guardaban cosas distintas—.
   */
  function bloqueNota(clase: string) {
    return (
      <div style={{ marginTop: '0.9rem' }}>
        <label className="muted" style={{ fontSize: '0.72rem' }}>
          {t('grupos.nota')}
        </label>
        <textarea
          rows={2}
          value={notas[clase] ?? ''}
          onChange={(e) => setNotas((n) => ({ ...n, [clase]: e.target.value }))}
          maxLength={LIM.notaClase}
          placeholder={t('grupos.notaEjemplo')}
          style={{ marginTop: '0.25rem', resize: 'vertical' }}
        />
        <Contador valor={notas[clase] ?? ''} max={LIM.notaClase} />
      </div>
    );
  }

  /**
   * El botón que guarda una clase entera, con su aviso de pendiente al lado.
   *
   * Va dentro de la tarjeta de cada clase, debajo de lo que guarda. Es la
   * pieza del arreglo: mientras el único botón vivía al final de la pantalla
   * —detrás de todas las clases— lo que quedaba a mano de las horas era el de
   * la nota, y ése no las mandaba.
   */
  function botonGuardar(clase: string) {
    const pendiente = sinGuardar(clase);
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginTop: '0.9rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className={pendiente ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
          disabled={guardando !== null}
          onClick={() => guardarClaseEntera(clase)}
        >
          {guardando === clase
            ? t('comun.guardando')
            : clase === CLUB
              ? t('grupos.guardarHorario')
              : t('grupos.guardarClase')}
        </button>
        {pendiente && (
          <span className="badge badge-gold" role="status">
            {t('grupos.sinGuardar')}
          </span>
        )}
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('calendario.titulo')}
        </h1>
        <Link href="/" className="btn btn-outline btn-sm">
          {t('menu.panel')}
        </Link>
      </header>

      {/* Solo un fallo al CARGAR el calendario se queda escrito aquí; el
          resultado de una acción va por la nube flotante (ver lib/toast.ts). */}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {/* ── La semana que se está mirando ──
          Manda sobre las notas de abajo, y por eso está arriba del todo: es el
          contexto de todo lo que sigue, no un control más. */}
      {/* Tres columnas fijas —flecha, fecha, flecha— en vez de una fila que se
          parte. Con `flex-wrap`, «‹ Semana anterior» y «Semana siguiente ›»
          sumaban más que la tarjeta y el bloque se desarmaba en tres renglones
          con la fecha bailando de sitio según el largo del mes. En el teléfono
          las dos etiquetas se esconden y quedan las flechas, que es lo que se
          toca; el nombre entero sigue en el `aria-label`. */}
      <div className="card semana-nav" style={{ padding: '0.7rem 1rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={t('grupos.semanaAnterior')}
          title={t('grupos.semanaAnterior')}
          onClick={() => setSemana((s) => masSemanas(s, -1))}
        >
          ‹<span className="semana-nav-texto"> {t('grupos.semanaAnterior')}</span>
        </button>
        <div className="semana-nav-centro">
          <span className="muted" style={{ fontSize: '0.72rem' }}>
            {t('grupos.semanaDel')}{' '}
          </span>
          <strong className="mono">{fmtFecha(semana, idioma)}</strong>
          {/* «Semana actual» en su propio renglón: al lado de la fecha era el
              tercer elemento de una columna que ya iba justa, y era el que
              empujaba las flechas fuera. */}
          {semana !== lunesDe(hoyISO()) && (
            <div className="semana-nav-hoy">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSemana(lunesDe(hoyISO()))}
              >
                {t('grupos.semanaActual')}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={t('grupos.semanaSiguiente')}
          title={t('grupos.semanaSiguiente')}
          onClick={() => setSemana((s) => masSemanas(s, 1))}
        >
          <span className="semana-nav-texto">{t('grupos.semanaSiguiente')} </span>›
        </button>
      </div>

      {/* ── Las clases ── */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem' }}>
          {t('grupos.titulo')}
        </h2>
        <p className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.9rem' }}>
          {t('grupos.ayuda')}
        </p>

        {/* Sin clases, el club tiene UN horario. No es un estado a medias ni un
            hueco por rellenar: es como funciona la mayoría de los clubes, y por
            eso se enseña con su horario puesto y no con un vacío. */}
        {grupos.length === 0 ? (
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t('grupos.sinClases')}</h3>
            <p className="muted" style={{ fontSize: '0.72rem', marginBottom: '0.7rem' }}>
              {t('grupos.sinClasesAyuda')}
            </p>
            {bloqueHorario(CLUB)}
            {esMaestro && bloqueNota(CLUB)}
            {esMaestro && botonGuardar(CLUB)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {grupos.map((g) => (
              <div
                key={g.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '0.6rem',
                  padding: '0.85rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className="muted" style={{ fontSize: '0.72rem' }}>
                      {t('grupos.nombre')}
                    </label>
                    <input
                      value={g.name}
                      disabled={!esMaestro}
                      onChange={(e) =>
                        setGrupos((lista) =>
                          lista.map((x) =>
                            x.id === g.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      maxLength={LIM.claseNombre}
                      style={{ marginTop: '0.2rem' }}
                    />
                  </div>
                  {esMaestro &&
                    (borrando === g.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => borrarClase(g.id)}
                        >
                          {t('comun.eliminar')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setBorrando(null)}
                        >
                          {t('comun.cancelar')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        title={t('grupos.eliminarConfirma')}
                        onClick={() => setBorrando(g.id)}
                      >
                        {t('grupos.eliminar')}
                      </button>
                    ))}
                </div>

                {borrando === g.id && (
                  <p className="msg-error" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
                    {t('grupos.eliminarConfirma')}
                  </p>
                )}

                <label
                  className="muted"
                  style={{ fontSize: '0.72rem', display: 'block', marginTop: '0.6rem' }}
                >
                  {t('grupos.descripcion')}
                </label>
                <textarea
                  rows={2}
                  value={g.descripcion ?? ''}
                  disabled={!esMaestro}
                  onChange={(e) =>
                    setGrupos((lista) =>
                      lista.map((x) =>
                        x.id === g.id ? { ...x, descripcion: e.target.value } : x,
                      ),
                    )
                  }
                  maxLength={LIM.claseDescripcion}
                  placeholder={t('grupos.descripcionEjemplo')}
                  style={{ marginTop: '0.2rem', resize: 'vertical' }}
                />

                <p className="muted" style={{ fontSize: '0.72rem', margin: '0.6rem 0 0.4rem' }}>
                  {t('grupos.horarioAyuda')}
                </p>
                {bloqueHorario(g.id)}
                {esMaestro && bloqueNota(g.id)}
                {esMaestro && botonGuardar(g.id)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Crear una clase ── */}
      {esMaestro && (
        <form onSubmit={crearClase} className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
            {t('grupos.nueva')}
          </h2>
          <label className="muted" style={{ fontSize: '0.72rem' }}>
            {t('grupos.nombre')}
          </label>
          <input
            value={nuevaClase.name}
            onChange={(e) => setNuevaClase((c) => ({ ...c, name: e.target.value }))}
            maxLength={LIM.claseNombre}
            placeholder={t('grupos.nombreEjemplo')}
            style={{ marginTop: '0.2rem', marginBottom: '0.6rem' }}
          />
          <label className="muted" style={{ fontSize: '0.72rem' }}>
            {t('grupos.descripcion')}
          </label>
          <textarea
            rows={2}
            value={nuevaClase.descripcion}
            onChange={(e) => setNuevaClase((c) => ({ ...c, descripcion: e.target.value }))}
            maxLength={LIM.claseDescripcion}
            placeholder={t('grupos.descripcionEjemplo')}
            style={{ marginTop: '0.2rem', resize: 'vertical' }}
          />
          <Contador valor={nuevaClase.descripcion} max={LIM.claseDescripcion} />
          <button
            className="btn btn-outline"
            type="submit"
            disabled={creando || !nuevaClase.name.trim()}
          >
            {creando ? t('comun.guardando') : `+ ${t('grupos.nueva')}`}
          </button>
        </form>
      )}

      {/* ── Excepciones del calendario ── */}
      <div className="card" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          {t('calendario.excepciones')}
        </h2>
        {/* La fila de arriba (fecha y tipo) se reparte el ancho; el motivo va
            debajo y a lo ancho de la tarjeta. Antes compartía renglón con los
            otros dos y le quedaban 120 px: el maestro escribía a ciegas en una
            rendija de la que solo veía las últimas cinco palabras. */}
        {esMaestro && (
          <form onSubmit={agregarExc} className="excepcion-form">
            <div className="excepcion-fila">
              <div>
                <label className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('comun.fecha')}
                </label>
                {/* Calendario propio, acotado: la columna es `date` y no acepta
                    años de cinco cifras (que el `type="date"` nativo sí dejaba
                    teclear). Ver `components/CampoFecha.tsx`. */}
                {/* ── Por qué el rango es este y no el siglo entero ──
                    Era `2000-01-01` a `2100-12-31`: cien años para decir qué
                    día cierra el club. Un festivo que se marca en 2003 o en
                    2087 no es una decisión, es un dedazo — y encima uno que no
                    se ve, porque la lista de excepciones va ordenada y esa
                    fecha se va al principio o al final, donde nadie mira.
                    Un mes atrás cubre el «se me olvidó apuntar el puente
                    pasado»; dos años adelante, cualquier calendario que un club
                    planifique de verdad. */}
                <CampoFecha
                  valor={nueva.date}
                  onChange={(v) => setNueva((n) => ({ ...n, date: v }))}
                  min={haceUnMes()}
                  max={dentroDeAnos(2)}
                  ariaLabel={t('comun.fecha')}
                  borrable={false}
                />
              </div>
              <div>
                <label className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('planes.tipo')}
                </label>
                <SelectMenu
                  valor={nueva.isClosed ? 'closed' : 'open'}
                  onChange={(v) => setNueva((n) => ({ ...n, isClosed: v === 'closed' }))}
                  etiquetaAria={t('planes.tipo')}
                  opciones={[
                    { valor: 'closed', etiqueta: t('calendario.cerrado') },
                    { valor: 'open', etiqueta: t('calendario.abierto') },
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="muted" style={{ fontSize: '0.72rem' }}>
                {t('calendario.nota')}
              </label>
              <textarea
                rows={3}
                value={nueva.note}
                onChange={(e) => setNueva((n) => ({ ...n, note: e.target.value }))}
                maxLength={LIM.notaCalendario}
                placeholder={t('calendario.notaEjemplo')}
                style={{ marginTop: '0.25rem', resize: 'vertical', minHeight: '4.5rem' }}
              />
              <Contador valor={nueva.note} max={LIM.notaCalendario} />
            </div>

            <button className="btn btn-outline" type="submit" style={{ alignSelf: 'start' }}>
              {t('calendario.agregarExcepcion')}
            </button>
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {exc.length === 0 && (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('calendario.sinExcepciones')}
            </span>
          )}
          {exc.map((x) => (
            <div
              key={x.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                // Una nota larga empujaba «Eliminar» fuera de la tarjeta.
                flexWrap: 'wrap',
              }}
            >
              <span style={{ minWidth: 0, flex: '1 1 12rem' }}>
                <strong className="mono">{fmtFecha(x.date, idioma)}</strong>{' '}
                <span className={x.isClosed ? 'badge badge-danger' : 'badge badge-ok'}>
                  {x.isClosed ? t('calendario.cerrado') : t('calendario.abierto')}
                </span>
                {x.note ? <span className="muted"> · {x.note}</span> : null}
              </span>
              {esMaestro && (
                <button className="btn btn-outline btn-sm" onClick={() => borrarExc(x.id)}>
                  {t('comun.eliminar')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
