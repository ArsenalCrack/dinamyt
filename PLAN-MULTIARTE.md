# Varias artes marciales · el plan

> **Archivo de trabajo, no documentación** (como `auditoria/ESTADO.md`). Dice
> qué falta para que DINAMYT deje de ser solo de hapkido, en qué orden, qué
> decidió el dueño y qué falta preguntarle. Es la tarea 1 de
> `HOJA-DE-RUTA.md`. Al cerrar una fase se borra su parte; al terminar todo,
> se borra el archivo y lo que deje como regla pasa a `OPERAR.md`.
>
> **Regla de este plan: no se inventa nada del deporte.** Ni una lista de
> cinturones ni un punto de reglamento sale de memoria: sale de lo que diga
> el dueño o del documento oficial que él entregue. Lo que no se sabe va a
> «Preguntas abiertas».

## Siguiente paso

1. **El dueño entrega P2 y P3**: qué federación manda en cada arte de la
   primera tanda y su lista oficial de cinturones. Con eso se escriben la
   migración del catálogo y sus plantillas. P5b (clases y planes por arte)
   hace falta antes de la fase 2.
2. Mientras tanto, desplegar el portal (`OPERAR.md` §2.3): la portada
   multiarte está en `main` desde el 31 oct.

## Lo que decidió el dueño (31 oct 2026)

- **El orden:** portada, Membresías, Campeonatos; Academy, al encenderse.
- **La primera tanda de artes**, además de hapkido: taekwondo, kickboxing,
  karate y judo (P1). En Campeonatos, taekwondo va primero.
- **Las listas de cinturones, en tres capas** (P4): plantilla de DINAMYT,
  lista de la federación, copia propia del club. Detalle en la fase 1.
- **Un alumno puede entrenar varias artes en el mismo club**, con un cinturón
  en cada una (P5).
- **Todos los clubes de hoy son de hapkido GHA** (P6): la migración los deja
  en hapkido con la lista GHA y nadie nota el cambio.
- **La portada no se reescribe por arte** (P11): la frase de entrada dice
  «artes marciales» y no nombra ninguna. Las artes, y cuáles tienen
  reglamento de competencia, salen de `apps/ecosystem-portal/src/lib/artes.ts`
  (la fila «Para tu arte» y la nota de la pestaña de Campeonatos).

## Las fases

| Fase | Qué | Estado |
|---|---|---|
| 0 | La portada habla de artes marciales, no solo de hapkido | En `main` (31 oct); falta desplegar el portal |
| 1 | El catálogo: artes y listas de cinturones, en el ecosistema | Decidido el modelo; esperando P2 y P3 |
| 2 | Membresías: el club elige sus artes y sus cinturones | Después de la 1 |
| 3 | Campeonatos: el campeonato elige arte, reglamento y modalidades | Después de la 2; es la más grande |
| 4 | Academy lee el mismo catálogo | Antes de encenderla (tarea 7 de la hoja) |

## Dónde estamos (31 oct 2026)

Lo que hoy es solo de hapkido, pieza por pieza:

| Pieza | Hoy | Dónde |
|---|---|---|
| Portada del portal | Multiarte en `main`: la frase dice «artes marciales»; la fila «Para tu arte» enseña las cinco de la primera tanda y la pestaña de Campeonatos dice «Reglamentos de competencia: hapkido» | `apps/ecosystem-portal/src/lib/artes.ts`, `app/page.tsx` |
| Perfil y ficha del miembro, en el portal | El cinturón se elige de los 11 de hapkido y la disciplina se guarda como `hapkido` | `lib/validacion.ts` (`CINTURONES_GRADO`), `perfil/page.tsx:284`, `mi-organizacion/miembro/[id]/page.tsx:214` |
| Ecosistema (la base) | `user_disciplines` **ya admite varias artes por persona** (`discipline` + `current_grade`, texto libre). El club no tiene arte. Las organizaciones ya cuelgan unas de otras (`type` FEDERATION, LEAGUE, CLUB, ACADEMY y `parent_id`) | `apps/ecosystem-api/src/db/schema/index.ts` |
| Membresías | Los 11 cinturones de hapkido, en dos constantes (API y web); `users.belt` es una sola columna; el club no tiene arte. El pie dice «DINAMYT Membresías · Hapkido» | `lib/cinturones.ts` (las dos), `packages/membresias-db/src/schema/identidad.ts:105`, `components/PieLegal.tsx:63` |
| Campeonatos | El reglamento de hapkido, mitad en datos (`seed_categorias.py`: puntos, faltas, rondas, jueces) y mitad en código (`combate_engine.py` repite los topes de faltas; `sockets/combate_ns.py`). Los cinturones de hapkido se convierten en 5 grupos de competencia (BLANCO, PRINCIPIANTE, INTERMEDIO, AVANZADO, NEGRO) | `dinamyt-combat`: `backend/app/models/competidor.py:20-43`, `backend/app/engine/`, `frontend/src/lib/api.ts:1030` |
| Textos de Campeonatos que dicen hapkido | Descripción, manifiesto, pie, pantalla del juez y encabezado de reportes («Global Hapkido Association»). Hoy son verdad: cambian en la fase 3 | `frontend/src/app/layout.tsx:58`, `public/manifest.webmanifest`, `components/PieDePagina.tsx:65`, `app/juez/page.tsx:166`, `backend/app/api/reportes.py:906` |
| Academy | **Ya es multiarte en su base**: `martial_arts` (con federación), `grades` (orden y `group_name`, el mismo grupo de Campeonatos) y `teacher_martial_arts` | `packages/academy-db/src/schema/artes.ts` |

## Fase 1 · El catálogo de artes y cinturones

### Quién define la lista de cinturones

El dueño lo planteó así: cada arte cambia los colores, el orden y la cantidad,
y a veces cambia **dentro** de la misma arte según la asociación; pero no
quiere que cada maestro escriba la lista a mano si es la misma de su
asociación.

**Decidido (P4): tres capas, y gana la más cercana al club.**

1. **Plantillas de DINAMYT**, una o varias por arte («Hapkido · GHA»,
   «Taekwondo · …», «Kickboxing · …»), listas para elegir en un clic. Las
   mantiene el super admin.
2. **La lista de su federación o asociación.** Si el club cuelga de una
   federación o liga dentro de DINAMYT (`parent_id`), esa organización publica
   su lista una vez y sus clubes la usan sin tocar nada. Si la federación la
   cambia, les cambia a todos.
3. **La copia propia del club**, solo cuando la suya es distinta: el maestro
   copia una lista y la ajusta (orden, colores, grados de más o de menos). La
   copia es del club y no cambia si cambia el original.

Un club usa **una sola lista por arte**. Y el cinturón de una persona se guarda
como era el día que se le dio (nombre y orden), como ya hace Campeonatos al
inscribir: editar una lista nunca reescribe el historial.

**Cada grado de una lista lleva:** orden, nombre (como lo dice esa arte:
«Amarillo», «8.º kup»…), color, segundo color para los mixtos
(«Naranja/Verde»), si es de color o negro (kup/kyu frente a dan/poom), y **su
grupo de competencia** (los 5 de Campeonatos), que es lo que deja armar
categorías con cualquier arte.

**Dónde vive: en el ecosistema**, como el cinturón de la persona, que ya está
allí (`user_disciplines`, decisión del 21 ago 2026: el ecosistema es la fuente
de verdad de la persona). Tablas nuevas, nombres por decidir al escribir la
migración: artes, listas de grados (con su dueño: DINAMYT, una federación o un
club), los grados de cada lista, y qué lista usa cada club en cada arte.
`user_disciplines` pasa a apuntar al grado del catálogo.

- **Membresías** recibe la copia por `/sync/club` (el aviso HTTP que ya lleva
  los datos del club) y la persona por `/sync/persona`. **Sola, sin
  ecosistema**, trae las plantillas dentro y el maestro elige allí.
- **Campeonatos** toma el grupo de competencia del grado, en vez de su tabla de
  hapkido.
- **Academy** lee el catálogo en vez de tener el suyo (fase 4).
- **La portada** también: `lib/artes.ts` del portal deja de ser una lista
  escrita a mano y lee las artes del catálogo.

**Descartado:** lo que decía la hoja de ruta (§8.3, hasta el 31 oct): el arte
como texto libre y los grados por club, solo en Membresías. Cada maestro de
la misma asociación escribiría la misma lista, y Campeonatos y Academy no la
entenderían.

**Hecho cuando:** existen las tablas y las plantillas que el dueño entregue,
el super admin las edita desde `/admin`, y una federación puede publicar la
suya.

## Fase 2 · Membresías

- **Al entrar el maestro dueño de un club sin artes:** «¿Qué artes enseña tu
  club?» (una o varias), y por cada una, su lista de cinturones (la de su
  federación, una plantilla o una copia propia). Igual al fundar el club en el
  portal (`/mi-organizacion`), que es donde nace el club cuando hay
  ecosistema. En Membresías sola, el club lo crea el super admin
  (`POST /orgs`) y el paso sale al primer ingreso del maestro.
- **Los clubes que ya existen** pasan a hapkido con la lista GHA en la
  migración, para que nadie note nada (P6: todos son de hapkido GHA).
- **La ficha del alumno:** en qué arte o artes entrena y su cinturón en cada
  una (P5). `users.belt` pasa a una tabla por arte; `lib/cinturones.ts` (API y
  web) deja de ser una constante y pasa a ser la lista del club.
- **Un club puede no usar cinturones** (lo traía la hoja de ruta): sin lista,
  el campo desaparece de la ficha y del carnet.
- **El carnet, los filtros y las estadísticas** con el cinturón de cada arte.
- **En el portal**, el perfil y la ficha del miembro eligen el cinturón de la
  lista del club, no de `CINTURONES_GRADO`.
- El pie («DINAMYT Membresías · Hapkido») y los textos, en el mismo cambio.

**Hecho cuando:** un club de taekwondo nace, elige su lista, da de alta un
alumno con un cinturón de taekwondo y el carnet lo imprime bien; y un club de
hapkido que ya existía no nota ninguna diferencia.

## Fase 3 · Campeonatos

**Al crear el campeonato se elige el arte, el reglamento y las modalidades**
(el «modo»), y no cambian después: los combates ya puntuados dejarían de
cuadrar. Hoy ya existen en datos las modalidades (la columna
`config_categorias` del campeonato: `{"modalidades": […]}`) y la puntuación de
cada categoría (`config_puntuacion`, en `categorias`); lo que falta es que el
reglamento entero sea un paquete elegible.

**Un paquete de reglamento declara**, en datos siempre que se pueda: sus
modalidades; por cada una, el área (tatami o ring), cuántos jueces y con qué
papel, rondas y duración, qué acciones dan puntos y cuántos, las faltas y qué
provocan (restar, dar puntos al rival, descalificar), cuándo se acaba antes
(diferencia, KO), cómo se desempata, cómo se suman los jueces, las categorías
(edad, peso, grupo de cinturón, género), el tipo de llave y los textos de los
impresos.

**El orden, sin saltos:**

1. Cubrir con pruebas el motor de hoy (`combate_engine.py`, 782 líneas;
   `sockets/combate_ns.py`, 1.830; `secciones_engine.py`, 236;
   `figuras_engine.py`, 573).
2. **Sacar «hapkido» como el primer paquete sin cambiar ni un comportamiento.**
   La prueba de que salió bien: un campeonato viejo, recalculado con el
   paquete, da exactamente los mismos resultados.
3. Taekwondo, con el reglamento que entregue el dueño (P8, P10).
4. Kickboxing (P9, P10).
5. Karate y judo, con sus reglamentos (P10); el orden entre los dos, por
   decidir.

Ojo: Hong, Chung, KyongGo y GamJeum son vocabulario común de hapkido y
taekwondo, pero eso no hace iguales los reglamentos. Nada de taekwondo se da
por igual al hapkido sin leer su reglamento.

Los textos que hoy dicen «Hapkido» o «Global Hapkido Association» pasan a
salir del arte y del organizador de cada campeonato. **Al estrenar un
reglamento**, se marca `campeonatos: true` en su línea de
`apps/ecosystem-portal/src/lib/artes.ts` (o en el catálogo, si ya existe): la
nota de la portada cambia sola.

**Hecho cuando:** un campeonato de taekwondo se crea, se puntúa en vivo y se
imprime con su reglamento, y los campeonatos de hapkido dan lo mismo que antes.

## Fase 4 · Academy

Ya guarda artes y grados por su cuenta. Antes de encenderla (tarea 7 de la
hoja de ruta), que lea el catálogo del ecosistema en vez del suyo, para que el
cinturón de un alumno sea el mismo en las cuatro webs.

## Preguntas abiertas

Al responderse, la respuesta pasa a «Lo que decidió el dueño» y la pregunta
se borra de aquí.

**Para la fase 1 (catálogo) y la 2 (Membresías):**

- **P2.** Por cada arte de la primera tanda (hapkido, taekwondo, kickboxing,
  karate, judo), qué federación o asociación manda en Colombia, y si hay más
  de una (taekwondo WT o ITF; karate, ¿qué estilo?; hapkido, ¿solo GHA?).
- **P3.** La lista oficial de cinturones de cada una: orden, colores, nombre
  de cada grado, si llevan puntas o rayas, cuántos dan. ¿Hay documento?
- **P5b.** ¿Las clases y los planes de pago se separan por arte, o un plan
  sirve para todas las artes del club?

**Para la fase 3 (Campeonatos):**

- **P7.** ¿Un campeonato es de una sola arte, o hay eventos con varias?
- **P8.** Taekwondo: ¿combate (kyorugi) y formas (poomsae)? ¿Se puntúa con
  jueces desde el celular, como hoy, o con petos electrónicos?
- **P9.** Kickboxing: ¿qué modalidades (tatami: point fighting, light contact,
  kick light; ring: full contact, low kick, K1; formas musicales)?
- **P10.** Los reglamentos que se usan en Colombia para cada arte, en PDF.
