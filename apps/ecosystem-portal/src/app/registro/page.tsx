'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  registerAPI,
  disponibilidadAPI,
  guardarRegistroPendiente,
  extraerError,
} from '@/lib/api';
import {
  soloLetras,
  soloDigitos,
  soloTelefono,
  limitesFechaNacimiento,
  validarNombreCompleto,
  PROPS_CORREO,
  validarCorreo,
  validarDocumento,
  validarTelefono,
  validarContrasena,
  sugerenciaDeCorreo,
  GENEROS,
  type Campo as Resultado,
  LIM,
} from '@/lib/validacion';
import { CampoContrasena } from '@/components/CampoContrasena';
import { CampoFecha } from '@/components/CampoFecha';
import { Campo } from '@/components/Campo';
import { MedidorContrasena } from '@/components/MedidorContrasena';
import { SelectMenu } from '@/components/SelectMenu';

/**
 * Crear cuenta en DINAMYT.
 *
 * ── Qué se pide y por qué son estos y no otros ──
 *
 * La cuenta es de la PERSONA y la usan las tres apps, así que lo que no se
 * pregunte aquí lo tiene que perseguir después el maestro, alumno por alumno.
 * Al revés, cada campo de más es gente que abandona el formulario. El corte
 * está en «lo que otra app va a necesitar sí o sí»:
 *
 *   · Nombre, correo, contraseña → la cuenta. Sin discusión.
 *   · Documento    → Campeonatos lo usa como identificador natural del atleta
 *                    (`competidores.documento`, único) para no duplicarlo entre
 *                    campeonatos.
 *   · Nacimiento   → Campeonatos arma las categorías por edad; Membresías sabe
 *                    a quién felicitar.
 *   · Género       → Campeonatos separa las llaves.
 *   · Teléfono     → es como el club contacta a alguien cuando el correo no
 *                    llega, que es la mitad de las veces.
 *
 * Lo que NO se pide aquí, a propósito: cinturón, club, peso, tipo de sangre,
 * contacto de emergencia, foto. Todo eso lo pone el maestro cuando la persona
 * llega a su club.
 *
 * ── Lo que cambió, y por qué ──
 *
 * 1. **Se avisa en el momento, no al enviar.** Antes esta pantalla no decía
 *    nada hasta que se pulsaba «Crear cuenta»; entonces el servidor contestaba
 *    UN error —el primero— en un texto rojo al final, lejos del campo que lo
 *    causaba. Ahora cada campo se valida al salir de él (ver `Campo.tsx`) con
 *    las MISMAS reglas del servidor (`lib/validacion.ts`).
 * 2. **El correo y el documento se comprueban contra el servidor mientras se
 *    escribe.** Son las dos llaves únicas de la persona, y el choque se
 *    descubría con el formulario entero ya lleno.
 * 3. **La cuenta no se crea aquí.** Al enviar nace un registro que espera su
 *    código y caduca; la cuenta la crea el código en `/verificar`. Por eso al
 *    terminar se navega con `replace`: volver atrás a un formulario ya enviado
 *    solo sirve para enviarlo dos veces.
 */
export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    documentId: '',
    password: '',
    birthDate: '',
    gender: '',
    phone: '',
  });
  type Clave = keyof typeof form;

  const [consent, setConsent] = useState(false);
  /** Campos de los que la persona ya salió: hasta entonces no se le riñe. */
  const [tocado, setTocado] = useState<Partial<Record<Clave | 'consent', boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  /** Lo que dice el servidor sobre el correo y el documento (§2). */
  const [ocupado, setOcupado] = useState<{
    email?: { libre: boolean; motivo?: string };
    documentId?: { libre: boolean; motivo?: string };
  }>({});

  const formRef = useRef<HTMLFormElement>(null);

  // Entre 3 y 100 años, el mismo rango que valida el servidor. Sin los topes,
  // el calendario abriría en la década actual y dejaría elegir el año que
  // viene — un error que solo se descubriría al enviar el formulario.
  const fechas = limitesFechaNacimiento();

  // ── Validación, toda junta y en un solo sitio ────────────────────────────
  //
  // Se recalcula en cada tecla, pero solo se PINTA lo que la persona ya tocó.
  // Tenerla completa siempre es lo que permite saber si el formulario está
  // listo sin repetir las reglas en dos sitios.
  const fallos = useMemo(() => {
    const r: Partial<Record<Clave | 'consent', string>> = {};
    const revisar = (k: Clave, res: Resultado) => {
      if (!res.ok) r[k] = res.error;
    };
    revisar('fullName', validarNombreCompleto(form.fullName));
    revisar('email', validarCorreo(form.email));
    revisar('documentId', validarDocumento(form.documentId));
    revisar('phone', validarTelefono(form.phone));
    revisar(
      'password',
      validarContrasena(form.password, [
        form.email,
        form.fullName,
        form.documentId,
      ]),
    );
    if (!form.birthDate) r.birthDate = 'Elige tu fecha de nacimiento.';
    if (!form.gender) r.gender = 'Elige una opción.';
    if (!consent) r.consent = 'Hay que aceptar el tratamiento de datos.';

    // Lo que dijo el servidor pesa más que la forma: un correo bien escrito
    // pero ya usado sigue siendo un correo que no se puede usar.
    if (!r.email && ocupado.email && !ocupado.email.libre) {
      r.email = ocupado.email.motivo ?? 'Ese correo ya tiene cuenta.';
    }
    if (!r.documentId && ocupado.documentId && !ocupado.documentId.libre) {
      r.documentId = ocupado.documentId.motivo ?? 'Ese documento ya está usado.';
    }
    return r;
  }, [form, consent, ocupado]);

  /** ¿Toca enseñar ya el fallo de este campo? */
  const fallo = (k: Clave | 'consent') => (tocado[k] ? (fallos[k] ?? null) : null);

  const sugerencia = sugerenciaDeCorreo(form.email);

  // ── ¿Están libres el correo y el documento? ──────────────────────────────
  //
  // Con espera: preguntar en cada tecla sería una consulta por letra. Medio
  // segundo después de dejar de escribir, y solo si el valor ya es válido por
  // su forma — no tiene sentido preguntar por «ana@» .
  //
  // Si la consulta falla (sin red, límite por IP), no se dice nada: el
  // formulario sigue funcionando y la última palabra la tiene el envío.
  useEffect(() => {
    const correo = validarCorreo(form.email);
    const doc = validarDocumento(form.documentId);
    if (!correo.ok && !doc.ok) return;

    let vigente = true;
    const t = setTimeout(() => {
      disponibilidadAPI({
        ...(correo.ok ? { email: correo.valor } : {}),
        ...(doc.ok ? { documentId: doc.valor } : {}),
      })
        .then((r) => {
          if (vigente) setOcupado((antes) => ({ ...antes, ...r }));
        })
        .catch(() => undefined);
    }, 500);

    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [form.email, form.documentId]);

  // Saneo por campo: el nombre solo letras (y se guarda en MAYÚSCULAS), el
  // documento solo números, el teléfono solo números y separadores. Es más
  // barato impedir que se teclee mal que explicar después por qué no vale.
  function set(k: Clave) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      if (k === 'fullName') v = soloLetras(v).toLocaleUpperCase('es');
      if (k === 'documentId') v = soloDigitos(v);
      if (k === 'phone') v = soloTelefono(v);
      // Cambiar el correo o el documento invalida lo que dijo el servidor de
      // ellos: dejar el «ya existe» del valor anterior sería mentir.
      if (k === 'email') setOcupado((o) => ({ ...o, email: undefined }));
      if (k === 'documentId') setOcupado((o) => ({ ...o, documentId: undefined }));
      setForm((f) => ({ ...f, [k]: v }));
    };
  }

  const marcar = (k: Clave | 'consent') => () =>
    setTocado((t) => ({ ...t, [k]: true }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Al enviar se dan por tocados TODOS: si algo falla, el aviso sale en su
    // campo y no en un texto suelto al final que no dice cuál es.
    const claves: (Clave | 'consent')[] = [
      'fullName',
      'email',
      'documentId',
      'password',
      'birthDate',
      'gender',
      'phone',
      'consent',
    ];
    setTocado(Object.fromEntries(claves.map((k) => [k, true])));

    const primero = claves.find((k) => fallos[k]);
    if (primero) {
      setError('Revisa lo que está marcado en rojo.');
      // Llevar el foco al primer campo con fallo: en un formulario de siete
      // campos, en un celular, el que falla puede estar fuera de la pantalla.
      formRef.current
        ?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setCargando(true);
    try {
      const pendiente = await registerAPI({ ...form, dataConsent: consent });
      guardarRegistroPendiente({
        email: pendiente.email,
        expiresAt: pendiente.expiresAt,
        enviado: pendiente.enviado,
      });
      // `replace` y no `push`: volver atrás a un formulario ya enviado solo
      // sirve para enviarlo dos veces, y la segunda vez el correo «ya existe».
      router.replace('/verificar');
    } catch (err) {
      setError(extraerError(err, 'No se pudo crear la cuenta.'));
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="text-xl font-extrabold tracking-wide" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-md rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Crear cuenta
        </h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
          Una sola cuenta para Membresías, Campeonatos y Academy.
        </p>

        {/* ── Tu cuenta ─────────────────────────────────────────────────── */}
        <h2 className="eyebrow mb-2">Tu cuenta</h2>

        <div data-campo="fullName">
          <Campo
            etiqueta="Nombre completo"
            pista="como en tu documento"
            error={fallo('fullName')}
            htmlFor="reg-nombre"
          >
            <input
              id="reg-nombre"
              value={form.fullName}
              onChange={set('fullName')}
              onBlur={marcar('fullName')}
              autoComplete="name"
              placeholder="NOMBRE APELLIDO"
              maxLength={LIM.nombrePersona}
            />
          </Campo>
        </div>

        <div data-campo="email">
          <Campo
            etiqueta="Correo"
            htmlFor="reg-correo"
            error={fallo('email')}
            ok={
              !fallos.email && ocupado.email?.libre
                ? 'Ese correo está libre.'
                : null
            }
            info={
              /* La sugerencia NO corrige sola: `gmail.co` es un dominio real
                 (Colombia) y corregirlo por su cuenta dejaría a esa gente sin
                 poder registrarse. Se ofrece y se acepta con un toque. */
              sugerencia && !fallo('email') ? (
                <>
                  ¿Quisiste decir{' '}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, email: sugerencia }))}
                  >
                    {sugerencia}
                  </button>
                  ?
                </>
              ) : null
            }
          >
            <input
              id="reg-correo"
              {...PROPS_CORREO}
              value={form.email}
              onChange={set('email')}
              onBlur={marcar('email')}
              autoComplete="email"
              placeholder="tucorreo@gmail.com"
            />
          </Campo>
        </div>

        <div data-campo="password">
          <Campo etiqueta="Contraseña" error={fallo('password')} htmlFor="reg-clave">
            {/* El mismo ojo que Membresías y Campeonatos (ver OPERAR.md §4.9). */}
            <CampoContrasena
              id="reg-clave"
              value={form.password}
              onChange={set('password')}
              onBlur={marcar('password')}
              autoComplete="new-password"
            />
          </Campo>
          {/* Los mínimos, a la vista mientras se teclea, en vez de un «mín. 8
              caracteres» que dejaba pasar `12345678`. */}
          <div className="-mt-2 mb-4">
            <MedidorContrasena clave={form.password} />
          </div>
        </div>

        {/* ── Tus datos deportivos ──────────────────────────────────────── */}
        <h2 className="eyebrow mb-1">Tus datos deportivos</h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Con esto tu club y tus campeonatos te reconocen sin volver a
          preguntártelo cada vez.
        </p>

        <div className="grid gap-x-3 sm:grid-cols-2">
          <div data-campo="documentId">
            <Campo
              etiqueta="Documento"
              pista="solo números"
              error={fallo('documentId')}
              htmlFor="reg-documento"
              ok={
                !fallos.documentId && ocupado.documentId?.libre
                  ? 'Documento disponible.'
                  : null
              }
            >
              <input
                id="reg-documento"
                value={form.documentId}
                onChange={set('documentId')}
                onBlur={marcar('documentId')}
                inputMode="numeric"
                maxLength={LIM.documento}
                placeholder="1000000000"
              />
            </Campo>
          </div>

          <div data-campo="phone">
            <Campo etiqueta="Teléfono" error={fallo('phone')} htmlFor="reg-telefono">
              <input
                id="reg-telefono"
                value={form.phone}
                onChange={set('phone')}
                onBlur={marcar('phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={LIM.telefono}
                placeholder="3001112233"
              />
            </Campo>
          </div>

          <div data-campo="birthDate">
            <Campo etiqueta="Fecha de nacimiento" error={fallo('birthDate')}>
              {/* El calendario propio, no el del sistema: el nativo de Android
                  solo avanza mes a mes y poner un año de nacimiento cuesta cien
                  toques. Ver `components/CampoFecha.tsx`. */}
              <CampoFecha
                valor={form.birthDate}
                onChange={(v) => {
                  setForm((f) => ({ ...f, birthDate: v }));
                  setTocado((t) => ({ ...t, birthDate: true }));
                }}
                min={fechas.min}
                max={fechas.max}
                borrable={false}
                placeholder="Elige tu fecha"
                etiquetaAria="Fecha de nacimiento"
              />
            </Campo>
          </div>

          <div data-campo="gender">
            <Campo etiqueta="Género" error={fallo('gender')}>
              {/* El desplegable propio del ecosistema, el mismo de Membresías y
                  Campeonatos, en vez del `<select>` gris del sistema. */}
              <SelectMenu
                valor={form.gender}
                onChange={(v) => {
                  setForm((f) => ({ ...f, gender: v }));
                  setTocado((t) => ({ ...t, gender: true }));
                }}
                opciones={GENEROS.map((g) => ({
                  valor: g.valor,
                  etiqueta: g.etiqueta,
                }))}
                placeholder="— Selecciona —"
                etiquetaAria="Género"
              />
            </Campo>
          </div>
        </div>

        <div data-campo="consent">
          <label
            className="mt-2 flex items-start gap-2 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setTocado((t) => ({ ...t, consent: true }));
              }}
              className="mt-0.5 w-auto"
            />
            <span>
              Acepto el tratamiento de mis datos personales según la{' '}
              <Link href="/privacidad" target="_blank" style={{ color: 'var(--gold)' }}>
                política de privacidad
              </Link>{' '}
              (Ley 1581 de 2012).
            </span>
          </label>
          {fallo('consent') && (
            <p className="campo-aviso" data-tono="error" aria-live="polite">
              <span aria-hidden="true">✕</span>
              <span>{fallo('consent')}</span>
            </p>
          )}
        </div>

        {error && (
          <p className="mb-3 mt-4 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {/* El botón NO se deshabilita mientras falte algo: un botón apagado no
            dice qué falta, y en un formulario largo eso deja a la persona
            buscando. Se pulsa, y el formulario contesta señalando. */}
        <button type="submit" disabled={cargando} className="btn btn-cta mt-4 w-full">
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Te enviaremos un código a tu correo para confirmarlo. La cuenta se crea
          cuando lo escribas.
        </p>
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--gold)' }}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
