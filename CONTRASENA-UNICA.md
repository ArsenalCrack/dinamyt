# Una contraseña para todo DINAMYT

**La regla, en una línea:** la contraseña de una persona se fija en el
**ecosistema** (el portal), y las apps la **copian**. Nunca al revés, y nunca en
dos sitios a la vez.

---

## El problema que cierra

La reconciliación de identidades trajo las cuentas de Membresías al portal **con
su hash puesto**, así que desde el primer día la misma contraseña abría las dos
apps. Y funcionó exactamente un día: en cuanto alguien la cambiaba en el portal
—o la recuperaba con «¿Olvidaste tu contraseña?»—, en `club.dinamyt.org` seguía
valiendo la **vieja**.

Dos contraseñas para una sola cuenta, y ninguna pantalla que lo dijera. Lo único
que veía el alumno era que en su club no entraba.

---

## Cómo funciona ahora

```
        alguien cambia su contraseña
                    │
        ecosystem-api (users.password_hash)
                    │  POST /sync/contrasena  ·  x-dinamyt-sync
                    ▼
        membresias-api  (users.password_hash, por eco_sub)
```

**Viaja el hash de bcrypt, nunca la contraseña.** No hace falta: bcrypt guarda
su propio costo dentro del hash, así que `compare` acepta igual el de 12 rondas
del ecosistema y el de 10 de Membresías. Mandar la contraseña en claro pondría
una copia legible en la memoria y en los registros de un segundo servidor a
cambio de nada.

**Se dispara sin esperarlo y no puede romper nada.** Si Membresías está caída, la
contraseña se cambia igual en el portal y allí queda la vieja hasta el próximo
cambio — el mismo trato que el resto del espejo (foto, cinturón, escudo).

### Los cuatro sitios desde los que sale la copia

| Dónde | Cuándo |
|---|---|
| `POST /auth/change-password` | La persona la cambia desde su perfil del portal |
| `POST /auth/reset-password` | La recupera con el código del correo |
| `POST /auth/set-password` | La pone desde el enlace de invitación del maestro |
| `verify-email` | Nace la cuenta (por si su ficha de Membresías ya existía) |

**El único que NO copia** es el rehash tras un login correcto con una contraseña
heredada: ahí la contraseña **no cambió**, solo se guardó con otro costo, y la
copia de Membresías sigue siendo un hash válido de esa misma contraseña. Es lo
que hace el parámetro `{ espejar: false }` en `UsersService.updatePassword`.

### Y la puerta de atrás, cerrada

Copiar en un sentido solo sirve si no se puede escribir en el otro. En Membresías,
para las fichas **con** `eco_sub`:

| Ruta | Antes | Ahora |
|---|---|---|
| `POST /auth/change-password` | Cambiaba la local | 400 → «tu contraseña vive en DINAMYT» |
| `POST /users/:id/password` (el maestro) | Escribía una nueva | 409 → «que la recupere en el portal; para entrar ahora, QR» |
| `POST /orgs/usuarios/:id/password` (el superadmin) | Igual | 409, lo mismo |

Y las pantallas dejan de ofrecer lo que el servidor rechaza: en la ficha del
alumno y en «Mi perfil», el formulario de contraseña se sustituye por el aviso
con el enlace al portal.

---

## Lo que NO cambia (a propósito)

- **La ficha sin cuenta del ecosistema.** El alumno sin correo, que entra con
  carnet QR o PIN, no tiene `eco_sub`: su contraseña la pone y la cambia su
  maestro, en Membresías, exactamente igual que siempre. Es el caso para el que
  se hizo esa ruta y sigue intacto.
- **Membresías como producto independiente.** Sin `ECOSYSTEM_JWKS_URL` no hay
  ecosistema: `ssoHabilitado()` es falso, no hay portal al que mandar a nadie y
  todo se cambia allí como toda la vida.
- **El acceso por QR.** Sigue siendo la respuesta para el alumno que está en la
  puerta y no puede entrar. Ahora más que antes: es lo que el maestro usa en vez
  de escribirle una contraseña.

---

## Qué hay que configurar

**Nada nuevo.** Usa el mismo canal que ya lleva la foto y el escudo:

```bash
# ecosystem-api
MEMBRESIAS_SYNC_URL=https://membresias-api.dinamyt.org
ECOSYSTEM_SYNC_SECRET=<el mismo valor en las dos>

# membresias-api
ECOSYSTEM_SYNC_SECRET=<el mismo valor en las dos>
```

Si el espejo de la foto ya funciona, esto funciona. Con las variables vacías no
se avisa a nadie y **no pasa nada**: es el caso de un ecosistema sin Membresías
al lado.

> **Ojo con el despliegue:** el código de Membresías vive en el repositorio
> `dinamyt-membresias`. La copia de `productos/membresias/` de este monorepo es
> un espejo por subtree y va por detrás.

---

## El hueco que queda, y por qué se puede vivir con él

Quien se registra en el portal, entra a Membresías por SSO (su ficha nace ahí
con `password_hash` vacío) y **nunca cambia ni recupera su contraseña**, no puede
entrar a `club.dinamyt.org` escribiendo su contraseña: tiene que usar el botón de
DINAMYT. La pantalla se lo dice con esas palabras.

Se cura solo la primera vez que cambie o recupere la contraseña. Si algún día
molesta, la solución es copiar el hash también al aprovisionar la ficha —una
consulta más del lado de Membresías— y no una llamada HTTP por cada login.

---

## Campeonatos — **en espera hasta después del campeonato**

Campeonatos **no** entra en esto todavía, y es deliberado: el campeonato es el
**9, 10 y 11 de octubre**, y la regla de la casa es no tocar nada entre el **1 y
el 13**.

Lo que hará falta cuando se retome, que es más que en Membresías:

1. **Una columna de enlace.** `usuarios` no tiene nada parecido a `eco_sub`: hoy
   la única forma de cruzar una cuenta con la del portal es el **correo**, que es
   justo lo que puede cambiar. Hay que añadir la columna y una pasada de
   reconciliación que la rellene.
2. **La ruta del espejo, en Flask.** El backend es Python (`app/models/usuario.py`,
   bcrypt con `BCRYPT_ROUNDS`), así que no se reaprovecha nada del código de
   Membresías — solo el diseño: mismo secreto compartido, mismo `POST` con el
   hash, misma comprobación de forma.
3. **`CAMPEONATOS_SYNC_URL` + el secreto** en `ecosystem-api`, y `espejarContrasena`
   pasando por los dos destinos.
4. **Cerrar la puerta de atrás:** hoy un administrador le escribe la contraseña a
   un juez desde el panel. Con enlace al ecosistema, esa acción tiene que
   redirigir al portal igual que en Membresías.
5. **El modo local del campeonato.** Campeonatos tiene que arrancar sin internet
   y sin ecosistema el día del evento: la copia no puede ser un requisito para
   iniciar sesión, solo un aviso más que se pierde si no hay red.

Mientras tanto, quien tenga cuenta en Campeonatos y en DINAMYT sigue con **dos
contraseñas independientes**, como hasta ahora. Que no es lo que queremos, pero
es lo que ya había — y no es algo que convenga estrenar en octubre.
