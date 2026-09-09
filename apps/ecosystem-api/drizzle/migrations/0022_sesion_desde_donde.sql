-- ── Desde dónde está abierta una sesión ────────────────────────────────────
--
-- ── El problema ──
--
-- «Dispositivos conectados» enseñaba dos cosas de cada sesión: el navegador
-- («Chrome en Windows») y la IP. Con eso, una lista de seis filas del mismo
-- navegador y la misma IP no dice NADA: no hay forma de distinguir cuál es el
-- computador del club y cuál el de casa, ni de decidir cuál cerrar. Se reportó
-- exactamente así — «muchas sesiones que vienen de la misma IP».
--
-- Y una IP tampoco es una respuesta para quien la lee: `181.49.x.x` no es un
-- sitio. Lo que la persona quiere saber es «esto está abierto en Bogotá», que
-- es lo que le permite reconocer —o no reconocer— la fila.
--
-- ── Lo que guardan estas columnas ──
--
-- `zona` es la zona horaria IANA que el navegador manda en cada petición
-- (`X-Zona`, la misma cabecera que ya decide a qué hora se escriben los
-- correos, §4.12). De ella sale la CIUDAD: `America/Bogota` → Bogotá. No es
-- geolocalización: es lo que el propio navegador declara, y por eso no hace
-- falta preguntarle a ningún servicio de terceros ni mandarle la IP de nadie.
--
-- `pais` son las dos letras ISO que pone Cloudflare en `CF-IPCountry`. Es
-- gratis, exacto y ya viaja en la petición cuando el sitio está detrás de
-- Cloudflare. Sin Cloudflare se queda `NULL` y la fila enseña solo la ciudad,
-- que es la mitad que importa.
--
-- ── Por qué no se rellena el pasado ──
--
-- Porque no se puede: la zona y el país de una sesión abierta la semana pasada
-- no están escritos en ninguna parte. Las sesiones viejas se quedan con `NULL`
-- y la pantalla enseña lo de siempre (navegador e IP). En cuanto alguien vuelva
-- a entrar, su sesión nueva ya trae los dos datos.
--
-- ── Lo que NO hace ──
--
-- No cambia quién puede entrar ni cuánto dura nada. Son dos columnas que se
-- leen; ningún guard las mira.

ALTER TABLE "ecosystem"."sessions"
  ADD COLUMN IF NOT EXISTS "zona" varchar(64);
--> statement-breakpoint

ALTER TABLE "ecosystem"."sessions"
  ADD COLUMN IF NOT EXISTS "pais" varchar(2);
