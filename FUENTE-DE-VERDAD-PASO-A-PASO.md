# DINAMYT — Una sola ficha por persona, paso a paso

> **Qué consigue esto.** Que los datos de un alumno —su nombre, su foto, su
> cinturón, su tipo de sangre, a quién llamar— se escriban en UN sitio: el
> portal. Membresías deja de tener formulario para ellos y pasa a leerlos; el
> escudo del club, igual. Y para que eso no deje el carnet congelado, el portal
> avisa a Membresías cada vez que se guarda una ficha.
>
> Va después del puente de altas (`PUESTA-AL-DIA.md`): aquella ya hizo que la
> persona exista una vez; esta hace que sus datos sean uno solo.

| | |
|---|---|
| ⏱ **Cuánto dura** | ~25 minutos, casi todos de espera de compilaciones |
| 🔁 **Se puede repetir** | Sí. No hay migraciones: no toca ni una columna |
| ↩️ **Marcha atrás** | Sí, está al final. Se vuelve con un `git checkout` |
| ⚠️ **Qué NO hace** | No mueve datos. Lo que ya esté distinto a los dos lados sigue distinto hasta que alguien lo guarde en el portal |

---

## Lo que cambia, en una tabla

| Dónde | Qué | Por qué |
|---|---|---|
| Portal · «Mi organización» | El maestro sube, cambia y quita **la foto** de cada alumno | Antes solo la ponía Membresías, y la del portal se quedaba en iniciales |
| Portal · «Mi organización» | **«Entrena desde»**, pegada al cinturón | Es su misma fila (`user_disciplines`) y su mismo gesto. Era el único dato de la persona que seguía editándose en Membresías |
| Portal · ficha del club | País y ciudad son **desplegables**; se fueron «Delegación» y «País de la delegación»; dos columnas y sección propia | Escritos a mano salían cuatro grafías de la misma ciudad, y Campeonatos agrupa comparando ese texto por valor exacto |
| Portal · listas de gente | **Dos columnas** en pantalla ancha | Veinte filas en una tira dejaban media pantalla en blanco |
| Membresías · ficha del alumno | Los datos de la persona pasan a **lectura** —sin un solo botón de guardar—, con enlace al portal. «Registrar un pago» se pone **al lado** de «Plan y estado en el club», y «Poner contraseña nueva» **junto al** «Acceso rápido con QR» | Se podía editar por los dos lados y ganaba el último que guardara |
| Membresías · panel del club | Se va el botón **«Cambiar escudo»** | El escudo se pone en la ficha del club del portal |
| Membresías · API | `PATCH /users/:id` y `PATCH /auth/me` rechazan los campos de la persona (403) | La reja tiene que estar en el servidor, no solo en la pantalla |
| Las dos APIs | El portal avisa a Membresías al guardar (`POST /sync/persona`, `/sync/club`) | Sin esto la foto nueva no llegaría nunca al carnet |
| Las dos APIs | **La contraseña también se copia** (`POST /sync/contrasena`), y Membresías deja de dejar que se fije desde su lado | Se cambiaba en el portal y en el club seguía valiendo la vieja: dos contraseñas para una cuenta. Ver [CONTRASENA-UNICA.md](CONTRASENA-UNICA.md) |

> **Membresías como producto independiente no cambia en nada.** Todo esto se
> enciende solo cuando la ficha tiene `eco_sub` (o el club `eco_org_id`) **y**
> el SSO está configurado. Sin ecosistema detrás, el maestro lo sigue editando
> todo allí. Ver `apps/membresias-api/src/lib/ecosistema.ts`.

---

# 💻 PASO 1 · Empujar desde tu PC ⏱ 5 min

> **En TU PC, no en el servidor.** Son dos repositorios y el orden no importa,
> pero los dos tienen que estar arriba antes de tocar el VPS.

### 1.1 Membresías

```powershell
cd D:\Repositorios\dinamyt-membresias; git add -A; git status --short
```

**Nunca `commit` sin mirar antes esa lista.** Solo deben salir archivos de
`apps/membresias-api/src` y `apps/membresias-web/src`. Si cuadra:

```powershell
cd D:\Repositorios\dinamyt-membresias; git commit -m "feat(identidad): la ficha se lee aqui y se escribe en el portal"; git push
```

### 1.2 El monorepo

```powershell
cd D:\Repositorios\dinamyt; git add -A; git status --short
```

```powershell
cd D:\Repositorios\dinamyt; git commit -m "feat(portal): foto del alumno, pais y ciudad de catalogo, y el espejo a Membresias"; git push
```

---

# 🖥️ PASO 2 · El secreto compartido ⏱ 3 min

> **En el VPS** (`ssh dinamyt@80.190.78.70`).

Es lo único que hay que inventar, y tiene que valer **lo mismo en los dos
servicios**. Se genera una vez y se copia:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Guarda esa línea a mano; la vas a pegar dos veces.

> **Si las dos no coinciden, el portal recibe un 401 en cada guardado** y lo
> apunta en su registro (`la copia de Membresías quedó vieja`). No se rompe
> nada: el guardado del portal termina igual. Pero la foto no viaja.

### 2.1 En el ecosistema

```bash
sudo -u dinamyt tee -a /srv/dinamyt/apps/ecosystem-api/.env > /dev/null <<'EOF'
MEMBRESIAS_SYNC_URL=http://127.0.0.1:3004
ECOSYSTEM_SYNC_SECRET=PEGA_AQUI_EL_SECRETO
EOF
```

Luego `sudo nano /srv/dinamyt/apps/ecosystem-api/.env` y sustituye
`PEGA_AQUI_EL_SECRETO`.

> `127.0.0.1:3004` porque las dos APIs viven en la misma máquina: el aviso no
> sale a internet ni pasa por Caddy. Comprueba el puerto con
> `curl -s 127.0.0.1:3004/health`.

### 2.2 En Membresías

```bash
sudo -u dinamyt tee -a /srv/membresias/apps/membresias-api/.env > /dev/null <<'EOF'
ECOSYSTEM_SYNC_SECRET=PEGA_AQUI_EL_SECRETO
EOF
```

Y otra vez `sudo nano /srv/membresias/apps/membresias-api/.env` para pegar el
mismo valor.

✅ Que sean idénticos:

```bash
grep -h ECOSYSTEM_SYNC_SECRET /srv/dinamyt/apps/ecosystem-api/.env /srv/membresias/apps/membresias-api/.env | sort -u | wc -l
```

Tiene que decir **1**. Si dice 2, están distintos.

---

# 🖥️ PASO 3 · El ecosistema ⏱ 8 min

```bash
cd /srv/dinamyt && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build && sudo systemctl restart dinamyt-id dinamyt-portal
```

> **El portal hay que recompilarlo aunque no toque ninguna variable**: el
> catálogo de países y ciudades vive dentro del build (`src/lib/geo.ts`), y
> reiniciar sin compilar deja los desplegables como estaban.

✅ Los dos vivos:

```bash
systemctl is-active dinamyt-id dinamyt-portal
```

---

# 🖥️ PASO 4 · Membresías ⏱ 8 min

```bash
cd /srv/membresias && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/membresias-db build && pnpm --filter @dinamyt/membresias-api build && pnpm --filter @dinamyt/membresias-web build && sudo systemctl restart membresias-api membresias-web
```

✅ La ruta del espejo ya existe (sin el secreto contestaría 404):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST 127.0.0.1:3004/sync/persona -H 'content-type: application/json' -d '{}'
```

Tiene que decir **401** — hay ruta y pide secreto. Un **404** significa que
`ECOSYSTEM_SYNC_SECRET` no llegó al proceso (¿reiniciaste?).

---

# 🌐 PASO 5 · Comprobar que quedó de verdad ⏱ 5 min

Esto se mira en el navegador, con la cuenta de un maestro.

1. **Portal → Mi organización → ✎ Perfil de un alumno.** Arriba, junto a su
   nombre, salen **Subir foto** / **Cambiar foto** y **Quitar foto**. Sube una.
2. **Membresías → Alumnos → ese alumno.** Su cara ya está en la cabecera y en
   la vista previa del carnet. *Si sigue con las iniciales, el aviso no llegó:*
   `sudo journalctl -u dinamyt-id -n 30 --no-pager | grep -i espejo`.
3. En esa misma ficha, sus datos personales son una **tarjeta de lectura** con
   un botón **«Editar en DINAMYT ↗»** y **ningún botón de guardar** —«Entrena
   desde» incluida—. Más abajo, «Registrar un pago» está **al lado** de «Plan y
   estado en el club», y «Poner contraseña nueva» **debajo del** «Acceso rápido
   con QR».
4. **Portal → Mi organización → ficha del club.** País y ciudad son
   desplegables, ya no están «Delegación» ni «País de la delegación», y el
   escudo se pone ahí.
5. **Membresías → panel del club.** Ya no hay botón de escudo.
6. **Entra como alumno a Membresías → «Mi perfil».** Ve sus datos y un enlace al
   portal; ya no los edita.
7. **La vista previa del carnet queda centrada** en su tarjeta, tanto en el
   escritorio como en el celular. Antes se pegaba a la izquierda.

---

## ↩️ Marcha atrás

No hay migración que deshacer, así que se vuelve con el código:

```bash
cd /srv/dinamyt && git checkout <commit-anterior> && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build && sudo systemctl restart dinamyt-id dinamyt-portal
cd /srv/membresias && git checkout <commit-anterior> && pnpm --filter @dinamyt/membresias-api build && pnpm --filter @dinamyt/membresias-web build && sudo systemctl restart membresias-api membresias-web
```

Las variables nuevas pueden quedarse: sin el código que las lee no hacen nada.

**Apagar solo el espejo, sin volver atrás:** comenta `ECOSYSTEM_SYNC_SECRET` en
`/srv/dinamyt/apps/ecosystem-api/.env` y reinicia `dinamyt-id`. El portal deja
de avisar y todo lo demás sigue igual — Membresías se queda con la copia que
tenga.

---

## Lo que esto NO arregla

- **Lo que ya está distinto a los dos lados.** El espejo copia al guardar, no al
  desplegar. La foto que hoy está solo en Membresías sigue solo ahí hasta que
  alguien la vuelva a guardar en el portal. Si hay que igualarlo en bloque, eso
  es una pasada de la reconciliación, no de esto.
- **El alta local en Membresías.** El maestro todavía puede crear una cuenta
  desde «Alumnos» en vez de darla de alta en el portal. Esa cuenta nace sin
  `eco_sub`, así que se edita allí como siempre — es la escapatoria para quien
  no está en DINAMYT, pero si se usa por costumbre vuelven las dos fichas.
- **Campeonatos.** Sigue con su login propio (bloques C1–C7 del plan maestro), y
  con su propia contraseña: no entra en el espejo hasta después del campeonato
  del 9–11 de octubre. Lo que hará falta está escrito en
  [CONTRASENA-UNICA.md](CONTRASENA-UNICA.md), §Campeonatos.
