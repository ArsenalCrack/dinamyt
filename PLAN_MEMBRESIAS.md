# DINAMYT Membresías — Requisitos y plan de la app

> Documento vivo. Creado 2026-07-02. Define la nueva app del ecosistema DINAMYT
> para el control de mensualidades, pagos y asistencia de alumnos de un club/dojo.
> Léelo junto a `PLAN_FUSION.md`, `HANDOFF.md` y `RUN_LOCAL.md`.

## 0. Decisiones ya tomadas (candados)

| Tema | Decisión |
| --- | --- |
| **Encaje en el ecosistema** | App independiente = **servicio nuevo** (`membresias-web` + `membresias-api` + tablas propias), **federado sobre la identidad del `ecosystem-api`** (misma persona, mismo club, mismo login). |
| **Nombre** | **DINAMYT Membresías** · scope de app `membresias` · rol en el JWT `role_membresias`. |
| **Perfil y roster** | **Los alumnos y su perfil viven en `ecosystem` (persona única).** El maestro los da de alta y los edita desde el **portal del ecosystem**; Membresías **no crea alumnos**, toma el roster del club. |
| **Check-in de clases** | **Lector de huella + kiosco (Windows)**, pero la app **debe funcionar igual sin lector** (degradación a QR / PIN / lista manual). |
| **Notificaciones** | **Push (PWA)** como principal + **Email de respaldo**, al alumno/acudiente y al maestro. |
| **Ciclo de cobro** | **Mes calendario** (aniversario de la fecha de pago), anclado a `max(hoy, vence_anterior)`. *(No "30 días exactos": esos corren la fecha ~5 días/año; el mes-aniversario es lo que realmente usa el streaming.)* |
| **Acceso vencido** | 1er check-in vencido: **deja entrar + avisa**; a partir del 2º: **bloquea** (configurable). |
| **Días de operación** | El club **no abre todos los días** (un día entre semana + fines de semana cerrados). Esos días **no cuentan como clase** (asistencia, paquetes y estadísticas). |

## 1. Visión

Una web (PWA) para que un **maestro** lleve el control de **quién ha pagado, quién
debe y quién asiste** en su club, sin fricción. La plataforma **no procesa pagos**:
el dinero se paga por fuera (efectivo o a la cuenta del maestro) y la app solo
**registra** el pago y actualiza el estado del alumno. Al leerse el check-in (huella,
QR o PIN) la app dice al instante **días faltantes / estado**, y si está vencido
permite **marcar el pago ahí mismo** en un paso.

Objetivos:

- Cero doble-registro: el alumno es **una persona** del ecosistema, vinculada **una
  vez** al club; aquí solo se le da rol y datos de membresía.
- Recordatorios automáticos **antes** del vencimiento y **el día** del vencimiento.
- Control y estadísticas para el maestro (recaudo, cartera, asistencia, avance del
  grupo).

**Fuera de alcance (por ahora):** pasarela de pagos / cobro en línea, facturación
electrónica DIAN, contabilidad, multi-sede.

## 2. Cómo encaja en DINAMYT (integración — el corazón del asunto)

La identidad ya está resuelta por el `ecosystem-api` (schema `ecosystem`, Drizzle):

- **`users`** — la persona. Única por `email` y `document_id` (cédula). **Fuente de
  verdad única de un ser humano en TODO el ecosistema.**
- **`organizations`** — tipos `FEDERATION | LEAGUE | CLUB | ACADEMY` con jerarquía
  (`parent_id`). El **club del maestro** es una fila de tipo `CLUB`.
- **`org_members`** — vincula `user ↔ org` con un `role`. **El alumno se une al club
  aquí, una sola vez.**
- **`subscription_plans.apps_included`** — array de apps que desbloquea un plan
  (hoy `'campeonatos'`, `'academy'`).
- En el login, `buildToken()` arma el JWT con `app_scopes`, `org_id`,
  `role_campeonatos`, `role_academy`, `is_super_admin`.

Cada app independiente **verifica el token contra el JWKS del ecosystem** y gatea sus
rutas por scope/rol. Patrón real ya usado por `campeonatos-api`:

- `campeonatos-api` (Fastify) → `createRemoteJWKSet(ECOSYSTEM_JWKS_URL)` valida RS256;
  `requireScope('campeonatos')` mira `app_scopes`; `requireRole(...)` mira
  `role_campeonatos`. El super-admin siempre pasa.
- `campeonatos-web` (Next) → delega el **login al ecosystem**, guarda el mismo token
  `dinamyt_token` y llama a su propia API.

**Membresías replica ese patrón**, y por eso NO hay triple registro:

1. **Nuevos artefactos:** `membresias-web` (Next PWA) + `membresias-api` (Fastify) +
   schema de BD propio `membresias`. Front delega login al ecosystem (mismo
   `dinamyt_token`), API verifica contra el JWKS del ecosystem.
2. **Cambios pequeños en el ecosystem (habilitar el scope):**
   - Agregar `'membresias'` como valor válido de `apps_included`.
   - Agregar `role_membresias: string | null` al `JwtPayload` en `@dinamyt/shared` y
     poblarlo en `buildToken()` (mismo mapeo que `role_academy`/`role_campeonatos`).
3. **Alta de un alumno (se gestiona en el ecosystem, no aquí):**
   - El maestro **crea la persona y la agrega a su club desde el portal del ecosystem**
     (`ecosystem.users` + `org_members`, con rol `membresias`). Ahí también edita el
     **perfil de la persona** (ver §6).
   - Membresías **no crea alumnos ni cuentas**: **lee el roster del club** desde el
     ecosystem y solo agrega el *estado de membresía en este club* (plan vigente,
     vencimiento, pagos, asistencias) en sus tablas.

> Resultado: **una persona, un club, roles por app.** Registras al alumno una vez y
> vive en las dos apps. La app "independiente" lo es en código y datos de negocio,
> no en identidad.

### Alternativa a evaluar
`membresias-api` puede ser (a) un servicio nuevo tipo `campeonatos-api`, o (b) un
módulo dentro del `ecosystem-api`. Recomendado **(a)** por consistencia con el
patrón actual y para aislar el dominio; se decide en implementación.

## 3. Roles (dentro de Membresías → `role_membresias`)

| Rol | Puede |
| --- | --- |
| `owner` (maestro/dueño) | Todo: alumnos, planes, registrar/editar pagos, asistencia, reportes, configuración del club. |
| `staff` (auxiliar/recepción) | Registrar pagos y asistencia, ver alumnos y reportes; sin borrar ni cambiar configuración. |
| `guardian` (acudiente) | Ver el estado y el historial de **sus** alumnos, recibir avisos. Puede pagar por **varios** alumnos. |
| `student` (alumno) | Ver su propio estado, días faltantes, historial y recibir avisos. |
| `is_super_admin` | Acceso total (soporte DINAMYT). |

## 4. Actores y dispositivos

- **Kiosco de check-in**: PC/tablet en la entrada del dojo, modo kiosco, idealmente
  **offline-tolerante**. Con o sin lector de huella.
- **Panel del maestro/auxiliar**: web (celular o PC) para gestión y reportes.
- **App del alumno/acudiente**: PWA instalable para ver estado y recibir Push.

## 5. Modelo de negocio: planes y pagos

### 5.1 Tipos de plan (configurables por el maestro)
- **Mensual** — extiende el vencimiento por tiempo (ciclo de 30 días).
- **Semanal** — extiende por 7 días.
- **Clase suelta** — habilita **1** asistencia (no cambia el vencimiento por tiempo).
- **Paquete de N clases** — habilita **N** asistencias (se descuentan al asistir).
- **Matrícula/inscripción** — cargo único de ingreso (aparte de la mensualidad).

Cada plan: `nombre`, `tipo`, `precio` (COP), `duración_días` o `n_clases`,
`activo`. Precios y planes los define cada club.

### 5.2 Regla de vencimiento (mes calendario / aniversario)
Cada alumno tiene una **membresía vigente** con un `vence_el` (planes por tiempo) o
`clases_restantes` (paquete/clase). Al registrar un pago:

- **Mensual:** `vence_el = mesSiguiente(max(hoy, vence_el_anterior))` — el **mismo día
  del mes siguiente** (si el mes no tiene ese día, el último día del mes). Anclar en
  `max(hoy, vence_anterior)` **no castiga al que paga anticipado** ni regala días al que
  paga tarde. Es el modelo real de las plataformas de streaming; a diferencia de "30
  días exactos", **la fecha de pago no se va corriendo** mes a mes.
- **Semanal:** `vence_el = max(hoy, vence_anterior) + 7 días`.
- **Paquete/clase:** `clases_restantes += n_clases`.
- **Matrícula:** marca `matriculado = true`; no toca el vencimiento.

> **Días cerrados y el mes:** un plan **por tiempo** (mensual/semanal) es una
> *membresía*, así que vence por **calendario** aunque el club cierre algunos días
> (igual que un gimnasio). Los días de operación (§7.4) **solo** afectan a los planes
> **por clases** y a la asistencia/estadísticas, no al vencimiento por tiempo.

**Días/clases faltantes** = `vence_el − hoy` (por tiempo) o `clases_restantes` (por
clases). **Estado**: `al_día` · `por_vencer` (dentro de la ventana de aviso) ·
`vencido`.

### 5.3 Registro de pagos
- Un pago guarda: alumno, plan aplicado, **monto**, **método** (efectivo /
  transferencia / Nequi / Daviplata — solo metadato), fecha, quién lo registró
  (`registrado_por`), y notas.
- Soporta **pago parcial** (estado `PARCIAL` / `PENDIENTE`) y saldo pendiente.
- Genera un **comprobante/recibo** (PDF o pantalla) aunque el cobro sea externo.
- **Descuentos/becas** por alumno o por plan; **recargo por mora** configurable
  (opcional, fase posterior).
- Historial completo e inmutable (editar un pago deja rastro en auditoría).

## 6. Perfil del alumno = perfil de la persona (vive en ECOSYSTEM)

El perfil del alumno **no es de este servicio**: es el **perfil de la persona en todo
el ecosistema**, así que vive en `ecosystem.users` (y tablas anexas) y lo consumen por
igual Campeonatos y Membresías. El maestro lo edita desde el **portal del ecosystem**.

**Ya existe hoy en `ecosystem.users`:** `full_name`, `document_id`, `email`, `phone`,
`birth_date`, `avatar_url` (foto), `data_consent_at`.

**Hay que AÑADIR al ecosystem (ver `apps/ecosystem-api/README.md`):**
- **Contacto de emergencia**: nombre, teléfono, parentesco.
- **Notas médicas** (alergias/condiciones) — *dato sensible* (salud): con
  consentimiento; también útil para Campeonatos.
- **Acudiente / relación**: tabla `user_guardians` (persona ↔ acudiente + parentesco).
  Un acudiente puede tener **varios** menores; habilita también el consentimiento de
  menores en Campeonatos.
- **Grado/cinturón**: tabla `user_disciplines` (`discipline`, `current_grade`, `since`).
  Es atributo de la persona (Campeonatos también lo usa para categorizar); **lo edita el
  maestro** (promociones). **Una disciplina por ahora**, pero la tabla ya soporta varias
  para no bloquear el futuro.

**Se queda en Membresías (estado en ESTE club, no de la persona):**
- **Estado en el club**: `activo · inactivo · suspendido · retirado` (con motivo/fecha)
  — una persona puede estar activa en un club y retirada en otro.
- **Fecha de ingreso al club** (ya la da `org_members.joined_at`).
- **Pagador** que cubre la membresía en este club, plan vigente y vencimiento.

## 7. Asistencia / check-in (huella opcional + fallback)

Requisito clave: **la app funciona con o sin lector de huella.**

### 7.1 Con lector (kiosco)
- **Hardware:** un **escáner de huella USB** conectado al PC/tablet del kiosco
  (Windows). Son económicos y comunes en Colombia (control de acceso/asistencia).
  Candidatos: **DigitalPersona U.are.U 4500** (estándar, buen SDK Windows) o **ZKTeco
  ZK4500 / SLK20R**. No es un terminal autónomo: es un escáner + SDK en el PC.
- Un **agente local** (companion de escritorio) es el **único** que habla con el
  hardware (vía el SDK del lector), hace el **enrolamiento** y la **identificación 1:N**
  y expone el match por `localhost` a la PWA. **La web nunca depende de que exista el
  lector.**
- **La marca del lector solo afecta al agente**, no a la API/BD/web (quedan detrás de un
  **contrato estable** agente↔API: "es fulano" / "no hay match"). El lector es un
  **adaptador enchufable**. Dos matices:
  - **Lock-in de plantilla:** la huella se guarda como *plantilla* (código, no imagen),
    en un **formato propietario NO intercambiable** entre marcas → se elige **una** y se
    guarda su `format`; cambiar de marca obliga a **re-enrolar** a todos.
  - **Dispositivo:** estos SDKs USB piden **Windows** (no Android) → el kiosco es un
    PC/tablet Windows. El matching 1:N corre en el PC (instantáneo con decenas de
    alumnos).
- Flujo: alumno pone la huella → identifica (1:N) → la pantalla muestra **nombre +
  días faltantes / clases restantes + estado** → registra la asistencia. Si está
  **vencido**, ofrece **"marcar pago"** ahí mismo (elige plan/monto, 1 toque).
- **Enrolamiento** de huella: se captura el *template* (no la imagen) al inscribir,
  con consentimiento.

### 7.2 Sin lector (degradación)
Mismo flujo, identificando por: **QR personal** del alumno, **PIN**, o **selección
manual** de la lista del día. El kiosco detecta si el agente/lector está disponible;
si no, cae automáticamente a estos métodos. Configurable como preferencia del kiosco.

### 7.3 Reglas de asistencia
- Evitar **doble check-in** el mismo día.
- Si el plan es por **paquete/clase**, descuenta 1 de `clases_restantes`.
- **Política de acceso vencido** (configurable): dejar entrar y **avisar**, o
  **bloquear**. Default: dejar entrar + avisar + ofrecer pago.
- Horarios/**grupos**/disciplinas para saber a qué clase corresponde el check-in.

### 7.4 Calendario del club (días de operación)
El club **no abre todos los días**: por defecto no trabaja **un día entre semana y los
fines de semana**. Esos días **no cuentan como clase**.

- **`club_schedule`**: qué días de la semana hay clase (config por club) + horarios/
  grupos. **Excepciones** (`schedule_exceptions`): festivos/cierres puntuales y días
  extra de apertura.
- **Efecto:** no se registra asistencia en días cerrados; los planes **por paquete/
  clase** solo descuentan en días de operación; el **% de asistencia** se calcula sobre
  días de operación (no sobre los 7 de la semana).
- **No afecta** el vencimiento de los planes por tiempo (ver §5.2).

## 8. Notificaciones (Push PWA + Email de respaldo)

- **PWA instalable** + **Web Push (VAPID)** con service worker.
- **Al alumno/acudiente:** X días antes del vencimiento (config, default **3 días**),
  **el día** del vencimiento, y recordatorio(s) de **mora** (cadencia config).
- **Al maestro:** resumen (próximos a vencer, vencidos hoy, cartera, cumpleaños/
  eventos opcionales).
- **Preferencias**: a quién avisar (alumno / acudiente / ambos), tope de frecuencia
  para no spamear, horario permitido.
- **Canales:** **Push (PWA)** como principal + **Email de respaldo** (el ecosystem ya
  envía correo vía Nodemailer para los OTP, así que reutilizamos ese canal). Si el
  usuario **no instaló** la PWA o **no dio permiso** de push, el aviso **cae a email**;
  además siempre hay **aviso in-app** (badge de estado).
- Motor: un **job programado** (diario) evalúa vencimientos y encola las notificaciones
  (push + email según preferencia/fallback).

## 9. Estadísticas y reportes (para el maestro)

- **Recaudo**: esperado vs. recaudado del mes; ingresos por tipo de plan.
- **Cartera vencida**: monto y **lista de morosos** con días de atraso.
- **Asistencia**: % por alumno y por grupo; racha/inactividad (alumnos que dejaron de
  venir → riesgo de deserción).
- **Avance del grupo**: distribución de cinturones/grados, próximos exámenes.
- **Altas/bajas y retención** (churn) por periodo.
- **Export** a Excel/PDF.

## 10. Modelo de datos propuesto (schema `membresias`)

> Estilo Drizzle, análogo al schema `ecosystem`. Referencia a la persona por
> `user_id` (FK lógica a `ecosystem.users`) — **no** se duplican datos de la persona.

- **`memberships`** (estado del miembro del club en esta app; el **perfil de la
  persona** vive en `ecosystem`, ver §6)
  `id, org_id, user_id (→ ecosystem.users), payer_user_id?,
   status(activo|inactivo|suspendido|retirado), status_reason?,
   matriculado(bool), current_plan_id?, vence_el?, clases_restantes?, updated_at`.
- **`plans`** (planes/tarifas del club)
  `id, org_id, name, type(mensual|semanal|clase|paquete|matricula), price, duration_days?,
   n_classes?, is_active`.
- **`payments`** (registro de pagos — el cobro es externo)
  `id, membership_id, plan_id, amount, method(efectivo|transferencia|nequi|daviplata),
   status(PAID|PARTIAL|PENDING), paid_at, registered_by_user_id, notes`.
- **`club_schedule`** (días/horarios de operación del club — §7.4)
  `id, org_id, weekday, opens_at, closes_at, group?, is_active`.
- **`schedule_exceptions`** (festivos/cierres y aperturas extra)
  `id, org_id, date, is_closed(bool), note`.
- **`attendances`** (asistencias/check-ins)
  `id, membership_id, checked_in_at, method(fingerprint|qr|pin|manual), group_id?,
   device_id?`.
- **`biometric_templates`** (dato sensible — cifrado, con consentimiento)
  `id, membership_id, template(bytea, cifrado), format(marca/formato — vendor lock-in),
   consent_at, created_at`.
- **`devices`** (kioscos registrados)
  `id, org_id, name, os, has_reader(bool), last_seen_at`.
- **`notifications`** (avisos encolados/enviados)
  `id, user_id, membership_id?, type(pre_venc|venc|mora|maestro), channel(push|email),
   scheduled_for, sent_at, status`.
- **`audit`** (auditoría de acciones sensibles: pagos, edición, borrado).

## 11. Requisitos no funcionales

- **Privacidad (Ley 1581/2012, Colombia):** la **huella es dato sensible** →
  consentimiento explícito, cifrado, guardar solo el *template* (no imagen), y
  **derecho al borrado**. Menores → consentimiento del acudiente. Reusar
  `data_consent_at` y añadir consentimiento biométrico por app.
- **Offline / kiosco:** el check-in debe tolerar caídas de internet (cola local que
  sincroniza al reconectar). El dojo puede tener mal internet.
- **Auditoría:** quién registró/editó/borró cada pago y asistencia.
- **Localización:** COP, `es-CO`, zona horaria `America/Bogota`.
- **Seguridad:** RS256 vía JWKS del ecosystem; gate por `requireScope('membresias')`
  y `requireRole(...)`.
- **PWA:** instalable, service worker, Web Push.

## 12. Alcance por fases

**Fase 0 — En el ecosystem (prerrequisito)**
- Ampliar el **perfil de la persona** (contacto de emergencia, notas médicas,
  `user_guardians`, `user_disciplines`) + endpoints `/users/:id/profile`.
- Agregar el scope `membresias` y `role_membresias` al JWT.

**Fase 1 — MVP de Membresías (sin hardware)**
- Servicio nuevo `membresias-api` + `membresias-web`; roster **leído del club**.
- Planes/tarifas; **días de operación del club** (calendario).
- **Registrar pagos** (mensual/semanal/clase/paquete/matrícula) + historial +
  comprobante; **vencimiento por mes calendario**; días/clases faltantes y estado.
- **Check-in por QR / PIN / manual**; asistencias; regla "vencido: 1º avisa, 2º bloquea".
- Reportes básicos: esperado vs. recaudado, **lista de morosos**, asistencia.
- **Avisos in-app + Email** (reutiliza el mailer del ecosystem) + job diario.

**Fase 2 — Notificaciones push y biometría**
- **Push (PWA)** con VAPID (pre-vencimiento, vencimiento, mora).
- **Lector de huella + agente local (Windows)** (enrolamiento + identificación + pago
  rápido). Kiosco offline con sincronización.

**Fase 3 — Avanzado**
- Recargo por mora automático, descuentos/becas, acudiente multi-alumno avanzado.
- Estadísticas de avance del grupo (cinturones, exámenes), retención/churn, export.

## 13. Requisitos funcionales (resumen numerado)

- **RF-01** El sistema reutiliza la identidad del ecosystem; **no crea cuentas ni
  alumnos** propios.
- **RF-02** El maestro **gestiona a los alumnos (alta y perfil) desde el portal del
  ecosystem**; Membresías **lee el roster del club** y no re-registra a nadie.
- **RF-03** El perfil del alumno (emergencia, notas médicas, acudiente, grado) es de la
  **persona** y vive en el ecosystem; Membresías solo guarda el **estado en el club**.
- **RF-04** El maestro define planes/tarifas (mensual, semanal, clase, paquete,
  matrícula) con precio propio.
- **RF-05** El maestro configura los **días de operación** del club; los días cerrados
  no cuentan como clase para asistencia, paquetes ni estadísticas.
- **RF-06** Al registrar un pago, el sistema recalcula el vencimiento **por mes
  calendario** (o +7 días semanal) o suma clases al paquete.
- **RF-07** El sistema muestra, por alumno, **días/clases faltantes** y estado (al día /
  por vencer / vencido).
- **RF-08** El check-in identifica al alumno por **huella, QR, PIN o lista** y registra
  asistencia mostrando su estado.
- **RF-09** Si el alumno está vencido, el check-in **lo deja entrar y avisa la 1ª vez**
  y **bloquea a partir del 2º** (configurable); permite **marcar el pago** en un paso.
- **RF-10** El sistema funciona **con o sin** lector de huella (degradación automática).
- **RF-11** El sistema **notifica por Push (PWA) con respaldo a Email** e in-app: al
  alumno/acudiente antes y en el vencimiento, y al maestro los próximos a vencer.
- **RF-12** El sistema muestra reportes de recaudo, cartera, asistencia y avance.
- **RF-13** Toda acción sensible (pagos, edición) queda **auditada**.
- **RF-14** El manejo de huella y notas médicas cumple **consentimiento y cifrado**
  (datos sensibles, Ley 1581).

## 14. Decisiones pendientes / supuestos a confirmar

**Resueltas (2026-07-02):**
- Vencimiento por **mes calendario** (aniversario). Si el mes destino no tiene ese día
  (p. ej. pagó un 31), **vence el último día del mes**, conservando el día original
  como ancla para los meses siguientes.
- Acceso vencido: **1ª avisa / 2ª bloquea**, contando **días de clase** vencido (no
  check-ins sueltos).
- **Grado/cinturón:** lo edita **el maestro** (promociones). **Una disciplina por
  ahora**, pero `user_disciplines` ya soporta varias (no bloquea el futuro).
- **Lector:** escáner **USB al PC** (Windows), económico; alta de persona **en el
  portal del ecosystem**; **Email de respaldo** además de Push; `membresias-api` =
  **servicio nuevo**.

Queda por confirmar:
- **Modelo exacto del lector** al comprarlo (candidatos: DigitalPersona U.are.U 4500 o
  ZKTeco ZK4500/SLK20R) → fija el SDK del agente local **y el formato de plantilla (hay
  lock-in de marca; solo afecta al agente, no a la API/BD/web)**.
