'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ACADEMY_EN_EL_PORTAL } from '@/lib/apps';
import { CORREO_ADMIN } from '@/lib/contacto';

const CAMPEONATOS_API =
  process.env.NEXT_PUBLIC_CAMPEONATOS_API_URL || 'http://localhost:3002';
const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL = process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

interface CampeonatoVivo {
  id: string;
  nombre: string;
  estado: string;
  fechaInicio: string | null;
}

/**
 * ════════════════════════════════════════════════════════════════════════
 * Portada de DINAMYT
 * ════════════════════════════════════════════════════════════════════════
 *
 * ── Regla 1: aquí solo se escribe lo que el software hace HOY ─────────────
 *
 * Una portada que promete de más se paga en la primera semana de uso, cuando
 * el maestro busca el lector de huella que vio anunciado y no existe.
 *
 * Lo que se retiró el 31 de agosto de 2026, porque era falso:
 *
 *   · **«Check-in con huella»** — el lector se retiró del producto. El valor
 *     `fingerprint` sigue en el enum de la base solo para no reescribir
 *     asistencias viejas; nada lo emite. Hoy son carnet QR, PIN y lista manual.
 *   · **«Recordatorios por push y correo»** — Membresías **no envía un solo
 *     correo** (`productos/membresias/CORREO.md`). El aviso diario sale por
 *     push y por la campana. El correo lo manda el portal, y es otra cosa:
 *     verificación de cuenta y recuperación de contraseña.
 *   · **«Categorización automática por cinturón, edad y peso»** — las
 *     categorías son canónicas y las llaves se arman **desde el listado** que
 *     sube el organizador. No hay motor que reparta a nadie por su peso.
 *   · **«Los competidores aceptan invitaciones y eligen modalidades»** — quien
 *     inscribe y elige modalidad es el **maestro**. El competidor no tiene esa
 *     pantalla.
 *   · **Academy** vendía tres cosas en futuro como si fueran producto. Ahora
 *     está donde le toca: una pestaña marcada **«Próximamente»**, sin botón y
 *     sin fecha inventada. La app existe y responde, pero no se ofrece
 *     (`ACADEMY_EN_EL_PORTAL`, §4.14 de OPERAR); al encender ese interruptor,
 *     la insignia y la puerta aparecen solas.
 *
 * ── Regla 2: la verdad se cuenta con números, no con párrafos ─────────────
 *
 * La primera versión de esta reescritura era honesta y **era un muro de
 * texto**: tres columnas de seis viñetas largas. Nadie lee eso en un celular.
 *
 * El arreglo no fue recortar frases, fue cambiar de instrumento:
 *
 *   · **La franja de cifras** (10 tatamis, 4+1 jueces, 5 planes, 3 formas de
 *     marcar, 7 días de cola) es la firma de la página. Un número es lo único
 *     que no se puede inflar sin que se note, así que dice «esto es de verdad»
 *     en un tercio del espacio que gastaba el párrafo que decía lo mismo.
 *   · **Las pestañas** enseñan UNA app a la vez. El contenido está entero,
 *     pero la pantalla nunca tiene más de cinco líneas cortas encima.
 *   · Ninguna línea de las listas pasa de una fila en un celular de 320 px.
 *     Si una frase no cabe, la frase está mal, no la pantalla.
 */
export default function HomePage() {
  const [enVivo, setEnVivo] = useState<CampeonatoVivo[]>([]);

  useEffect(() => {
    fetch(`${CAMPEONATOS_API}/campeonatos/publico`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CampeonatoVivo[]) =>
        setEnVivo(data.filter((c) => c.estado === 'EN_CURSO')),
      )
      .catch(() => setEnVivo([]));
  }, []);

  return (
    <main className="min-h-screen">
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ background: 'rgba(14,14,21,0.85)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2.5">
            <img src="/logo.png" alt="DINAMYT" width={32} height={32} />
            <span className="display text-lg" style={{ color: 'var(--gold)' }}>
              DINAMYT
            </span>
          </span>
          <nav className="flex items-center gap-2">
            <a
              href={`${CAMPEONATOS_URL}/resultados`}
              className="btn btn-outline hidden sm:inline-flex"
            >
              Resultados
            </a>
            <Link href="/planes" className="btn btn-outline hidden sm:inline-flex">
              Planes
            </Link>
            <Link href="/login" className="btn btn-gold">
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1fr] lg:gap-12">
        <div>
          <p className="eyebrow mb-4">Hapkido · Colombia</p>
          {/* El titular nombra al rival de verdad, que no es otro software: es
              el cuaderno donde hoy está apuntado quién pagó y quién vino. Las
              versiones anteriores («Del club al podio» y «Tu club. Tu torneo.
              Una cuenta.») describían el producto en abstracto y podían
              encabezar cualquier plataforma deportiva del mundo.

              Los tres tamaños salen de medir «EL CUADERNO», que es la línea
              más larga, contra el ancho que hay en cada sitio. Archivo lleva
              `font-stretch: 118%` y es bastante más ancha de lo que su cuerpo
              sugiere, así que el titular se parte en cuatro renglones con una
              facilidad que no se ve venir:

                · **320 px** → quedan 288 libres. A 2.25rem la línea mide 290 y
                  se rompe; a `2rem` mide 258 y entra.
                · **lg** → la rejilla parte el hero en dos y la columna baja a
                  ~464 px. `text-5xl` cabe; `text-6xl` no.
                · **xl** → la columna llega a ~528 px y ahí sí entra `text-6xl`,
                  que es donde el titular tiene el tamaño que merece. */}
          <h1 className="display text-[2rem] sm:text-5xl xl:text-6xl">
            Se acabó
            <br />
            <span style={{ color: 'var(--gold)' }}>el cuaderno</span>
            <br />
            del club.
          </h1>
          <p
            className="mt-5 max-w-md text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--text-muted)' }}
          >
            Mensualidades, asistencia y campeonatos en un solo sitio. Tus
            alumnos entran con la misma cuenta que tú.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/registro" className="btn btn-gold px-6 py-3 text-base">
              Crear mi cuenta
            </Link>
            <a
              href={`${CAMPEONATOS_URL}/resultados`}
              className="btn btn-outline px-6 py-3 text-base"
            >
              Ver resultados
            </a>
          </div>
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            La cuenta es gratis. Las apps van con la suscripción del club —{' '}
            <Link href="/planes" style={{ color: 'var(--gold)' }}>
              cómo se cobra
            </Link>
            .
          </p>
        </div>

        <MarcadorDemo />
      </section>

      {/* ── Firma: la progresión de cinturones ─────────────────────────── */}
      <div className="cinturon" aria-hidden="true" />

      {/* ── Sucediendo ahora ───────────────────────────────────────────── */}
      {enVivo.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="display text-2xl">Sucediendo ahora</h2>
            <span className="badge badge-live">
              <span className="punto-vivo" /> En vivo
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enVivo.map((c) => (
              <a
                key={c.id}
                href={`${CAMPEONATOS_URL}/pantalla/${c.id}`}
                className="card p-5"
              >
                <h3 className="text-lg font-semibold">{c.nombre}</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Tatamis y resultados en tiempo real →
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      <Cifras />

      <Aplicaciones />

      <Roles />

      {/* ── Cierre ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
        <h2 className="display mx-auto max-w-lg text-3xl sm:text-4xl">
          Empieza por tu club
        </h2>
        <p
          className="mx-auto mt-3 max-w-md text-sm leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          Creas tu cuenta, fundas tu club y le pasas el código a tus alumnos.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/registro" className="btn btn-gold px-6 py-3 text-base">
            Crear mi cuenta
          </Link>
          <Link href="/planes" className="btn btn-outline px-6 py-3 text-base">
            Cómo se cobra
          </Link>
        </div>
      </section>

      {/* El pie ya no vive aquí: es el mismo del layout, en todas las
          pantallas (`components/PieDePagina.tsx`). */}
    </main>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   La franja de cifras — la firma de la página
   ════════════════════════════════════════════════════════════════════════
   Cada número está sacado del código, no del entusiasmo:
     · 10  → MAX_TATAMIS (backend/app/api/campeonatos.py)
     · 4+1 → ROLES_TATAMI = arbitro + j1..j4 (backend/app/api/tatamis.py)
     · 5   → PlanType: mensual | semanal | clase | paquete | matricula
     · 3   → los métodos de check-in vivos: qr, pin, manual
     · 7   → MAX_DIAS_COLA del kiosco (routes/checkin.ts)
   Si alguno cambia en el código, cambia aquí el mismo día. */
const CIFRAS: { valor: string; etiqueta: string }[] = [
  { valor: '10', etiqueta: 'tatamis a la vez' },
  { valor: '4+1', etiqueta: 'jueces por tatami' },
  { valor: '5', etiqueta: 'tipos de plan' },
  { valor: '3', etiqueta: 'formas de marcar' },
  { valor: '7', etiqueta: 'días sin señal' },
];

function Cifras() {
  return (
    <section
      className="border-y"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-7 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
        {CIFRAS.map(({ valor, etiqueta }) => (
          <div key={etiqueta}>
            <dt className="sr-only">{etiqueta}</dt>
            <dd className="m-0">
              <span
                className="mono block text-3xl font-semibold leading-none sm:text-4xl"
                style={{ color: 'var(--gold)' }}
              >
                {valor}
              </span>
              <span
                className="mt-2 block text-xs leading-snug"
                style={{ color: 'var(--text-muted)' }}
              >
                {etiqueta}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Las aplicaciones, de una en una
   ════════════════════════════════════════════════════════════════════════
   Pestañas y no tres columnas: el contenido está entero, pero la pantalla
   nunca tiene encima más de cinco líneas. Cada línea cabe en una fila de un
   celular de 320 px — esa es la medida, no un gusto. */
interface AppInfo {
  id: string;
  nombre: string;
  titulo: string;
  lineas: string[];
  /** Sin `cta` la pestaña no ofrece puerta: es lo que hace «Próximamente». */
  cta?: { texto: string; href: string };
  proximamente?: boolean;
}

/**
 * Cada línea dice **qué consigue** el maestro, no con qué mecanismo.
 *
 * «Avisa el vencimiento por push y por la campana» le pedía a quien lee que
 * supiera qué es un push y dónde está la campana antes de entender que ya no
 * tiene que perseguir a nadie. El canal es una decisión de ingeniería y cambia
 * —hoy es push, mañana podría ser otro—; lo que no cambia es que al alumno le
 * llega el aviso. Eso es lo que se promete aquí, y por eso ninguna línea
 * nombra ya un carnet, un formato de archivo ni un botón.
 *
 * (La pestaña «Tu cuenta» se retiró el 31 de agosto de 2026: una sola
 * contraseña y una zona horaria no son un producto, son cómo está hecho el
 * que sí lo es.)
 *
 * ── Academy, y por qué vuelve como «Próximamente» ─────────────────────────
 *
 * La app existe, está desplegada y responde por su dirección; lo que no está
 * es a la venta (§4.14 de OPERAR). Enseñarla con su fecha en blanco es honesto
 * y además es información que el maestro quiere: sabe hacia dónde va lo que
 * está contratando. Lo que NO puede hacer una pestaña «Próximamente» es tener
 * botón, porque un botón es una promesa de que hay algo al otro lado.
 *
 * El interruptor es el mismo de siempre —`ACADEMY_EN_EL_PORTAL`, en
 * `lib/apps.ts`—: al ponerlo en `true`, la insignia pasa a «En producción» y
 * aparece la puerta, sin tocar esta portada.
 */
const APPS: AppInfo[] = [
  {
    id: 'membresias',
    nombre: 'Membresías',
    titulo: 'El club, al día',
    lineas: [
      'Sabes quién está al día y quién debe',
      'Cobras, y el vencimiento se actualiza solo',
      'Pasas lista en la puerta, sin papel',
      'Tus alumnos se enteran antes de que se les venza',
      'Ves el recaudo y la asistencia del mes',
    ],
    cta: { texto: 'Entrar a Membresías', href: MEMBRESIAS_URL },
  },
  {
    id: 'campeonatos',
    nombre: 'Campeonatos',
    titulo: 'El torneo, de punta a punta',
    lineas: [
      'Montas el campeonato y armas las llaves',
      'Los maestros inscriben a su gente y tú apruebas',
      'Cada juez puntúa desde su tatami',
      'El público sigue el marcador en vivo',
      'Al terminar, los resultados quedan publicados',
    ],
    cta: { texto: 'Ver campeonatos', href: `${CAMPEONATOS_URL}/campeonatos` },
  },
  {
    id: 'academy',
    nombre: 'Academy',
    titulo: 'La formación del practicante',
    lineas: [
      'Cada alumno ve qué le falta para el próximo cinturón',
      'Sus evaluaciones de grado quedan en su historial',
      'El maestro sigue el avance de todo su grupo',
    ],
    proximamente: !ACADEMY_EN_EL_PORTAL,
    cta: ACADEMY_EN_EL_PORTAL
      ? { texto: 'Entrar a Academy', href: ACADEMY_URL }
      : undefined,
  },
];

function Aplicaciones() {
  const [activa, setActiva] = useState(APPS[0].id);
  const app = APPS.find((a) => a.id === activa) ?? APPS[0];

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="eyebrow mb-2">El ecosistema</p>
      <h2 className="display mb-6 text-3xl sm:text-4xl">Una cuenta, tus apps</h2>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Aplicaciones">
        {APPS.map((a) => {
          const seleccionada = a.id === activa;
          return (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={seleccionada}
              aria-controls={`panel-${a.id}`}
              id={`tab-${a.id}`}
              onClick={() => setActiva(a.id)}
              className="btn"
              style={
                seleccionada
                  ? { background: 'var(--gold-soft)', borderColor: 'var(--gold)', color: 'var(--gold)' }
                  : { borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }
              }
            >
              {a.nombre}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${app.id}`}
        aria-labelledby={`tab-${app.id}`}
        className="card mt-4 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-bold sm:text-2xl">{app.titulo}</h3>
          {app.proximamente ? (
            <span className="badge">Próximamente</span>
          ) : (
            <span className="badge badge-ok">En producción</span>
          )}
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {app.lineas.map((linea) => (
            <li
              key={linea}
              className="flex items-start gap-2.5 text-sm leading-snug"
              style={{ color: 'var(--text-muted)' }}
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'var(--gold)' }}
              />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
        {app.cta ? (
          <a href={app.cta.href} className="btn btn-outline mt-6">
            {app.cta.texto}
          </a>
        ) : (
          <p className="mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            Todavía no se ofrece.{' '}
            <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
              Escríbenos
            </a>{' '}
            si la quieres para tu club y te avisamos.
          </p>
        )}
      </div>

      {/* La contingencia no es una viñeta más: es la razón por la que este
          sistema se usa en polideportivos con wifi de coliseo. Va aparte y en
          dos líneas. */}
      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <span className="badge badge-gold">Sin red</span>
        <span>
          Si se cae el internet del coliseo, el campeonato sigue. Si se cae el
          del salón, la clase también.
        </span>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Los roles — solo que existen
   ════════════════════════════════════════════════════════════════════════
   Empezaron siendo seis tarjetas con su párrafo, luego seis líneas, y ahora
   son seis palabras. Quien mira la portada no está eligiendo permisos: solo
   quiere saber si el sistema contempla a su gente —el acudiente que paga, el
   auxiliar que pasa lista—, y para eso basta con ver su palabra escrita. El
   detalle de qué puede hacer cada uno vive donde se usa, no aquí. */
const ROLES = [
  'Federación',
  'Maestro',
  'Auxiliar',
  'Acudiente',
  'Alumno',
  'Juez',
];

function Roles() {
  return (
    <section
      className="border-y py-8"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 sm:px-6">
        <p className="eyebrow" style={{ marginBottom: 0 }}>
          Cada quien ve lo suyo
        </p>
        <ul className="flex flex-wrap gap-2">
          {ROLES.map((rol) => (
            <li key={rol} className="badge">
              {rol}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Las dos pantallas del producto, en miniatura y en marcha.
 *
 * Es lo primero que se ve porque es lo más característico del sistema, y su
 * vocabulario es el real: KyongGo y GamJeum son las dos faltas del motor de
 * combate, y 4 + central es el máximo de jueces por tatami.
 *
 * ── Son DOS cosas, y tienen que verse como dos ────────────────────────────
 *
 * Pegadas una encima de otra a 12 px se leían como un solo panel con un pie
 * raro: el marcador del campeonato parecía llevar dentro un aviso de
 * asistencia, que es exactamente la confusión que la portada no se puede
 * permitir —son dos aplicaciones distintas—.
 *
 * Lo que las separa ahora son tres cosas a la vez, porque una sola no bastaba:
 * el rótulo con el nombre de su app encima de cada una, el aire entre ambas, y
 * el desplazamiento lateral de la segunda a partir de `sm`, que rompe la
 * columna y deja claro que flota aparte.
 *
 * Respeta prefers-reduced-motion (el cronómetro queda congelado en 01:23).
 */
function MarcadorDemo() {
  const [segundos, setSegundos] = useState(83); // 01:23 de la R2
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido) return;
    intervalo.current = setInterval(() => {
      setSegundos((s) => (s <= 0 ? 120 : s - 1)); // reinicia la ronda al llegar a 0
    }, 1000);
    return () => {
      if (intervalo.current) clearInterval(intervalo.current);
    };
  }, []);

  const mm = String(Math.floor(segundos / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');

  return (
    <div>
      <figure className="m-0">
        <figcaption
          className="eyebrow mb-2 flex items-center gap-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--hong)' }}
          />
          Campeonatos · el marcador
        </figcaption>
        <div className="marcador">
        <div className="marcador-head">
          <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
            Tatami 1 · Semifinal
          </span>
          <span
            className="mono text-lg font-semibold"
            style={{ color: 'var(--gold)' }}
          >
            {mm}:{ss}
          </span>
        </div>

        <div className="marcador-fila">
          <span
            aria-hidden="true"
            style={{ background: 'var(--chung)', height: '100%', borderRadius: 2 }}
          />
          <div className="min-w-0">
            <p className="font-semibold">S. Rodríguez</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Chung · Liga del Valle
            </p>
          </div>
          <span className="marcador-puntos" style={{ color: 'var(--chung)' }}>
            7
          </span>
        </div>

        <div className="marcador-fila">
          <span
            aria-hidden="true"
            style={{ background: 'var(--hong)', height: '100%', borderRadius: 2 }}
          />
          <div className="min-w-0">
            <p className="font-semibold">J. Valencia</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Hong · Liga de Antioquia
            </p>
          </div>
          <span className="marcador-puntos" style={{ color: 'var(--hong)' }}>
            5
          </span>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-2.5"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
        >
          <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
            KyongGo 1 · GamJeum 0
          </span>
          <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
            4 jueces + central
          </span>
          </div>
        </div>
      </figure>

      {/* Membresías también vive aquí: el kiosco confirma un check-in. Con
          carnet QR, que es lo que existe — esta tarjeta era el último sitio
          donde seguía viva la huella que se retiró del producto. */}
      <figure className="m-0 mt-7 sm:ml-8 lg:ml-14">
        <figcaption
          className="eyebrow mb-2 flex items-center gap-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)' }}
          />
          Membresías · el kiosco
        </figcaption>
        <div
          className="card flex items-center justify-between gap-3 px-4 py-3"
          role="presentation"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: 'rgba(62,207,142,0.15)', color: 'var(--ok)' }}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Ana Gómez marcó asistencia</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Entró con su carnet
              </p>
            </div>
          </div>
          <span className="badge badge-ok shrink-0">Al día</span>
        </div>
      </figure>
    </div>
  );
}
