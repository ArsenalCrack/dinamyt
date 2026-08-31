#!/usr/bin/env bash
#
# El ensayo del camino completo, con la base delante.
#
# ── Por qué existe ──
#
# El fallo del rol de agosto tenía CUATRO eslabones y cada uno tapaba al
# siguiente: el rol se perdía al traducirlo, el aviso no llegaba a quien ya
# tenía ficha, el aviso no encontraba la ficha sin enlazar, y la columna del
# rol por app mandaba sobre todo lo anterior. Ninguno de los cuatro se veía
# leyendo el código, y desde la pantalla los cuatro se veían igual: «le cambié
# el rol y no pasa nada».
#
# Se encontraron recorriendo el camino con una persona real y **mirando la
# base**, no la pantalla. Esto es eso, escrito, para poder repetirlo antes de
# cada temporada en vez de descubrirlo durante una.
#
# ── Cómo se usa ──
#
#   bash scripts/ensayo.sh estado
#   bash scripts/ensayo.sh persona alumno@correo.com
#   bash scripts/ensayo.sh federacion 'GHA Venezuela'
#
# Se corre con TU usuario, no con `postgres`: el guion llama a `sudo -u postgres
# psql` por dentro solo para las consultas. Al revés no funcionaría — `postgres`
# no puede leer los `.env` de las apps ni el journal de los servicios, que es la
# mitad de lo que hay que mirar.
#
# El guion de los siete pasos, con qué mirar en cada uno, está en §6.0 de
# OPERAR.md. Aquí está lo que responde cada pregunta.
#
# ── Solo lee ──
#
# Ni un UPDATE, ni un INSERT, ni un DELETE. Se puede correr en producción a
# media tarde sin pensarlo dos veces, y por eso se corre.
set -uo pipefail

BASE=${BASE:-dinamyt}
# Siendo ya `postgres` no se vuelve a pedir: el `sudo` de más pide contraseña en
# algunas máquinas y aquí solo estorba.
if [ "$(id -un)" = 'postgres' ]; then
  PSQL=(psql -d "$BASE" -P pager=off -X)
else
  PSQL=(sudo -u postgres psql -d "$BASE" -P pager=off -X)
fi

# El correo se compara siempre en minúsculas y sin espacios: es la clave con la
# que se cruza a una persona en las tres aplicaciones, y un espacio de más al
# pegarlo desde WhatsApp da «no existe» sobre alguien que sí está.
limpio() { echo "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]'; }

titulo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

uso() {
  cat <<'AYUDA'
Uso: bash scripts/ensayo.sh <paso> [argumento]

  estado                     Servicios, variables del espejo y contadores
  federacion <nombre>        Su estructura, sus clubes y quién la administra
  herencia   <correo>        Qué apps abre esa persona y de qué plan salen
  persona    <correo>        Su ficha cruzada en las tres apps
  rol        <correo>        Si el rol cuadra en las tres, y si no, dónde falla
  espejo                     Los avisos del espejo que NO se aplicaron
  sueltas                    Fichas de Membresías sin cuenta de DINAMYT
  resumen                    Todo lo anterior en números
AYUDA
}

# ── estado ─────────────────────────────────────────────────────────────────
paso_estado() {
  titulo 'Servicios'
  for s in dinamyt-id dinamyt-portal campeonatos-api campeonatos-web \
           membresias-api membresias-web; do
    printf '  %-20s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || echo '?')"
  done

  # El espejo entero cuelga de que estas dos variables valgan LO MISMO en las
  # dos APIs. Se compara el hash y no el valor: el valor no se enseña.
  titulo 'El secreto del espejo (tienen que coincidir)'
  for f in /srv/dinamyt/apps/ecosystem-api/.env /srv/membresias/apps/membresias-api/.env; do
    v=$(sudo grep -m1 '^ECOSYSTEM_SYNC_SECRET=' "$f" 2>/dev/null | cut -d= -f2-)
    printf '  %-52s %s\n' "$f" \
      "${v:+$(printf '%s' "$v" | sha256sum | cut -c1-12)}${v:-SIN PONER}"
  done

  titulo 'La puerta de entrada (401 = bien · 404 = falta el secreto)'
  printf '  POST /sync/alta  →  %s\n' \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST 127.0.0.1:3001/sync/alta \
       -H 'content-type: application/json' -d '{}' 2>/dev/null || echo 'sin respuesta')"

  paso_resumen
}

# ── federacion ─────────────────────────────────────────────────────────────
paso_federacion() {
  local nombre="$1"
  titulo "La estructura de «$nombre»"
  "${PSQL[@]}" -c "
    select f.name as federacion, f.type, c.name as club, c.city,
           (select count(*) from ecosystem.org_members m where m.org_id = c.id) as gente
      from ecosystem.organizations f
      left join ecosystem.organizations c on c.parent_id = f.id
     where f.name ilike '%$nombre%'
     order by c.name;"

  # Sin nadie con rol de mando, la federación no le sale a ningún usuario en
  # «Mi organización»: existe y no la ve nadie. Es el hueco que abría el panel.
  titulo 'Quién la administra'
  "${PSQL[@]}" -c "
    select u.email, m.role
      from ecosystem.org_members m
      join ecosystem.users u on u.id = m.user_id
      join ecosystem.organizations f on f.id = m.org_id
     where f.name ilike '%$nombre%'
     order by m.role, u.email;"

  titulo 'Lo que tiene contratado (y por tanto heredan sus clubes)'
  "${PSQL[@]}" -c "
    select o.name, p.name as plan, s.status, s.ends_at::date, p.apps_included
      from ecosystem.subscriptions s
      join ecosystem.subscription_plans p on p.id = s.plan_id
      join ecosystem.organizations o on o.id = s.org_id
     where o.name ilike '%$nombre%'
     order by s.ends_at desc;"
}

# ── herencia ───────────────────────────────────────────────────────────────
paso_herencia() {
  local correo; correo=$(limpio "$1")
  # La herencia BAJA: se parte de los clubes de la persona y se sube por
  # `parent_id` sumando lo que abre cada eslabón (§4.5). Esto reproduce ese
  # recorrido: si aquí no sale una app, en el pase tampoco va a salir.
  titulo "Qué abre $correo, y de dónde sale"
  "${PSQL[@]}" -c "
    with mios as (
      select m.org_id from ecosystem.org_members m
        join ecosystem.users u on u.id = m.user_id
       where u.email = '$correo'
    ), cadena as (
      select o.id, o.name, o.id as raiz_de from ecosystem.organizations o
        join mios on mios.org_id = o.id
      union all
      select p.id, p.name, c.raiz_de
        from cadena c join ecosystem.organizations o on o.id = c.id
        join ecosystem.organizations p on p.id = o.parent_id
    )
    select distinct oc.name as club_de_la_persona, c.name as eslabon,
           p.name as plan, s.status, s.ends_at::date, p.apps_included
      from cadena c
      join ecosystem.organizations oc on oc.id = c.raiz_de
      left join ecosystem.subscriptions s
        on s.org_id = c.id and s.status = 'ACTIVE' and s.ends_at > now()
      left join ecosystem.subscription_plans p on p.id = s.plan_id
     order by 1, 2;"

  echo '  ⏱️  Recuerda: esto es la base. El PASE dura 30 min, así que lo que'
  echo '      salga aquí se nota al renovarlo o al volver a entrar (§4.5).'
}

# ── persona ────────────────────────────────────────────────────────────────
paso_persona() {
  local correo; correo=$(limpio "$1")

  titulo "Su cuenta en DINAMYT"
  "${PSQL[@]}" -c "
    select id, email, full_name, is_super_admin,
           (password_hash is not null) as tiene_contrasena, origen,
           created_at::date as desde
      from ecosystem.users where email = '$correo';"

  # Los CUATRO roles, que es lo que hay que ver junto: el general y los tres de
  # app. Un `role_membresias` escrito manda sobre el general y hace que
  # cambiarlo desde el portal no sirva de nada (§4.7).
  titulo 'Sus clubes y sus cuatro roles'
  "${PSQL[@]}" -c "
    select o.name as organizacion, o.type, m.role as general,
           m.role_membresias, m.role_campeonatos, m.role_academy
      from ecosystem.org_members m
      join ecosystem.users u on u.id = m.user_id
      join ecosystem.organizations o on o.id = m.org_id
     where u.email = '$correo'
     order by o.name;"

  # `eco_sub` vacío = ficha invisible para los cuatro avisos del espejo. No le
  # llega la foto, ni el cinturón, ni la contraseña, ni el rol.
  titulo 'Su ficha en Membresías'
  "${PSQL[@]}" -c "
    select m.id, m.role, m.is_active, m.is_super_admin,
           (m.eco_sub is not null) as enlazada,
           (m.password_hash is not null) as contrasena_propia,
           o.name as club, (o.eco_org_id is not null) as club_enlazado
      from membresias.users m
      left join membresias.orgs o on o.id = m.org_id
     where m.email = '$correo';"

  titulo 'Su espejo en Campeonatos'
  "${PSQL[@]}" -c "
    select id, rol, club, (eco_sub is not null) as enlazado, es_superadmin
      from campeonatos.usuarios where email = '$correo';"
}

# ── rol ────────────────────────────────────────────────────────────────────
paso_rol() {
  local correo; correo=$(limpio "$1")
  # La traducción, escrita en SQL: es la misma tabla de `roles-por-app.ts`. Si
  # `esperado_membresias` y `en_membresias` no coinciden, el aviso no llegó —y
  # el log del espejo dice por qué (`ensayo.sh espejo`).
  titulo "¿Cuadra el rol de $correo en las tres?"
  "${PSQL[@]}" -c "
    select o.name as club,
           m.role as general,
           coalesce(m.role_membresias,
             case m.role when 'admin' then 'owner' when 'maestro' then 'owner'
                         when 'coach' then 'staff' when 'competitor' then 'student'
                         when 'member' then 'student' else m.role end) as esperado_membresias,
           mu.role as en_membresias,
           coalesce(m.role_campeonatos,
             case m.role when 'student' then 'competitor' else m.role end) as esperado_campeonatos,
           cu.rol as en_campeonatos,
           (m.role_membresias is not null or m.role_campeonatos is not null
            or m.role_academy is not null) as tiene_roles_de_app_escritos
      from ecosystem.org_members m
      join ecosystem.users u on u.id = m.user_id
      join ecosystem.organizations o on o.id = m.org_id
      left join membresias.users mu on mu.eco_sub = u.id
      -- Los dos a texto: `campeonatos.usuarios.eco_sub` es `uuid` en
      -- PostgreSQL y `varchar` en SQLite (§4.13), y comparar `uuid` con
      -- texto a secas no es que dé distinto: PostgreSQL se niega con
      -- «operator does not exist: uuid = text» y se lleva la consulta.
      left join campeonatos.usuarios cu on cu.eco_sub::text = u.id::text
     where u.email = '$correo';"

  cat <<'NOTA'
  Cómo leerlo:
   · esperado_membresias ≠ en_membresias  → el aviso no llegó. Mira `espejo`.
   · tiene_roles_de_app_escritos = t      → esa columna MANDA sobre el general
                                            (§4.7). Cambiar el rol la vacía.
   · en_campeonatos distinto              → normal: allí manda el rol local a
                                            partir de la primera entrada.
NOTA
}

# ── espejo ─────────────────────────────────────────────────────────────────
paso_espejo() {
  titulo 'Avisos del espejo que NO se aplicaron (últimas 24 h)'
  # Hasta el 30 de agosto esto no existía: Membresías contestaba 200 sin haber
  # hecho nada y el log quedaba limpio. Un aviso que no se aplica tiene que
  # dejar rastro, o se depura mirando la base a mano.
  sudo journalctl -u dinamyt-id --since '24 hours ago' --no-pager 2>/dev/null \
    | grep -i 'EspejoMembresias' | tail -40
  echo
  echo '  Ninguna línea = todos los avisos se aplicaron.'
}

# ── sueltas ────────────────────────────────────────────────────────────────
paso_sueltas() {
  titulo 'Fichas de Membresías sin enlazar con DINAMYT'
  # Las que tienen cuenta se curan solas: al entrar por SSO o al cambiarles el
  # rol se atan. Las que NO tienen cuenta hay que invitarlas — nadie las va a
  # enlazar por su cuenta.
  "${PSQL[@]}" -c "
    select m.email, m.full_name, m.role,
           (e.id is not null) as tiene_cuenta_en_dinamyt,
           case when e.id is not null then 'se ata sola al entrar o al cambiarle el rol'
                else 'hay que invitarla al portal' end as que_hacer
      from membresias.users m
      left join ecosystem.users e on e.email = m.email
     where m.eco_sub is null and m.is_super_admin = false
     order by tiene_cuenta_en_dinamyt, m.email;"
}

# ── resumen ────────────────────────────────────────────────────────────────
paso_resumen() {
  titulo 'Los números'
  "${PSQL[@]}" -c "
    select
      (select count(*) from ecosystem.users)                        as cuentas,
      (select count(*) from ecosystem.organizations)                as organizaciones,
      (select count(*) from ecosystem.organizations where parent_id is not null) as afiliadas,
      (select count(*) from ecosystem.subscriptions
        where status = 'ACTIVE' and ends_at > now())                as suscripciones_vivas,
      (select count(*) from membresias.users where is_super_admin = false) as fichas,
      (select count(*) from membresias.users
        where eco_sub is null and is_super_admin = false)           as fichas_sueltas,
      (select count(*) from ecosystem.org_members
        where role_membresias is not null
           or role_campeonatos is not null
           or role_academy is not null)                             as con_rol_de_app_escrito,
      (select count(*) from campeonatos.usuarios where eco_sub is null) as campeonatos_sueltos;"

  cat <<'NOTA'
  · fichas_sueltas          → `ensayo.sh sueltas` dice cuáles y qué hacer.
  · con_rol_de_app_escrito  → en esas personas, el rol del portal NO decide
                              nada hasta que alguien se lo cambie (§4.7).
NOTA
}

# ── ─────────────────────────────────────────────────────────────────────────
paso=${1:-}
case "$paso" in
  estado)     paso_estado ;;
  federacion) [ $# -ge 2 ] || { echo 'Falta el nombre de la federación.'; exit 2; }
              paso_federacion "$2" ;;
  herencia)   [ $# -ge 2 ] || { echo 'Falta el correo.'; exit 2; }
              paso_herencia "$2" ;;
  persona)    [ $# -ge 2 ] || { echo 'Falta el correo.'; exit 2; }
              paso_persona "$2" ;;
  rol)        [ $# -ge 2 ] || { echo 'Falta el correo.'; exit 2; }
              paso_rol "$2" ;;
  espejo)     paso_espejo ;;
  sueltas)    paso_sueltas ;;
  resumen)    paso_resumen ;;
  *)          uso; exit 2 ;;
esac
