'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  cerrarSesion,
  refrescarSesionAPI,
  misOrganizacionesAPI,
  miClubAPI,
  misInvitacionesAPI,
  responderInvitacionAPI,
  extraerError,
  type TokenPayload,
  type MiInvitacion,
} from '@/lib/api';
import { nombreRol, operaCampeonatos } from '@/lib/roles';
import { ACADEMY_EN_EL_PORTAL } from '@/lib/apps';
import { Avatar } from '@/components/Avatar';
import { CampanaOrg } from '@/components/CampanaOrg';
import { PedirAvisos } from '@/components/PedirAvisos';
import { EntrarAClub } from '@/components/EntrarAClub';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL =
  process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Antes era el carácter ⏻ (U+23FB). No es un emoji: es un símbolo técnico que
 * casi ninguna fuente de Android trae, así que en el Chrome del celular el
 * botón salía con el cuadrito de «glifo que no tengo» delante del texto — y el
 * botón rojo de cerrar sesión es el peor sitio de la pantalla para que a
 * alguien le quede la duda de qué hace. Un SVG se ve igual en todos lados y
 * hereda el color del botón.
 *
 * Es el mismo trazo que usa la barra de Membresías (`IconoSalir` en su
 * `NavBar`), a propósito: la misma acción se dibuja igual en las dos apps.
 */
function IconoSalir() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2.8v9.4" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

/**
 * Lo que se le cuenta a quien Campeonatos devolvió para acá.
 *
 * Su consola es para administrar, inscribir y puntuar; quien no hace nada de
 * eso no tiene por qué acabar mirando su formulario de acceso. Cuando el canje
 * del pase la rechaza, la app lo manda de vuelta con el motivo y **el mensaje
 * se da aquí**, que es donde la persona ya está y donde estará lo suyo.
 */
const AVISO_CAMPEONATOS: Record<string, string> = {
  sin_consola:
    'Campeonatos es la consola de quien organiza, inscribe o juzga. Lo tuyo —tus inscripciones y tus resultados— lo verás aquí, en DINAMYT.',
  sin_plan:
    'Tu club no tiene Campeonatos en su plan. Habla con tu maestro si crees que debería tenerlo.',
  desactivado:
    'Tu usuario está desactivado en Campeonatos. Pídele a tu maestro que lo active.',
  correo_ocupado:
    'Tu correo está enlazado con otra cuenta en Campeonatos. Escríbenos a soporte@dinamyt.org para que lo revisemos.',
};

export default function DashboardPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  // ¿Gestiona alguna organización (admin/maestro)? ¿Pertenece a algún club?
  const [gestiona, setGestiona] = useState<boolean | null>(null);
  const [nombreClub, setNombreClub] = useState<string | null>(null);
  /**
   * Si el maestro me cortó el acceso a Membresías en mi club.
   *
   * Cerraba un hueco que dejaba a la persona sin explicación: `app_scopes` sale
   * de la SUSCRIPCIÓN del club, no de si yo puedo entrar, así que el portal me
   * seguía enseñando «Entrar a Membresías» con el acceso retirado y allí me
   * recibía un 403 pelado. Desde mi lado, la aplicación se rompió. Ahora se
   * dice lo que pasa y a quién preguntarle.
   *
   * Sale de `GET /organizations/mi-club` y no del token porque esto lo cambia
   * OTRA persona mientras mi sesión sigue abierta — el mismo motivo por el que
   * este dashboard empieza pidiendo un token fresco.
   */
  const [membresiasCortada, setMembresiasCortada] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [invitaciones, setInvitaciones] = useState<MiInvitacion[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null,
  );

  const cargar = useCallback(async (p: TokenPayload) => {
    // Ambas consultas fallan sin romper la página: lo que decide qué tarjeta
    // se enseña es «Mi organización» (la gestiona) o «Mi club» (solo
    // pertenece).
    const [orgs, club, perfil, invs] = await Promise.allSettled([
      misOrganizacionesAPI(),
      miClubAPI(),
      api.get(`/users/${p.sub}/profile`),
      misInvitacionesAPI(),
    ]);
    setGestiona(orgs.status === 'fulfilled' && orgs.value.length > 0);
    setNombreClub(
      club.status === 'fulfilled' && club.value.length > 0
        ? club.value[0].name
        : null,
    );
    // `=== false` y no `!`: `null` significa «no consta» —nadie ha preguntado
    // nunca por esta persona—, y eso no puede esconder la app de quien sí
    // entra. Ver la migración `0013_acceso_por_app`.
    setMembresiasCortada(
      club.status === 'fulfilled' &&
        club.value.some((c) => c.membresiasActivo === false),
    );
    if (perfil.status === 'fulfilled') {
      setFoto((perfil.value.data as { avatarUrl: string | null }).avatarUrl);
    }
    setInvitaciones(invs.status === 'fulfilled' ? invs.value : []);
  }, []);

  useEffect(() => {
    const t = obtenerToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    const p = decodificarToken(t);
    if (!p) {
      cerrarSesion();
      router.replace('/login');
      return;
    }
    setPayload(p);

    /**
     * **Lo primero al abrir el dashboard es volver a pedir el token.**
     *
     * Dentro del token van el club, los roles por app y `app_scopes`, y todo
     * eso lo cambia OTRA persona: el maestro que acepta tu solicitud, el admin
     * que activa la suscripción del club. Quien tenía la sesión abierta seguía
     * con el token de cuando entró, así que el alumno recién aceptado abría
     * esta pantalla y no veía ni su club ni sus aplicaciones — y Membresías
     * tampoco le creaba la ficha, porque eso también sale del `org_id` del
     * token. Desde fuera se veía como «la aplicación no me deja».
     *
     * Se pinta con el token viejo mientras tanto (`setPayload(p)` de arriba)
     * para que la pantalla no parpadee en blanco, y se repinta con el nuevo.
     */
    /**
     * ── Y lo segundo es pedir los datos, SIN esperar al pase nuevo ──
     *
     * Esto estaba encadenado: primero el refresco, y solo cuando volvía se
     * pedían el perfil, el club y las invitaciones. Dos viajes seguidos para
     * cosas que no dependen una de otra, y se notaba exactamente donde el
     * usuario lo contó: el nombre, el saludo y los botones salían al instante
     * —vienen del pase que ya estaba guardado— mientras la FOTO y la CAMPANA
     * llegaban tarde, porque las dos salen de `cargar`. Parecía que la mitad
     * del dashboard cargaba a otra velocidad, y era verdad.
     *
     * Encadenarlas no hacía falta: `cargar` solo usa `p.sub` —que es el mismo
     * en el pase viejo y en el nuevo— y las tres consultas las responde el
     * servidor mirando la base, no el pase. Un pase de hace diez minutos
     * devuelve exactamente los mismos datos.
     *
     * Lo que sí depende del pase nuevo son los botones de aplicaciones
     * (`app_scopes`) y el club, así que el refresco sigue, en paralelo; y si
     * vuelve con OTRA organización —alguien aceptó una solicitud mientras
     * tanto— se vuelve a preguntar, que es el caso que este refresco vino a
     * arreglar.
     */
    void cargar(p);
    void refrescarSesionAPI().then((fresco) => {
      if (!fresco) return;
      setPayload(fresco);
      if (fresco.org_id !== p.org_id) void cargar(fresco);
    });
  }, [router, cargar]);

  /**
   * El motivo por el que Campeonatos devolvió a esta persona, si la devolvió.
   *
   * Se copia al estado y se borra de la dirección, igual que el `?motivo=` del
   * login: un aviso que sigue ahí al recargar deja de ser un aviso y pasa a ser
   * parte de la pantalla.
   */
  const [avisoCampeonatos, setAvisoCampeonatos] = useState<string | null>(null);
  useEffect(() => {
    // Se lee de `window` y no con `useSearchParams`: ese hook obliga a
    // envolver la página en un `<Suspense>` —si no, la compilación se planta
    // con «should be wrapped in a suspense boundary»— y aquí no hace falta
    // ninguna espera, porque esto solo se mira al llegar, ya en el navegador.
    const motivo = new URLSearchParams(window.location.search).get('campeonatos');
    if (!motivo) return;
    setAvisoCampeonatos(AVISO_CAMPEONATOS[motivo] ?? null);
    const url = new URL(window.location.href);
    url.searchParams.delete('campeonatos');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // Solo al llegar: es un mensaje de una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function responderInvitacion(inv: MiInvitacion, aceptar: boolean) {
    setOcupado(true);
    setMsg(null);
    try {
      await responderInvitacionAPI(inv.id, aceptar);
      // Aceptar CREA la pertenencia, así que el token de este navegador acaba
      // de quedarse viejo otra vez. Sin este refresco, la persona acepta y
      // sigue sin ver ni su club ni sus apps hasta la próxima recarga.
      const fresco = await refrescarSesionAPI();
      const vigente = fresco ?? payload;
      if (fresco) setPayload(fresco);
      if (vigente) await cargar(vigente);
      setMsg({
        tipo: 'ok',
        texto: aceptar
          ? `Ya eres parte de ${inv.orgName}.`
          : `Rechazaste la invitación de ${inv.orgName}.`,
      });
    } catch (e) {
      setMsg({
        tipo: 'error',
        texto: extraerError(e, 'No se pudo responder la invitación.'),
      });
    } finally {
      setOcupado(false);
    }
  }

  function salir() {
    cerrarSesion();
    router.replace('/login');
  }

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
      {/* «¿Te avisamos?», una sola vez y solo a quien lleva un club: los avisos
          de aquí no le llegan a un alumno, así que pedirle permiso sería gastar
          la única pregunta que el navegador deja hacer. Se pinta aquí porque
          ésta es la pantalla a la que se llega al entrar. */}
      <PedirAvisos activo={gestiona === true} />
      {/* ── Por qué esto es tan cuidadoso con el ancho ───────────────────
          Porque no lo era, y en el celular se notaba como «esta pantalla no
          es responsiva»: el saludo va en la tipografía display —mayúsculas y
          ancho 118%—, así que un apellido largo medía más que la pantalla y
          empujaba la página entera unos píxeles hacia la derecha. Con la
          página más ancha que el visor, Chrome de Android la deja moverse de
          lado y a veces la encoge para que quepa; de ahí el «toca recargar o
          hacer zoom para que se acomode». No era el diseño: era un desborde
          horizontal de nada que obligaba al navegador a decidir.

          Tres cosas lo cierran, y las tres hacen falta:
            · `text-2xl` en el teléfono y `text-3xl` a partir de tableta,
            · `overflowWrap: anywhere`, para que ninguna palabra suelta
              —un apellido, un correo— pueda ser más ancha que su columna,
            · `flex-wrap` en los botones, que en `nowrap` se salían del borde
              en cuanto aparecía la campana del club.
          Y el `w-full` del <main>, que le fija el ancho al de la pantalla
          en vez de dejar que crezca con lo que lleve dentro. */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* `flex: 1 1 14rem` y no `flex-1`: con base 0 —lo que hace `flex-1`—
            y `overflowWrap: anywhere` debajo, la columna del nombre se dejaba
            estrujar hasta una letra por línea antes de que la fila se
            partiera. Con 14rem de base, lo que cede primero es la fila: los
            botones bajan y el saludo se queda entero. */}
        <div className="flex min-w-0 items-center gap-4" style={{ flex: '1 1 14rem' }}>
          {/* La tuya, ampliable: es la que se acaba de subir en «Mi perfil» y
              la única forma de comprobar cómo quedó el encuadre sin abrir otra
              aplicación. */}
          <Avatar src={foto} nombre={payload.fullName} size={56} ampliable />
          <div className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
            <p className="eyebrow mb-1">Tu cuenta DINAMYT</p>
            <h1 className="display text-2xl sm:text-3xl">Hola, {payload.fullName}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {payload.email}
              {payload.is_super_admin ? ' · Super administrador' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* La campana solo para quien lleva un club: a un alumno no le llega
              ninguno de estos avisos, así que se dibujaría siempre vacía — y
              una campana que nunca suena es un adorno que promete algo que no
              va a pasar. `=== true` porque `null` es «aún no se sabe». */}
          {gestiona === true && <CampanaOrg />}
          <Link href="/perfil" className="btn btn-outline">
            Mi perfil
          </Link>
          {/* Salir se distingue: es la única acción destructiva */}
          <button onClick={salir} className="btn btn-danger">
            <IconoSalir /> Salir
          </button>
        </div>
      </header>

      {msg && (
        <p
          className="mb-4 text-sm"
          style={{ color: msg.tipo === 'ok' ? 'var(--ok)' : 'var(--danger)' }}
        >
          {msg.texto}
        </p>
      )}

      {avisoCampeonatos && (
        <div
          className="card mb-5 p-4 text-sm"
          role="status"
          style={{ borderColor: 'var(--gold)', color: 'var(--text-muted)' }}
        >
          {avisoCampeonatos}
        </div>
      )}

      {/* ── Te invitaron ───────────────────────────────────────────────
          Lo primero de la pantalla, por delante incluso de las aplicaciones:
          es lo único aquí que espera una respuesta tuya, y de ella depende
          todo lo demás. Antes no existía —el maestro te metía en su club sin
          preguntarte— y ese era justamente el problema. */}
      {invitaciones.length > 0 && (
        <section className="card mb-5 p-5" style={{ borderColor: 'var(--gold)' }}>
          <h2 className="mb-1 text-lg font-semibold">
            ✉ Te invitaron a un club
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Decides tú. Si aceptas, tu ficha se crea sola en Membresías y verás
            los horarios y la sede de tu club.
          </p>
          <ul className="flex flex-col gap-2">
            {invitaciones.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar src={inv.orgLogoUrl} nombre={inv.orgName} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={inv.orgName}>
                      {inv.orgName}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      Te invita como {nombreRol(inv.role)}
                      {inv.orgCity ? ` · ${inv.orgCity}` : ''}
                    </p>
                    {inv.note && (
                      <p className="mt-0.5 truncate text-xs italic" title={inv.note}>
                        «{inv.note}»
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void responderInvitacion(inv, true)}
                    disabled={ocupado}
                    className="btn btn-gold btn-sm"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() => void responderInvitacion(inv, false)}
                    disabled={ocupado}
                    className="btn btn-outline btn-sm"
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Sin club ───────────────────────────────────────────────────
          Se dibuja solo para quien no pertenece a ninguno, y va ARRIBA de las
          aplicaciones a propósito: sin club, casi todas le van a decir que no.
          Antes esto no existía y quien se registraba por su cuenta se quedaba
          con una cuenta que no servía para nada, sin ninguna pista de qué
          hacer a continuación.

          `gestiona === false` (y no `!gestiona`) porque `null` significa «aún
          no se sabe»: enseñarlo mientras carga lo haría parpadear en la
          pantalla de todo el mundo. */}
      {gestiona === false && nombreClub === null && invitaciones.length === 0 && (
        <div className="mb-5">
          {/* Al entrar con el código nace una solicitud, y el token de este
              navegador no se entera hasta que el maestro responda. Se refresca
              igualmente por si el maestro ya había dicho que sí. */}
          <EntrarAClub
            onEntrado={() => {
              void refrescarSesionAPI().then((fresco) => {
                const vigente = fresco ?? payload;
                if (fresco) setPayload(fresco);
                if (vigente) void cargar(vigente);
              });
            }}
          />
        </div>
      )}

      <section
        className="rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-4 text-lg font-semibold">Tus aplicaciones</h2>

        <div className="flex flex-col gap-3">
          {/* ── Campeonatos: la tarjeta sale SIEMPRE que haya plan ────────
              Antes se pedían dos cosas —el plan y un rol que opere— y quien
              tenía el plan sin el rol no veía absolutamente nada: ni el botón,
              ni una explicación. Desde fuera, «tengo Campeonatos pagado y el
              portal no me lo enseña».

              Sigue siendo verdad que **tener el plan no es operar la consola**
              (§4.13): administrar, inscribir y puntuar es lo único que hay
              dentro, y un alumno no tiene ahí una sola pantalla. Lo que cambia
              es a dónde se le manda, no si se le enseña:

                · **Quien opera** → salta a su consola con el pase en el
                  fragmento (`#token=`, que nunca llega al servidor).
                · **Quien no** → a las páginas PÚBLICAS de Campeonatos, que no
                  piden sesión: los campeonatos abiertos y los resultados. Es
                  lo suyo, y es lo que estaba buscando.

              Mandarlo a `/login` sería mandarlo a un 403 con su formulario
              delante. Esconderlo era no contestarle. */}
          {(payload.is_super_admin || payload.app_scopes.includes('campeonatos')) &&
            (payload.is_super_admin || operaCampeonatos(payload.role_campeonatos) ? (
              <a
                href={`${CAMPEONATOS_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
                className="rounded-lg px-4 py-3 font-semibold"
                style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
              >
                Entrar a Campeonatos
                {payload.role_campeonatos ? ` (${nombreRol(payload.role_campeonatos)})` : ''}
              </a>
            ) : (
              <a
                href={`${CAMPEONATOS_URL}/campeonatos`}
                className="rounded-lg border px-4 py-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="block font-semibold">Ver campeonatos y resultados</span>
                <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>
                  Tu club tiene Campeonatos. La consola es para quien organiza,
                  inscribe o juzga; aquí ves los campeonatos abiertos y sus
                  resultados, sin escribir contraseña.
                </span>
              </a>
            ))}
          {(payload.is_super_admin ||
            payload.app_scopes.includes('membresias')) &&
            (membresiasCortada && !payload.is_super_admin ? (
              // ── Tiene el plan, pero su maestro le retiró el acceso ──
              //
              // No se esconde la tarjeta: esconderla sería no contestarle, y la
              // persona lleva meses entrando ahí. Se le dice qué pasó y qué
              // hacer, que es hablar con su maestro — el único que puede
              // devolvérselo, desde Membresías. Nada suyo se ha perdido: la
              // ficha, los pagos y la asistencia siguen enteros.
              <div
                className="rounded-lg border px-4 py-3"
                style={{ borderColor: 'var(--danger)' }}
              >
                <span className="block font-semibold">
                  Tu acceso a Membresías está desactivado
                </span>
                <span
                  className="mt-0.5 block text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Tu maestro lo retiró desde Membresías. Sigues siendo parte del
                  club y no se ha perdido nada tuyo —tu ficha, tus pagos y tus
                  asistencias están ahí—: pídele que te lo devuelva.
                </span>
              </div>
            ) : (
              // Mismo SSO por fragmento que Campeonatos: membresias-web guarda
              // el token al aterrizar en /login#token=… sin segundo formulario.
              <a
                href={`${MEMBRESIAS_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
                className="rounded-lg px-4 py-3 font-semibold"
                style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
              >
                Entrar a Membresías
                {payload.role_membresias ? ` (${nombreRol(payload.role_membresias)})` : ''}
              </a>
            ))}
          {/* Academy está apagada en el portal: el interruptor y el porqué
              están en `lib/apps.ts` (`ACADEMY_EN_EL_PORTAL`). La app sigue
              viva por su dirección; lo que no se ofrece es la puerta. */}
          {ACADEMY_EN_EL_PORTAL &&
            (payload.is_super_admin || payload.app_scopes.includes('academy')) && (
            // Mismo SSO por fragmento: academy-web guarda el token al aterrizar
            // en /login#token=… sin segundo formulario.
            <a
              href={`${ACADEMY_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Entrar a Academy
              {payload.role_academy ? ` (${nombreRol(payload.role_academy)})` : ''}
            </a>
          )}
          {!payload.is_super_admin && payload.app_scopes.length === 0 && (
            /**
             * Sin suscripción activa no hay atajo a ninguna app: `app_scopes`
             * sale de las suscripciones, no de los roles (ver `buildToken`).
             *
             * Pero decirle «no tienes aplicaciones» a alguien que lleva meses
             * usando Membresías es sencillamente falso, y es lo que pasaba con
             * todo el que llegó por la reconciliación: su ficha, su club y sus
             * alumnos estaban ahí, y el portal le contestaba que no tenía
             * nada. Si la persona TIENE rol en una app, se le dice lo que de
             * verdad ocurre —falta la suscripción del club— y que su app sigue
             * funcionando por su dirección de siempre.
             */
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {payload.role_membresias ||
              payload.role_campeonatos ||
              payload.role_academy ? (
                <>
                  <p>
                    Tu cuenta está en{' '}
                    {[
                      payload.role_membresias && 'Membresías',
                      payload.role_campeonatos && 'Campeonatos',
                      payload.role_academy && 'Academy',
                    ]
                      .filter(Boolean)
                      .join(' y ')}
                    , pero tu club todavía no tiene una suscripción activa aquí,
                    así que el portal aún no puede llevarte de un salto.
                  </p>
                  <p className="mt-2">
                    Mientras tanto entras como siempre, por la dirección de tu
                    app. Pídele a un administrador de DINAMYT que active la
                    suscripción de tu club.
                  </p>
                </>
              ) : (
                <p>
                  No tienes aplicaciones habilitadas todavía.{' '}
                  <Link href="/planes" style={{ color: 'var(--gold)' }}>
                    Ver planes disponibles
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* «Mi organización» si la gestiona; si solo pertenece a un club,
          «Mi club» con su información (la llena el maestro/admin del club). */}
      {gestiona ? (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Mi organización</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Gestiona tus clubes y tu gente, la ficha de tu club y las
            invitaciones entre organización y clubes.
          </p>
          <Link
            href="/mi-organizacion"
            className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            Abrir mi organización
          </Link>
        </section>
      ) : gestiona === false ? (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Mi club</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            {nombreClub
              ? `Perteneces a ${nombreClub}: mira sus horarios, sede y contactos.`
              : 'Cuando tu maestro te agregue a su club, aquí verás su información. ¿Eres maestro? Funda tu club.'}
          </p>
          <Link
            href="/mi-club"
            className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            {nombreClub ? 'Ver la información de mi club' : 'Mi club'}
          </Link>
        </section>
      ) : null}

      {payload.is_super_admin && (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Administración del ecosistema</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Organizaciones, miembros con su rol y suscripciones a planes.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
          >
            Abrir panel de administración
          </Link>
        </section>
      )}
    </main>
  );
}
