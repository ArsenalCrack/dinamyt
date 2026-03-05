# 🥋 Proyecto DINAMYT: Plataforma Integral de Gestión de Torneos de Artes Marciales

## 🎯 1. ¿Cuál es el fin del proyecto?
**DINAMYT** es una aplicación web multiplataforma (orientada a servicios) diseñada específicamente para **organizar, gestionar y ejecutar campeonatos de artes marciales** en tiempo real. 

Su objetivo principal es digitalizar y simplificar todo el ciclo de vida de un torneo: desde la fase inicial de creación y configuración, pasando por la etapa de invitaciones e inscripciones de competidores, hasta llegar al control en vivo (Live Tournament) del evento, que incluye la administración técnica de los Tatamis, la asignación de jueces y un panel interactivo de puntuación en vivo.

---

## ⚙️ 2. Funcionalidades y Módulos Principales
El sistema se divide en varios submódulos funcionales bien definidos:

1. **Gestión de Campeonatos (Championship Management):**
   * Creación, edición y publicación de campeonatos.
   * Transición de estados lógico (por ejemplo, de `BORRADOR` a `LISTO`).
   * Generación de códigos de acceso y configuraciones de privacidad (Público vs. Privado).
2. **Inscripciones e Invitaciones:**
   * Registro individual de los participantes o envío de invitaciones directas.
   * Paneles para que los competidores acepten y elijan las modalidades a participar.
3. **Live Tournament (Torneo en Vivo):**
   * **Gestión de Tatamis:** Los organizadores pueden habilitar áreas de competición, asignar modalidades / categorías a un tatami específico y monitorear el flujo general.
   * **Robo de Modalidades:** Posibilidad de quitar o "robar" una modalidad asignada de un tatami saturado hacia otro que esté libre.
4. **Panel de Jueces y Sistema de Puntuación:**
   * Soporte para **Combate (Kumite/Sparring - 1vs1):** Dos competidores (Rojo vs. Azul) combatiendo simultáneamente, con el juez sumando o restando puntaje en tiempo real.
   * Soporte para **Puntuación por Exhibición (Katas / Defensa Personal / Formas):** Pantalla en la que un competidor es calificado de forma individual por los jueces.
5. **Paneles / Dashboards por Roles:**
   * Vistas especializadas y adaptadas al inicio de sesión dependiendo de si el usuario es Administrador, Juez u Organizador (Competidor).

---

## 🛠️ 3. Tecnologías y Herramientas Utilizadas
El proyecto tiene una arquitectura moderna que separa claramente el lado del cliente (Frontend) del servidor (Backend), unificados finalmente por una base de datos relacional.

### 💻 Frontend (Directorio `frontend/`)
Está desarrollado bajo una arquitectura de Single Page Application (SPA).
* **Framework:** **Angular 17** (Uso extensivo de TypeScript).
* **Diseño y UI:**
   * **Bootstrap 5.3** como framework base de CSS/Grid.
   * Estilo adicional personalizado en archivos scss/css limpios.
   * Tipografías: Fuentes de Google Fonts via **@fontsource** (`Montserrat` y `Roboto`).
   * Iconografía a cargo de **FontAwesome (v7)**.
* **Librerías Clave Adicionales:**
   * **Flatpickr:** Utilizada para crear inputs elegantes a la hora de seleccionar las fechas de los torneos.
   * **Country-State-City:** Para gestionar la geolocalización o ubicaciones precisas durante la creación de eventos.
   * **RxJS:** Programación reactiva y manejo de flujos asíncronos propios de Angular.

### 🖧 Backend (Directorio `backend/`)
Es una API RESTful robusta y lista para escabilidad.
* **Framework:** **Java Spring Boot 3.x / 4.x** (Ecosistema Spring).
* **Dependencias Principales:**
   * **Spring WebMVC:** Para exponer todos los endpoints (Rutas API).
   * **Spring Data JPA:** Para interactuar y mapear la base de datos a objetos Java.
   * **Lombok:** Para ahorrar código repetitivo (getters, setters, constructores).
   * **Spring Mail:** Para notificaciones por correo electrónico (aprobaciones, invitaciones).
* **Manejo de Proyectos:** Automatizado mediante Apache **Maven** (`pom.xml`).

### 🗄️ Base de Datos 
* **Servidor Relacional:** Utiliza **MySQL** (la comunicación se hace a través del driver `mysql-connector-j` configurado en el backend).
* Posee una carpeta llamada `bd/` donde actualmente hay respaldos SQL que albergan la estructura relacional (Tablas como *Campeonatos, Secciones, Encuentros, Resultado_Competidor...*) y datos de prueba.

---

## 📂 4. Estructura del Proyecto
El árbol del proyecto está sumamente distribuido en las siguientes carpetas principales:
* `backend/`: El núcleo de la lógica en Java (Spring).
* `frontend/`: Todas las vistas, componentes y guardias de Angular (divididas cuidadosamente en `core/` y `features/`).
* `bd/`: El ecosistema e historiales de la Base de Datos.
* `Requerimientos/`: Directorio con archivos de texto que definen reglas de negocio, historial de problemas y correcciones a implementar.
