-- ── El tema y el idioma, elegidos por la persona y no por la app ────────────
--
-- ── El problema ──
--
-- Las cuatro webs del ecosistema viven en subdominios distintos —`dinamyt.org`,
-- `club.dinamyt.org`, `campeonatos.dinamyt.org`, `academy.dinamyt.org`— y
-- `localStorage` es **por origen**. Membresías y Campeonatos ya tenían modo
-- claro, cada una guardando la elección en su propio navegador y con su propia
-- clave (`membresias_theme`, `dinamyt_theme`).
--
-- O sea que quien prefiere el modo claro tenía que pedirlo CUATRO veces, una
-- por app, y volver a pedirlo en cada dispositivo. Eso es justo lo contrario de
-- §4.9 («que las tres apps se sientan una sola»): la misma persona, la misma
-- cuenta, y cuatro respuestas distintas a la misma pregunta.
--
-- ── Lo que hacen estas columnas ──
--
-- `users.theme` es la preferencia, y vale tres cosas:
--
--   · 'sistema' — lo que diga el dispositivo (`prefers-color-scheme`). Es el
--     valor por defecto, y es el que tiene todo el mundo hoy: nadie ve su
--     pantalla cambiar por culpa de esta migración.
--   · 'claro' / 'oscuro' — lo eligió a mano, y manda sobre el dispositivo.
--
-- `sistema` hace de «no consta» sin necesitar una bandera aparte, que es la
-- diferencia con la zona horaria: allí el valor detectado y el elegido son del
-- mismo tipo, así que hizo falta `timezone_manual` para distinguirlos.
--
-- Con el idioma pasa lo mismo que con la zona, así que lleva la misma solución:
-- `users.locale` YA EXISTE y ya se llena solo —el navegador manda `X-Idioma` en
-- cada login y renovación (§4.12)—, y esa detección automática pisaría la
-- elección de quien entró a su perfil y puso otra cosa a propósito. De ahí
-- `locale_manual`, gemela de `timezone_manual`: lo automático solo escribe
-- cuando nadie ha dicho nada.
--
-- ── Lo que NO hace ──
--
-- No traduce nada ni cambia ningún color. Solo da dónde guardar la respuesta.
-- El navegador sigue teniendo su copia local, y hace falta: es lo que permite
-- pintar el tema bueno ANTES de saber quién eres, sin el fogonazo oscuro. La
-- copia es para pintar rápido; esta columna es la verdad.

ALTER TABLE "ecosystem"."users"
  ADD COLUMN IF NOT EXISTS "theme" varchar(10) DEFAULT 'sistema' NOT NULL;
--> statement-breakpoint

ALTER TABLE "ecosystem"."users"
  ADD COLUMN IF NOT EXISTS "locale_manual" boolean DEFAULT false;
--> statement-breakpoint

-- Que no entre por la puerta de atrás un valor que ninguna pantalla sabe
-- pintar: sin esto, un PATCH con `theme: "azul"` se guardaría y la app se
-- quedaría en oscuro sin decir por qué.
ALTER TABLE "ecosystem"."users"
  DROP CONSTRAINT IF EXISTS "users_theme_valido";
--> statement-breakpoint
ALTER TABLE "ecosystem"."users"
  ADD CONSTRAINT "users_theme_valido"
  CHECK ("theme" IN ('sistema', 'claro', 'oscuro'));
