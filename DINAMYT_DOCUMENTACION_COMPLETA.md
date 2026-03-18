# DINAMYT — Documentación Técnica Completa
> **Versión:** 2.0 — 17 de Marzo de 2026
> **INSTRUCCIÓN PARA LA IA QUE LEA ESTE ARCHIVO:**
> Lee este documento completo antes de escribir cualquier línea de código. Es la fuente de verdad absoluta del proyecto. El principio rector de toda modificación es: **romper el menor código posible mientras se hace la aplicación más robusta y preparada para producción real.**

---

## ÍNDICE
1. [Identidad y propósito](#1-identidad-y-propósito)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura de directorios](#3-estructura-de-directorios)
4. [Dominio del negocio — Reglas de Hapkido](#4-dominio-del-negocio)
5. [Base de datos — Esquema normalizado](#5-base-de-datos)
6. [Módulos implementados](#6-módulos-implementados)
7. [Módulos pendientes](#7-módulos-pendientes)
8. [Plan de implementación por fases](#8-plan-de-implementación-por-fases)
9. [Decisiones de arquitectura](#9-decisiones-de-arquitectura)
10. [Deudas técnicas](#10-deudas-técnicas)
11. [Cómo ejecutar el proyecto](#11-cómo-ejecutar-el-proyecto)

---

## 1. IDENTIDAD Y PROPÓSITO

| Campo | Valor |
|---|---|
| **Nombre** | DINAMYT |
| **Tipo** | Plataforma web fullstack orientada a servicios (SOA/REST) |
| **Alcance** | **producción real** |
| **Problema que resuelve** | Los competidores de hapkido NO conocen sus puntuaciones durante la competencia y esperan todo el día para saber si ganaron. DINAMYT da visibilidad en tiempo real a competidores, entrenadores y público. |
| **Autores** | Amir (desarrollador principal) + Andrés Iván González Guerrero (desarrollador) + Braqner Duvan Alvarado (desarrollador) |
| **Estado** | En desarrollo activo. Frontend Angular muy avanzado. Backend Spring Boot funcional en módulos base. Live Tournament sin backend real. |

### Flujo completo del sistema
```
Creación del Campeonato (BORRADOR)
        ↓
Configuración de modalidades, categorías y tatamis
        ↓
Publicación (BORRADOR → LISTO)          ← endpoint pendiente
        ↓
Inscripciones / Invitaciones
        ↓
Panel del Organizador (aprobación)
        ↓
Live Tournament — Tatamis + Secciones   ← backend pendiente
        ↓
Panel de Jueces — Puntuación en tiempo real (Supabase Realtime)
        ↓
Resultados visibles para todos en tiempo real
```

---

## 2. STACK TECNOLÓGICO

### 2.1 Stack actual (en desarrollo)

| Capa | Tecnología |
|---|---|
| **Frontend** | Angular 17 (Standalone Components) + TypeScript |
| **Estilos** | CSS/SCSS + Bootstrap 5.3 |
| **Tipografía** | Google Fonts via `@fontsource` (Montserrat, Roboto) |
| **Iconos** | FontAwesome v7 |
| **Fechas UI** | Flatpickr |
| **Geolocalización** | country-state-city |
| **Reactividad** | RxJS (Observables, BehaviorSubject) |
| **Backend** | Java Spring Boot 3.x |
| **API** | REST (JSON) via Spring WebMVC |
| **ORM** | Spring Data JPA + Jakarta Persistence |
| **Build** | Apache Maven (pom.xml) |
| **Servidor** | Spring Boot Embedded Tomcat — puerto 8080 |
| **Base de datos actual** | MySQL (a migrar) |
| **URL API** | `http://localhost:8080/api` (hardcodeada — cambiar al hacer deploy) |

### 2.2 Stack objetivo (producción)

| Capa | Tecnología | Justificación |
|---|---|---|
| **Base de datos** | **PostgreSQL via Supabase** | Motor robusto, JSONB nativo, concurrencia superior, gestión en la nube |
| **Tiempo real** | **Supabase Realtime** | Escala automáticamente, maneja reconexiones, latencia baja, sin servidor WebSocket propio. Cuando un juez inserta una puntuación en PostgreSQL, Supabase la transmite a TODOS los clientes suscritos automáticamente. Plan gratuito aguanta un campeonato real. |
| **Cliente Supabase** | **`@supabase/supabase-js`** | SDK oficial para Angular — suscripción a cambios en BD en ~10 líneas |
| **Migraciones BD** | **Flyway** | Control de versiones del esquema, reproducible en cualquier entorno |
| **Gestión visual BD** | **pgAdmin 4** o **Supabase Studio** | Supabase Studio viene integrado y es más cómodo para este proyecto |
| **Seguridad** | **Spring Security + JWT (JJWT 0.12.x)** | Tokens reales por request |
| **Contraseñas** | **BCrypt** (via Spring Security) | Reemplaza texto plano — **crítico** |
| **Utilidades backend** | **Lombok** (completar integración) | Reducir boilerplate en entidades |

> ⚠️ **POR QUÉ SUPABASE REALTIME Y NO WEBSOCKETS CON SPRING:**
> WebSockets con Spring requiere gestionar conexiones persistentes en el servidor, escalar manualmente, y programar reconexión en el cliente. Para un campeonato con 200+ personas viendo puntuaciones desde sus teléfonos, eso se complica. Supabase Realtime resuelve todo eso fuera de la caja: usa el mecanismo de `LISTEN/NOTIFY` de PostgreSQL, escala solo, y el cliente Angular se suscribe a cambios en tablas específicas sin que el backend haga nada extra. Es más simple Y más robusto para producción.

### 2.3 Dependencias Maven a añadir (pom.xml)

```xml
<!-- FASE 1: PostgreSQL + Flyway -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>

<!-- FASE 3: Spring Security + JWT + BCrypt -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.12.3</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>

<!-- Quitar al migrar a PostgreSQL -->
<!-- <dependency>mysql connector...</dependency> -->
```

### 2.4 Dependencias npm a añadir (Angular)

```bash
# Supabase (Realtime + cliente BD)
npm install @supabase/supabase-js
```

### 2.5 application.properties (objetivo)

```properties
# ── PostgreSQL / Supabase ──────────────────────────────────
spring.datasource.url=jdbc:postgresql://HOST:5432/postgres
spring.datasource.username=postgres
spring.datasource.password=TU_PASSWORD_SUPABASE
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false
spring.jpa.properties.hibernate.format_sql=false

# ── Flyway ────────────────────────────────────────────────
spring.flyway.enabled=true
spring.flyway.locations=classpath:db/migration
spring.flyway.baseline-on-migrate=true

# ── JWT ───────────────────────────────────────────────────
jwt.secret=TU_CLAVE_SECRETA_MINIMO_256_BITS_BASE64
jwt.expiration=86400000

# ── Supabase (para referencias en el backend si se necesita) ─
supabase.url=https://TU_PROYECTO.supabase.co
supabase.anon-key=TU_ANON_KEY
```

---

## 3. ESTRUCTURA DE DIRECTORIOS

```
DINAMYT-PROJECT/
├── README.md
├── DINAMYT_DOCUMENTACION_COMPLETA.md   ← ESTE ARCHIVO (raíz del proyecto)
├── bd/
│   └── dinamyt (6).sql                 ← Backup MySQL original
├── frontend/
│   └── src/app/
│       ├── app.component.ts
│       ├── app.routes.ts               ← Rutas con lazy loading
│       ├── app.config.ts               ← Providers globales
│       ├── core/
│       │   ├── guards/                 ← authGuard, guestGuard, verificationGuard
│       │   ├── interceptors/           ← HTTP interceptors (añadir JWT aquí)
│       │   ├── models/                 ← Interfaces TypeScript
│       │   ├── services/               ← AuthService, ChampionshipService, SupabaseService...
│       │   └── utils/
│       ├── features/
│       │   ├── auth/                   ✅ Login, Registro, Verificación, Reset
│       │   ├── championship/
│       │   │   └── live-tournament/    ⚠️ UI completa, backend pendiente
│       │   ├── dashboard/              ✅
│       │   ├── home/                   ✅
│       │   ├── user/                   ✅ Perfil, inscripciones, invitaciones
│       │   ├── academy/                ⚠️ Solo lectura
│       │   └── not-found/
│       └── shared/
└── backend/
    └── src/main/java/org/ivan/backend/backend/
        ├── BackendApplication.java
        ├── EmailService.java           ← ⚠️ @Autowired faltante — ver Fase 2
        ├── BD_tablas/                  ← Entidades JPA
        ├── controladores/
        │   ├── controlador_principal.java  ← ÚNICO controlador (952 líneas)
        │   ├── CampeonatoLiveMapper.java
        │   ├── Inscripcion.java
        │   └── JsonCleaner.java
        ├── repositorios/
        ├── secciones/                  ← ArbolBuilder, NodoArbol, TipoNodo...
        └── config/                     ← CORS, (añadir SecurityConfig aquí)
    └── src/main/resources/
        ├── application.properties
        └── db/migration/               ← Scripts Flyway (crear en Fase 1)
            ├── V1__esquema_inicial.sql
            ├── V2__fixes_criticos.sql
            ├── V3__tablas_live.sql
            └── V4__indices.sql
```

---

## 4. DOMINIO DEL NEGOCIO

> **REGLAS NO NEGOCIABLES. Todo el sistema debe respetarlas.**

### 4.1 Modalidades

| Modalidad | Calificación | Género | Restricciones |
|---|---|---|---|
| **Figura Manos Libres** | 4 jueces, suma | Mixto | Ninguna adicional |
| **Figura con Armas** | 4 jueces, suma | Mixto | Blancos NO pueden participar |
| **Defensa Personal** | 4 jueces, suma | Mixto | En parejas, 6 técnicas, 2 min |
| **Saltos** | Eliminación progresiva | Separado por género | Solo ≥14 años + cinturón Intermedio |
| **Combates** | Árbol de eliminación | Mixto ≤11 años / Separado ≥12 años | Combate continuo |

### 4.2 Jerarquía de cinturones

```
CINTURONES (menor → mayor):
  BLANCO → AMARILLO → NARANJA → NARANJA_VERDE → VERDE → VERDE_AZUL
  → AZUL → ROJO → MARRON → MARRON_NEGRO → NEGRO

GRUPOS EN COMPETENCIA (GUP según planillas oficiales):
  GRUPO_BLANCO       = [BLANCO]                            GUP 10
  GRUPO_PRINCIPIANTE = [AMARILLO, NARANJA, NARANJA_VERDE]  GUP 9-8-7
  GRUPO_INTERMEDIO   = [VERDE, VERDE_AZUL, AZUL]           GUP 6-5-4
  GRUPO_AVANZADO     = [ROJO, MARRON, MARRON_NEGRO]        GUP 3-2-1
  GRUPO_NEGRO        = [NEGRO]                             CINTURONES NEGROS
```

### 4.3 Restricciones de participación (validar en backend)

```
R1: cinturón ∈ GRUPO_BLANCO ∪ GRUPO_PRINCIPIANTE → NO puede inscribirse en SALTOS
R2: cinturón ∈ GRUPO_BLANCO                       → NO puede inscribirse en FIGURA CON ARMAS
R3: modalidad = SALTOS                             → REQUIERE edad ≥ 14 Y cinturón ≥ GRUPO_INTERMEDIO
R4: modalidad = COMBATES Y edad ≤ 11              → categoría = MIXTO
R5: modalidad = COMBATES Y edad ≥ 12              → categoría = género del competidor (M/F)
```

> **IMPORTANTE:** La edad NO se guarda como campo. Se guarda `fecha_nacimiento (DATE)` y el sistema calcula la edad dinámicamente en cada operación que la necesite.

### 4.4 Calificación — Figuras y Defensa Personal

**4 jueces independientes, cada uno evalúa un aspecto:**

*Figura Manos Libres / Figura con Armas:*
- Juez 1: Conocimiento de la forma — no detenerse, no reiniciar
- Juez 2: Transiciones suaves, equilibrio y centro de gravedad
- Juez 3: Atletismo, energía, intensidad apropiada, amplitud de movimiento
- Juez 4: Proyección personal, actitud, presentación, uniformidad

*Defensa Personal:*
- Juez 1: Visibilidad y precisión de la técnica, reacción inmediata
- Juez 2: Fluidez entre técnicas, equilibrio
- Juez 3: Control del atacante, incapacitación efectiva o sumisión
- Juez 4: Técnica de rompimiento de caída apropiada

**Puntuación final del competidor = SUMA de los 4 jueces**
**Ranking = ordenar de mayor a menor puntuación_total**

**Regla de desempate en podio:**
- Solo se disputa si el empate es entre posiciones adyacentes del podio
- Válido: 1°↔2°, 2°↔3°, 3°↔4°
- Inválido (se ignora): 4°↔5° o cualquiera fuera del podio
- En disputa: los empatados repiten la presentación; los demás no

### 4.5 Calificación — Combates (basado en planillas físicas del campeonato)

**Roles en el tatami:**
- Réferi Central (id_tipo=6): otorga puntos especiales, Kyong Go, Gam Chon, decide victoria
- Jueces de Esquina (id_tipo=8): hasta 4, ingresan puntuación por rondas (columnas 1-4)
- Juez de Mesa / Control de Planilla (id_tipo=7): gestiona planilla y cronómetro

**Terminología oficial (planillas reales del campeonato):**
- `Kyong Go` = advertencia → descuenta **−0.5 puntos**
- `Gam Chon` = penalización → descuenta **−1 punto**
- Colores por competidor: **AZUL** y **ROJO**

**Tabla de puntos:**
| Técnica | Puntos |
|---|---|
| Golpe al cuerpo | 1 |
| Patada básica al cuerpo | 1 |
| Patada básica a la cabeza | 2 |
| Patada giratoria al cuerpo | 2 |
| Patada giratoria a la cabeza | 3 |
| Knock down (KD / Not Down si no cuenta) | +2 adicionales |
| Lanzamiento / barrida / derribo | 2 |
| Victoria por sumisión | Victoria inmediata |

**Formas de ganar:** Por Puntos / Por Sumisión / Por NKO

**Tiempos:**
- Mayores de 9 años: 1 round de 2 minutos
- 6 a 8 años: 2 rounds de 1 minuto

**Fórmula de puntuación total por competidor:**
```
total = (suma columnas jueces de esquina) + proyeccion + not_down
        - (kyong_go × 0.5) - (gam_chon × 1.0)
```

### 4.6 Estructura de brackets de combate (planillas oficiales)

**Nota clave de las planillas:** *"Se sortea las parejas que escogió el juez central según tamaño y peso."*
La asignación NO es puramente aleatoria — el juez central tiene criterio sobre el emparejamiento.

**Convención de nomenclatura:**
- `GP#` = Ganador de la Pareja #
- `PP#` = Perdedor de la Pareja #
- `B.A.E.` = Bye — pasa directo a la siguiente ronda

**Restricción de misma academia:** Competidores del mismo club NO pueden enfrentarse en primera ronda. Si el sorteo lo genera, reasignar.

**Estructuras por número de competidores:**

```
2 COMPETIDORES:
  [C1] ↘ PAREJA A → GANADOR = 1er Lugar
  [C2] ↗            PERDEDOR = 2do Lugar

4 COMPETIDORES:
  [C1] ↘ GP1 ↘
  [C2] ↗     GPA → 1er Lugar (perdedor GPA = 2do)
  [C3] ↘ GP2 ↗
  [C4] ↗     → PP1 + PP2 → 3er Lugar

6 COMPETIDORES:
  [C1] ↘ GP1 ↘
  [C2] ↗ GP2 ↗ → GPA ↘
  [C3] ↘              → 1er Lugar
  [C4] ↗ BAE  ───────↗
  [C5] → BAE  (perdedor GPA = 2do, perdedor primera ronda A = 3er)

8 COMPETIDORES:
  [C1] ↘ GP1 ↘           ↘
  [C2] ↗     A           ↗ FINAL → 1er Lugar
  [C3] ↘ GP2 ↗ ↘       ↗
  [C4] ↗       → Semis
  [C5] ↘ GP3 ↗ ↗
  [C6] ↗     B
  [C7] ↘ GP4 ↗
  [C8] ↗
  Perdedores de semis → PPA + PPB → 3er Lugar

10 COMPETIDORES:
  4 parejas normales + 1 BAE
  BAE → entra en semifinal C junto con ganadores de rondas previas
  Perdedor 3er lugar: perdedor de D
  Perdedor 2do lugar: perdedor de final

12 COMPETIDORES:
  6 parejas normales
  BAE se asigna al bracket de 12 cuando se usa
  Estructura: A,B,C → D (semis) → E (final)
  Perdedor E = 2do, perdedor D = 3er
```

### 4.7 Roles del sistema

| Rol | id_tipo global | id_tipo en inscripción | Actividad en DINAMYT |
|---|---|---|---|
| Usuario básico / Competidor | 1 | 5 | Ve puntuaciones en tiempo real via Supabase Realtime |
| Instructor | 2 | — | Puede inscribir competidores de su academia |
| Administrador | 3 | — | Gestión global del sistema |
| Juez Central (Réferi Central) | — | 6 | Ingresa puntos especiales, Kyong Go, Gam Chon, decide victoria |
| Juez de Mesa / Control Planilla | — | 7 | Gestiona planilla y cronómetro |
| Réferi de Esquina | — | 8 | Ingresa puntuación por rondas (cols 1-4) |
| Coach | — | 10 | **Solo registro. SIN actividad en el sistema.** |

---

## 5. BASE DE DATOS

### 5.1 Decisiones de normalización

**Problema de la versión anterior:** Los campos `secciones (JSONB)` en `campeonato` e `inscripcion` almacenaban listas dentro de una columna, violando el espíritu de 1FN y dificultando consultas, índices y joins.

**Solución aplicada:**
- Las secciones del campeonato pasan a la tabla `seccion_campeonato` (una fila por sección)
- Las secciones de una inscripción pasan a `inscripcion_seccion` (tabla puente)
- Se conserva `modalidades (JSONB)` en campeonato SOLO para la configuración del árbol (estructura de árbol del organizador, no datos relacionales)
- Se elimina `secciones_activas (JSONB)` — se reemplaza por consulta a `inscripcion_seccion`
- Los catálogos de cinturones y grupos se normalizan en sus propias tablas

**Formas normales cumplidas:**
- **1FN:** Todos los atributos son atómicos. No hay listas en columnas (eliminados los JSONB con arrays de IDs)
- **2FN:** Toda dependencia funcional es con respecto a la clave primaria completa (PKs compuestas revisadas)
- **3FN:** No hay dependencias transitivas. Los catálogos (`tipo_usuario`, `estado_inscripcion`, `grupo_cinturon`) están separados
- **BCNF:** Los determinantes de cada tabla son superclaves

### 5.2 Esquema completo normalizado (PostgreSQL)

---

#### `tipo_usuario` — Catálogo de roles
```sql
CREATE TABLE tipo_usuario (
  id_tipo     SMALLINT PRIMARY KEY,
  descripcion VARCHAR(50) NOT NULL
);
-- Valores: 1=Usuario básico, 2=Instructor, 3=Admin, 5=Competidor,
--          6=Juez Central, 7=Juez Mesa, 8=Réferi Esquina, 10=Coach
```

---

#### `estado_inscripcion` — Catálogo de estados
```sql
CREATE TABLE estado_inscripcion (
  id_estado   SMALLINT PRIMARY KEY,
  descripcion VARCHAR(50) NOT NULL,
  es_visible  BOOLEAN NOT NULL DEFAULT TRUE
);
-- Valores: 2=Pendiente, 3=Aprobado, 4=Rechazado/Cancelado
```

---

#### `grupo_cinturon` — Catálogo normalizado de grupos de cinturón *(nuevo)*
```sql
CREATE TABLE grupo_cinturon (
  id_grupo    SMALLINT PRIMARY KEY,
  nombre      VARCHAR(30) NOT NULL,   -- 'BLANCO','PRINCIPIANTE','INTERMEDIO','AVANZADO','NEGRO'
  gup_desde   SMALLINT,               -- GUP numérico más alto del grupo
  gup_hasta   SMALLINT,               -- GUP numérico más bajo del grupo
  orden       SMALLINT NOT NULL       -- Para comparar: BLANCO=1, NEGRO=5
);
```

---

#### `cinturon` — Catálogo normalizado de cinturones individuales *(nuevo)*
```sql
CREATE TABLE cinturon (
  id_cinturon  SMALLINT PRIMARY KEY,
  nombre       VARCHAR(30) NOT NULL,   -- 'BLANCO', 'AMARILLO', etc.
  id_grupo     SMALLINT NOT NULL REFERENCES grupo_cinturon(id_grupo),
  gup          SMALLINT,               -- Número GUP (10=blanco, 1=marrón-negro)
  orden        SMALLINT NOT NULL       -- Para ordenar y comparar niveles
);
```

---

#### `academia` — Clubes y dojangs
```sql
CREATE TABLE academia (
  id_academia     BIGSERIAL PRIMARY KEY,
  nombre          VARCHAR(255) NOT NULL,
  descripcion     VARCHAR(500),
  ciudad          VARCHAR(100),
  pais            VARCHAR(100),
  direccion       VARCHAR(255),
  link_red_social VARCHAR(255),
  numero_contacto VARCHAR(30),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

#### `usuario` — Todos los usuarios del sistema
```sql
CREATE TABLE usuario (
  id_documento     BIGINT PRIMARY KEY,           -- Número de cédula
  nombre_completo  VARCHAR(150) NOT NULL,
  sexo             VARCHAR(10),                  -- 'M' | 'F'
  fecha_nacimiento DATE,                         -- La edad se calcula, NO se guarda
  id_cinturon      SMALLINT REFERENCES cinturon(id_cinturon),
  nacionalidad     VARCHAR(100),
  ciudad           VARCHAR(100),
  correo           VARCHAR(120) NOT NULL UNIQUE,
  contrasena_hash  TEXT NOT NULL,                -- BCrypt — NUNCA texto plano
  numero_celular   VARCHAR(30),
  id_instructor    BIGINT REFERENCES usuario(id_documento),  -- Autorreferencia
  id_academia      BIGINT REFERENCES academia(id_academia),
  id_tipo          SMALLINT NOT NULL REFERENCES tipo_usuario(id_tipo),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ                   -- Soft delete
);

CREATE INDEX idx_usuario_correo    ON usuario(correo);
CREATE INDEX idx_usuario_academia  ON usuario(id_academia);
CREATE INDEX idx_usuario_instructor ON usuario(id_instructor);
```

---

#### `verificacion_pendiente` — Reemplaza el HashMap en RAM *(nuevo)*
```sql
CREATE TABLE verificacion_pendiente (
  correo        VARCHAR(120) PRIMARY KEY,
  datos_usuario JSONB NOT NULL,   -- Objeto usuario serializado pendiente de verificar
  codigo        VARCHAR(6) NOT NULL,
  modo          VARCHAR(20) NOT NULL,  -- 'register' | 'recuperar' | 'cambiar'
  expira_en     TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Limpiar registros expirados con un job periódico o al consultar
```

---

#### `campeonato` — Torneos
```sql
CREATE TABLE campeonato (
  id_campeonato        BIGSERIAL PRIMARY KEY,
  nombre               VARCHAR(255) NOT NULL,
  ubicacion            VARCHAR(255),
  pais                 VARCHAR(100),
  ciudad               VARCHAR(100),
  alcance              VARCHAR(30),         -- 'Local'|'Regional'|'Nacional'|'Internacional'
  numero_tatamis       INTEGER NOT NULL,
  maximo_participantes INTEGER,
  es_publico           BOOLEAN NOT NULL DEFAULT TRUE,
  id_creador           BIGINT NOT NULL REFERENCES usuario(id_documento),
  fecha_inicio         DATE,
  fecha_fin            DATE,
  estado               VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',  -- 'BORRADOR'|'LISTO'|'EN_CURSO'|'FINALIZADO'
  puede_inscribirse    BOOLEAN NOT NULL DEFAULT FALSE,
  codigo_acceso        VARCHAR(10) UNIQUE,  -- Solo para campeonatos privados
  es_visible           BOOLEAN NOT NULL DEFAULT TRUE,  -- Soft delete
  modalidades          JSONB,               -- Config del árbol de modalidades (solo estructura organizador)
  fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- NOTA: Se eliminan secciones (JSONB) y secciones_activas (JSONB)
-- Reemplazadas por las tablas seccion_campeonato e inscripcion_seccion

CREATE INDEX idx_campeonato_creador ON campeonato(id_creador);
CREATE INDEX idx_campeonato_estado  ON campeonato(estado, es_visible);
```

---

#### `seccion_campeonato` — Una fila por cada categoría/sección del campeonato *(reemplaza secciones JSONB)*
```sql
CREATE TABLE seccion_campeonato (
  id_seccion     BIGSERIAL PRIMARY KEY,
  id_campeonato  BIGINT NOT NULL REFERENCES campeonato(id_campeonato) ON DELETE CASCADE,
  seccion_id_str VARCHAR(200) NOT NULL,  -- ID string: 'COMBATES-MASCULINO-BLANCO-EDAD(10_12)-PESO(30_40)'
  modalidad      VARCHAR(30) NOT NULL,
  genero         VARCHAR(20) NOT NULL,   -- 'Masculino'|'Femenino'|'Mixto'
  id_grupo_cinturon SMALLINT REFERENCES grupo_cinturon(id_grupo),
  edad_desde     SMALLINT,
  edad_hasta     SMALLINT,
  peso_desde     DECIMAL(5,2),
  peso_hasta     DECIMAL(5,2),
  tiene_competidores BOOLEAN NOT NULL DEFAULT FALSE,  -- Se actualiza al aprobar inscripciones
  estado         VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',  -- 'PENDIENTE'|'EN_CURSO'|'FINALIZADO'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_campeonato, seccion_id_str)
);

CREATE INDEX idx_seccion_campeonato ON seccion_campeonato(id_campeonato);
CREATE INDEX idx_seccion_modalidad  ON seccion_campeonato(id_campeonato, modalidad);
```

---

#### `campeonato_modalidad` — Modalidades habilitadas por campeonato (PK compuesta — decisión 1FN)
```sql
CREATE TABLE campeonato_modalidad (
  id_campeonato  BIGINT NOT NULL REFERENCES campeonato(id_campeonato) ON DELETE CASCADE,
  modalidad      VARCHAR(30) NOT NULL,
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_campeonato, modalidad)
);
```

---

#### `inscripcion` — Participación de un usuario en un campeonato
```sql
CREATE TABLE inscripcion (
  id_inscripcion    BIGSERIAL PRIMARY KEY,
  id_usuario        BIGINT NOT NULL REFERENCES usuario(id_documento),
  id_campeonato     BIGINT NOT NULL REFERENCES campeonato(id_campeonato),
  peso              DECIMAL(5,2),            -- Peso al momento de inscribirse
  id_tipo           SMALLINT REFERENCES tipo_usuario(id_tipo),  -- Rol en este campeonato
  id_estado         SMALLINT NOT NULL REFERENCES estado_inscripcion(id_estado),
  es_invitado       BOOLEAN NOT NULL DEFAULT FALSE,
  es_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_inscripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- NOTA: Se elimina secciones (JSONB) — reemplazada por inscripcion_seccion

CREATE INDEX idx_inscripcion_usuario    ON inscripcion(id_usuario);
CREATE INDEX idx_inscripcion_campeonato ON inscripcion(id_campeonato);
CREATE INDEX idx_inscripcion_estado     ON inscripcion(id_campeonato, id_estado, id_tipo);
```

---

#### `inscripcion_seccion` — Qué secciones tiene cada inscripción *(reemplaza secciones JSONB en inscripcion)*
```sql
CREATE TABLE inscripcion_seccion (
  id_inscripcion  BIGINT NOT NULL REFERENCES inscripcion(id_inscripcion) ON DELETE CASCADE,
  id_seccion      BIGINT NOT NULL REFERENCES seccion_campeonato(id_seccion) ON DELETE CASCADE,
  PRIMARY KEY (id_inscripcion, id_seccion)
);

CREATE INDEX idx_inscripcion_seccion_sec ON inscripcion_seccion(id_seccion);
```

---

#### `tatami` — Tatamis por campeonato *(nuevo)*
```sql
CREATE TABLE tatami (
  id_tatami     BIGSERIAL PRIMARY KEY,
  id_campeonato BIGINT NOT NULL REFERENCES campeonato(id_campeonato) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  nombre        VARCHAR(50) NOT NULL,          -- 'Tatami 1', 'Tatami A'...
  tipo          VARCHAR(20) NOT NULL DEFAULT 'GENERAL',  -- 'GENERAL'|'SALTO_LARGO'|'SALTO_ALTO'
  estado        VARCHAR(20) NOT NULL DEFAULT 'FREE',     -- 'FREE'|'BUSY'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_campeonato, numero)
);

CREATE INDEX idx_tatami_campeonato ON tatami(id_campeonato);
```

---

#### `tatami_seccion` — Cola de secciones asignadas a un tatami *(nuevo)*
```sql
CREATE TABLE tatami_seccion (
  id_tatami_seccion BIGSERIAL PRIMARY KEY,
  id_tatami         BIGINT NOT NULL REFERENCES tatami(id_tatami) ON DELETE CASCADE,
  id_seccion        BIGINT NOT NULL REFERENCES seccion_campeonato(id_seccion),
  estado            VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',  -- 'PENDIENTE'|'LISTO'|'EN_CURSO'|'FINALIZADO'
  orden_en_cola     INTEGER NOT NULL DEFAULT 0,
  fecha_inicio      TIMESTAMPTZ,
  fecha_fin         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tatami_seccion_tatami ON tatami_seccion(id_tatami, orden_en_cola);
```

---

#### `tatami_juez` — Asignación de jueces a tatamis *(nuevo)*
```sql
CREATE TABLE tatami_juez (
  id_tatami_juez BIGSERIAL PRIMARY KEY,
  id_tatami      BIGINT NOT NULL REFERENCES tatami(id_tatami) ON DELETE CASCADE,
  id_usuario     BIGINT NOT NULL REFERENCES usuario(id_documento),
  rol_en_tatami  SMALLINT NOT NULL REFERENCES tipo_usuario(id_tipo),  -- 6, 7 u 8
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_tatami, id_usuario)
);
```

---

#### `combate_bracket` — Árbol de eliminación de combates *(nuevo)*
```sql
CREATE TABLE combate_bracket (
  id_bracket       BIGSERIAL PRIMARY KEY,
  id_seccion       BIGINT NOT NULL REFERENCES seccion_campeonato(id_seccion),
  fase             VARCHAR(30) NOT NULL,   -- 'PRIMERA_RONDA'|'CUARTOS'|'SEMIS'|'FINAL'|'TERCER_LUGAR'
  numero_pareja    INTEGER NOT NULL,       -- Número del enfrentamiento en su fase
  id_competidor_1  BIGINT REFERENCES usuario(id_documento),
  id_competidor_2  BIGINT REFERENCES usuario(id_documento),  -- NULL si es Bye
  es_bye           BOOLEAN NOT NULL DEFAULT FALSE,
  id_ganador       BIGINT REFERENCES usuario(id_documento),
  forma_victoria   VARCHAR(20),            -- 'PUNTOS'|'SUMISION'|'NKO'|'DESCALIFICACION'
  estado           VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',  -- 'PENDIENTE'|'EN_CURSO'|'FINALIZADO'
  id_siguiente     BIGINT REFERENCES combate_bracket(id_bracket),  -- A qué bracket va el ganador
  orden_global     INTEGER NOT NULL,       -- Orden de ejecución global en la sección
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bracket_seccion ON combate_bracket(id_seccion, fase);
```

---

#### `puntuacion_combate` — Puntuaciones por ronda en combates *(nuevo)*
```sql
CREATE TABLE puntuacion_combate (
  id_puntuacion    BIGSERIAL PRIMARY KEY,
  id_bracket       BIGINT NOT NULL REFERENCES combate_bracket(id_bracket) ON DELETE CASCADE,
  id_juez          BIGINT NOT NULL REFERENCES usuario(id_documento),
  rol_juez         SMALLINT NOT NULL REFERENCES tipo_usuario(id_tipo),  -- 6=Central, 8=Esquina
  ronda            SMALLINT NOT NULL DEFAULT 1,    -- 1 o 2
  competidor_color VARCHAR(5) NOT NULL,             -- 'AZUL' | 'ROJO'
  -- Columnas de puntuación de jueces de esquina (1-4)
  puntos_1         DECIMAL(4,1) DEFAULT 0,
  puntos_2         DECIMAL(4,1) DEFAULT 0,
  puntos_3         DECIMAL(4,1) DEFAULT 0,
  puntos_4         DECIMAL(4,1) DEFAULT 0,
  -- Puntos especiales (solo réferi central)
  proyeccion       DECIMAL(4,1) DEFAULT 0,          -- Lanzamientos/derribos
  not_down         DECIMAL(4,1) DEFAULT 0,          -- KD no contabilizado
  -- Penalizaciones
  kyong_go         SMALLINT NOT NULL DEFAULT 0,    -- Advertencias (-0.5 c/u)
  gam_chon         SMALLINT NOT NULL DEFAULT 0,    -- Penalizaciones (-1 c/u)
  -- Total calculado
  total            DECIMAL(6,1) GENERATED ALWAYS AS (
                     puntos_1 + puntos_2 + puntos_3 + puntos_4
                     + proyeccion + not_down
                     - (kyong_go * 0.5)
                     - (gam_chon * 1.0)
                   ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pun_combate_bracket ON puntuacion_combate(id_bracket, competidor_color);
```

---

#### `puntuacion_figura` — Puntuaciones de figuras y defensa personal *(nuevo)*
```sql
CREATE TABLE puntuacion_figura (
  id_puntuacion  BIGSERIAL PRIMARY KEY,
  id_seccion     BIGINT NOT NULL REFERENCES seccion_campeonato(id_seccion),
  id_competidor  BIGINT NOT NULL REFERENCES usuario(id_documento),
  id_juez        BIGINT NOT NULL REFERENCES usuario(id_documento),
  numero_juez    SMALLINT NOT NULL,         -- 1, 2, 3 o 4
  puntuacion     DECIMAL(5,2) NOT NULL,
  es_desempate   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_seccion, id_competidor, id_juez, numero_juez, es_desempate)
);

CREATE INDEX idx_pun_figura_seccion    ON puntuacion_figura(id_seccion, id_competidor);
CREATE INDEX idx_pun_figura_competidor ON puntuacion_figura(id_competidor, id_seccion);
```

---

### 5.3 Vista de resultados de figuras (para Supabase Realtime)

```sql
-- Vista que calcula el total por competidor en tiempo real
-- Los clientes Angular se suscriben a cambios en puntuacion_figura
-- y la UI recalcula con esta lógica:

CREATE VIEW resultado_figura AS
SELECT
  id_seccion,
  id_competidor,
  es_desempate,
  SUM(puntuacion) AS total,
  COUNT(DISTINCT numero_juez) AS jueces_que_puntuaron,
  MAX(created_at) AS ultima_actualizacion
FROM puntuacion_figura
GROUP BY id_seccion, id_competidor, es_desempate;
```

### 5.4 Configuración de Flyway

Scripts en `backend/src/main/resources/db/migration/`:

```
V1__esquema_inicial.sql          ← Tablas base migradas a PostgreSQL
V2__catalogos_cinturon.sql       ← Poblar grupo_cinturon y cinturon
V3__fixes_criticos.sql           ← verificacion_pendiente, endpoint publicar
V4__live_tournament.sql          ← tatami, tatami_seccion, tatami_juez,
                                    combate_bracket, puntuacion_combate,
                                    puntuacion_figura
V5__secciones_normalizadas.sql   ← seccion_campeonato, inscripcion_seccion
                                    (migrar datos desde JSONB)
V6__indices.sql                  ← Todos los índices de rendimiento
```

### 5.5 Supabase Realtime — Tablas a habilitar

En el dashboard de Supabase → Database → Replication, habilitar Realtime en:
- `puntuacion_figura` — para Live de figuras/defensa
- `puntuacion_combate` — para Live de combates
- `combate_bracket` — para actualización del árbol
- `tatami_seccion` — para estado de tatamis
- `seccion_campeonato` — para estado de secciones

**Ejemplo de suscripción en Angular:**
```typescript
// supabase.service.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Suscribirse a nuevas puntuaciones de una sección
supabase
  .channel('puntuaciones-seccion-' + idSeccion)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'puntuacion_figura',
    filter: `id_seccion=eq.${idSeccion}`
  }, (payload) => {
    // Actualizar UI con payload.new
  })
  .subscribe();
```

---

## 6. MÓDULOS IMPLEMENTADOS

| Módulo | Frontend | Backend | Notas |
|---|---|---|---|
| Auth (Login/Registro/Verificación) | ✅ | ✅ Funcional | Con deudas de seguridad |
| Recuperación de contraseña | ✅ | ✅ Funcional | |
| Crear/Editar Campeonato | ✅ | ✅ Funcional | |
| Explorar campeonatos | ✅ | ✅ Funcional | |
| Detalles de campeonato | ✅ | ✅ Funcional | |
| Inscripción de competidores | ✅ | ✅ Funcional | Secciones aún en JSONB |
| Invitaciones | ✅ | ✅ Funcional | |
| Panel del organizador | ✅ | ✅ Funcional | |
| Publicar campeonato | ✅ UI | ❌ Sin endpoint | PUT resetea a BORRADOR |
| Live Tournament UI | ✅ Avanzado | ⚠️ Solo carga inicial | Tatamis solo en memoria |
| Tatamis — gestión | ✅ | ❌ Placeholders | Backend solo imprime consola |
| Panel de juez — puntuación | ✅ | ❌ No implementado | |
| Asignación jueces a tatamis | ✅ | ❌ Placeholder | |
| Scores / Resultados | ✅ UI | ❌ Sin persistencia | |
| Árbol de combates (bracket) | ❌ | ❌ | No existe en ninguna capa |
| Estadísticas | ✅ UI | ❌ Sin datos reales | |
| Seguridad JWT | — | ❌ No implementado | Contraseñas en texto plano |

### Árbol de categorías (Backend — paquete `secciones/`)

El `ArbolBuilder.construir()` genera jerarquía fija:
```
RAÍZ → MODALIDAD → GENERO → CINTURON → EDAD → PESO
```

IDs de sección (formato fijo — NO cambiar sin refactorizar todos los parsers):
```
COMBATES-MASCULINO-BLANCO-EDAD(10_12)-PESO(30_40)
FIGURAS-MIXTO-NEGRO-EDAD(18_25)-PESO(SIN_PESO)
```

### Gestión de sesión actual (AuthService)
- Sin JWT — guarda objeto usuario completo en `localStorage`
- `sessionStorage`: token, correo, ID_documento, tipo_usuario, nombreC
- `BehaviorSubject<boolean>` para estado reactivo
- Sincronización entre pestañas via `window.storage`

---

## 7. MÓDULOS PENDIENTES

### 7.1 Endpoints que son placeholders y deben implementarse

```java
// Actualmente retornan 200 OK sin lógica real:
POST   /tatamis/{id}/jueces
POST   /tatamis/{id}/assign-group
DELETE /tatamis/{id}/assignment
PUT    /secciones/{id}/status
POST   /secciones/{id}/results
PUT    /secciones/{id}/competitors/{id}/status
PUT    /matches/{id}/score

// Nuevo endpoint que falta:
PATCH  /campeonatos/{id}/publicar       ← Cambiar BORRADOR → LISTO
```

### 7.2 Lógica del bracket de combates

```
ALGORITMO DE GENERACIÓN:
1. Obtener competidores confirmados de la sección (inscripcion_seccion JOIN inscripcion)
2. Aplicar restricción: mismo id_academia NO puede estar en misma pareja en 1ra ronda
3. Si número impar → asignar B.A.E. (el juez central decide quién, el sistema sugiere)
4. Generar estructura según cantidad:
   2  → 1 pareja directa
   4  → 2 parejas → final
   6  → 2 parejas + BAE → semis + final
   8  → 4 parejas → semis → final + 3er lugar
   10 → 4 parejas + BAE → cuartos → semis → final
   12 → 6 parejas → cuartos → semis → final
   N  → potencia de 2 superior + BAEs necesarios
5. Persistir en combate_bracket (una fila por enfrentamiento)
6. Supabase Realtime notifica a todos los suscritos
```

### 7.3 Seguridad JWT + Spring Security

Implementar en orden:
1. `JwtUtil.java` — genera y valida tokens
2. `JwtAuthenticationFilter.java` — intercepta requests y valida Bearer token
3. `SecurityConfig.java` — define rutas públicas vs protegidas
4. Modificar `/login` → retorna `{token, usuario}`
5. Modificar `/registro` → BCrypt en contraseña
6. Frontend: interceptor HTTP añade `Authorization: Bearer {token}` en cada request
7. `AuthService` → guardar solo token + datos mínimos (no el objeto usuario completo)

**Rutas públicas (sin JWT):**
```
POST /api/registro
POST /api/verificar
POST /api/reenviar
POST /api/recuperar-password
POST /api/cambiar-password
POST /api/login
GET  /api/campeonatos
GET  /api/campeonatos/{id}
```

### 7.4 Fix crítico: EmailService

```java
// ROTO actualmente — EmailService es null en runtime:
private EmailService emailService; // sin @Autowired

// FIX correcto (constructor injection — preferido en Spring):
private final EmailService emailService;

public controlador_principal(EmailService emailService) {
    this.emailService = emailService;
}
```

### 7.5 Fix: usuarios pendientes en RAM → BD

La tabla `verificacion_pendiente` reemplaza el `HashMap` estático. El backend debe:
1. Al registrar: INSERT en `verificacion_pendiente`
2. Al verificar: SELECT + verificar código y expiración + DELETE + crear usuario
3. Job periódico (o al inicio de cada verificación): `DELETE FROM verificacion_pendiente WHERE expira_en < NOW()`

---

## 8. PLAN DE IMPLEMENTACIÓN POR FASES

> **REGLA DE ORO: Un cambio a la vez. No mezclar migraciones de BD con cambios de seguridad ni con WebSockets/Realtime.**

### FASE 1 — Migración MySQL → PostgreSQL + Flyway
**Objetivo:** Cambiar motor de BD sin cambiar comportamiento. Primer commit limpio.

1. Añadir dependencias PostgreSQL + Flyway en `pom.xml`, quitar MySQL
2. Crear `V1__esquema_inicial.sql` con el esquema adaptado a PostgreSQL
3. Crear `V2__catalogos_cinturon.sql` con datos de cinturones y grupos
4. Actualizar `application.properties`
5. Ajustar entidades JPA: `BIGSERIAL` → `@GeneratedValue(strategy=IDENTITY)`, `TINYINT` → `Short`/`Integer`
6. Verificar que todos los módulos funcionales siguen operando
7. Conectar a Supabase (crear proyecto, obtener URL y claves)

**Archivos a modificar:** `pom.xml`, `application.properties`, entidades JPA, crear scripts Flyway

### FASE 2 — Fixes críticos (sin añadir funcionalidad nueva)
**Objetivo:** El sistema existente funciona correctamente antes de escalar.

1. Fix `EmailService` → constructor injection
2. Implementar `PATCH /campeonatos/{id}/publicar`
3. Implementar `verificacion_pendiente` en BD (migrar de HashMap)
4. Normalizar esquema: crear `seccion_campeonato` e `inscripcion_seccion`, migrar datos desde JSONB
5. Crear `V3__fixes_criticos.sql` + `V4__secciones_normalizadas.sql`

### FASE 3 — Seguridad JWT + BCrypt
**Objetivo:** El sistema es seguro para producción. Contraseñas protegidas.

1. Dependencias: `spring-boot-starter-security`, `jjwt-*`
2. `JwtUtil.java`, `JwtAuthenticationFilter.java`, `SecurityConfig.java`
3. Modificar `/login` → JWT
4. Modificar `/registro` → BCrypt
5. Frontend: interceptor HTTP con token, actualizar `AuthService`
6. Ajustar CORS para producción
7. Probar TODOS los endpoints existentes

### FASE 4 — Backend del Live Tournament + Supabase Realtime
**Objetivo:** El núcleo del valor de DINAMYT funciona end-to-end.

1. Crear tablas `tatami`, `tatami_seccion`, `tatami_juez`, `puntuacion_figura`, `puntuacion_combate` (`V5__live_tournament.sql`)
2. Entidades JPA y repositorios correspondientes
3. Implementar servicios: `TatamiService`, `PuntuacionService`
4. Implementar los endpoints placeholder con lógica real
5. Habilitar Realtime en Supabase Studio para las tablas de puntuación
6. Frontend: instalar `@supabase/supabase-js`, crear `SupabaseService`
7. Conectar `LiveTournamentComponent` a Supabase Realtime (suscripciones por sección)
8. Vista pública para competidores: suscripción a sus propias puntuaciones

### FASE 5 — Árbol de combates (Bracket)
**Objetivo:** Combates tienen bracket funcional, visible y en tiempo real.

1. Crear `combate_bracket` (`V6__bracket.sql`)
2. Paquete `bracket/` en backend: `BracketService.java` con lógica de generación
3. Endpoint `POST /campeonatos/{id}/secciones/{seccionId}/generar-bracket`
4. Habilitar Realtime en `combate_bracket`
5. Frontend: componente de visualización del bracket (árbol interactivo)
6. Panel del juez central: ingresar resultado de cada combate

---

## 9. DECISIONES DE ARQUITECTURA

> **No cambiar estas decisiones sin consultar con Amir.**

1. **Supabase Realtime** para tiempo real (NO WebSockets con Spring). El backend Spring gestiona toda la lógica de negocio via REST. Supabase transmite los cambios en BD automáticamente.

2. **Un solo controlador REST** (`controlador_principal.java`, 952 líneas) se mantiene para no romper el mapeo existente. Refactorizar en controladores por módulo solo en Fase 4+ y solo si se decide hacerlo.

3. **IDs de sección como strings** con formato fijo: `MODALIDAD-GENERO-CINTURON-EDAD(x_y)-PESO(x_y)`. Este formato se usa en el `ArbolBuilder`, en `seccion_campeonato.seccion_id_str` y en la lógica de matching de inscripciones. **No cambiar el formato sin refactorizar todos los parsers.**

4. **Soft delete** con campo `es_visible` / `deleted_at` en campeonato, inscripcion y usuario. No hacer DELETE físico.

5. **`fecha_nacimiento` en lugar de `edad`**. La edad se calcula siempre dinámicamente. No guardar edad como campo en la BD.

6. **Autorreferencia en `usuario`**: FK `id_instructor → usuario.id_documento`. Permite que un instructor supervise múltiples competidores. No eliminar.

7. **PK compuesta en `campeonato_modalidad`**: `(id_campeonato, modalidad)` — decisión deliberada de 1FN. No añadir un `id` surrogate a esta tabla.

8. **El Coach (id_tipo=10)** existe en BD y se puede asignar en inscripciones, pero no tiene funcionalidades implementadas. No programar lógica para este rol.

9. **`grupo_cinturon` como catálogo separado** — no hardcodear los grupos en el código. Permitir que el sistema consulte la BD para saber a qué grupo pertenece un cinturón.

10. **Idioma:** Español para nombres de dominio (entidades, campos de negocio). Inglés permitido para patrones técnicos (service, repository, mapper, config, dto, etc.).

---

## 10. DEUDAS TÉCNICAS

| Deuda | Severidad | Se resuelve en |
|---|---|---|
| Contraseñas en texto plano | 🔴 CRÍTICA | Fase 3 |
| Sin JWT — cualquiera llama cualquier endpoint | 🔴 CRÍTICA | Fase 3 |
| `EmailService` con NullPointerException potencial | 🟠 ALTA | Fase 2 |
| Usuarios pendientes en RAM (se pierden en restart) | 🟠 ALTA | Fase 2 |
| Sin endpoint `PATCH /publicar` | 🟠 ALTA | Fase 2 |
| `secciones` e `inscripcion.secciones` en JSONB | 🟠 ALTA | Fase 2 |
| Un solo controlador de 952 líneas | 🟡 MEDIA | Fase 4+ (opcional) |
| URL hardcodeada `localhost:8080` | 🟡 MEDIA | Al hacer deploy |
| Sin `environment.ts` para producción | 🟡 MEDIA | Al hacer deploy |
| Datos de prueba hardcodeados en LiveTournamentComponent | 🟡 MEDIA | Fase 4 |
| CORS abierto | 🟡 MEDIA | Fase 3 |
| Sin índices en BD | 🟢 BAJA | Fase 1 (añadir en V1) |
| Lombok no completamente integrado | 🟢 BAJA | Fase 1 |

---

## 11. CÓMO EJECUTAR EL PROYECTO

### Backend (Spring Boot)
```bash
cd backend
mvn spring-boot:run
# Puerto: http://localhost:8080
```

### Frontend (Angular)
```bash
cd frontend
npm install
ng serve
# Puerto: http://localhost:4200
# La URL de la API está hardcodeada como http://localhost:8080/api
```

### Base de datos (actual — MySQL)
```bash
# Importar bd/dinamyt (6).sql en tu cliente MySQL
# Configurar credenciales en application.properties
```

### Base de datos (objetivo — PostgreSQL/Supabase)
```bash
# 1. Crear proyecto en supabase.com
# 2. Obtener Connection String (Project Settings → Database)
# 3. Actualizar application.properties con la URL de Supabase
# 4. Al iniciar Spring Boot, Flyway ejecuta automáticamente V1, V2, V3...
# 5. pgAdmin o Supabase Studio para gestión visual
```

---

*Versión 2.0 — 17 de Marzo de 2026*
*Generado a partir de: código fuente del proyecto, planillas físicas del 1er Campeonato Internacional 2025 (Cúcuta-Colombia), reglamento oficial GHA y sesiones de diseño acumuladas.*
*Si encuentras inconsistencias entre este archivo y el código, consulta con Amir antes de modificar.*
