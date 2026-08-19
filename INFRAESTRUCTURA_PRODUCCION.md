# Arquitectura de Producción Profesional para DINAMYT

Como este es un proyecto real y comercial (no de pruebas), el stack tecnológico debe estar preparado para soportar tráfico, ser confiable, no quedarse "dormido" (como las APIs gratuitas de Render) y garantizar la entrega de correos.

A continuación, presento las alternativas profesionales para cada capa de tu proyecto, junto con **mi recomendación final**.

---

## 1. Servidor Backend (Tus 4 APIs)

Actualmente estás en Render (capa gratuita), lo cual hace que tus APIs se duerman tras 15 minutos de inactividad, que el primer cliente tenga que esperar hasta 1 minuto de carga, y bloquea tus correos.

### Alternativas Profesionales
1. **Render (Planes de Pago):** 
   - Render ofrece planes para servicios web desde **$7/mes** por cada API. 
   - *Pros:* No tienes que cambiar de plataforma, ya lo tienes configurado. Desbloquea SMTP y las APIs nunca duermen.
   - *Contras:* Si tienes 4 APIs, pagarías $28/mes en total.
2. **Railway.app:**
   - Una plataforma muy similar a Vercel pero para Backends.
   - *Pros:* Pagas exactamente por los recursos (RAM/CPU) que consumes. Usualmente, correr 4 APIs pequeñas aquí cuesta entre **$5 y $8 al mes en total**.
   - *Contras:* Curva de aprendizaje muy pequeña; se conecta directo a Github igual que Render.
3. **DigitalOcean (App Platform / VPS):**
   - *Pros:* Puedes alquilar un "Droplet" (Servidor Privado) por $4-$6 al mes y montar todo ahí usando Docker.
   - *Contras:* Requiere conocimientos de DevOps, Linux y configuración de Nginx. (No recomendado si buscas facilidad).

> 🏆 **Recomendación para el Backend:** **Railway.app**. Te cobrarán muy poco por mantener tus 4 APIs siempre encendidas (pagas lo que consumes, sin cuota fija altísima). Si prefieres no mover nada de lugar, paga los **$7/mes por API en Render**.

---

## 2. Frontend Web (Tus 4 portales)

Tus 4 webs están en Vercel.

### Alternativas Profesionales
1. **Vercel (Capa Pro / Hobby):**
   - *Pros:* Es la plataforma número 1 del mundo para Next.js (el framework que usas). Su red global (CDN) hace que las páginas carguen en milisegundos.
   - *Consideración Legal:* La capa "Hobby" (gratuita) de Vercel está restringida a uso *no comercial*. Si DINAMYT genera dinero, los términos de Vercel exigen pasar al plan Pro (**$20/mes**).
2. **Cloudflare Pages:**
   - *Pros:* 100% gratuito, ultra rápido y **sí permite uso comercial** sin pagar el plan Pro.
   - *Contras:* Las Serverless Functions en Next.js a veces requieren ajustes menores (Edge runtime).

> 🏆 **Recomendación para el Frontend:** **Quédate en Vercel**. Es el ecosistema nativo de Next.js y el que menos dolores de cabeza te dará. Puedes empezar con la cuenta actual y, cuando la plataforma escale y empiece a generar ingresos, subir al plan Pro ($20/mes).

---

## 3. Base de Datos

Actualmente estás usando **Supabase** (Capa gratuita).

### Alternativas Profesionales
1. **Supabase Pro ($25/mes):**
   - *Pros:* Te quita los límites de conexiones (hasta 100,000 usuarios concurrentes), respaldos automáticos cada 24h, sin pausa por inactividad. Ya lo tienes configurado, funciona excelente.
2. **AWS RDS (PostgreSQL):**
   - *Pros:* El estándar de la industria corporativa. 
   - *Contras:* Muy difícil de configurar para principiantes, precios desde $15-$30/mes y no trae la gestión de usuarios (Auth) nativa de Supabase.

> 🏆 **Recomendación para la Base de Datos:** **Supabase Pro ($25/mes)**. Es la mejor inversión. No migres a otro lado; Supabase es extremadamente potente y moderno. Mantén la capa gratuita hasta que el volumen de tu club exceda los 500 MB de base de datos o sientas lentitud.

---

## 4. Dominios y Subdominios

Actualmente tus enlaces terminan en `.vercel.app` o `.onrender.com`. Un proyecto real **necesita un dominio propio** (ej. `dinamyt.com` o `dinamyt.app`).

### Alternativas Profesionales
- **Namecheap** o **Porkbun**: Compra tu dominio aquí (cuestan entre $10 y $15 al año). 
- **Cloudflare (DNS):** Una vez que compres el dominio, te recomiendo enlazarlo gratuitamente a Cloudflare para manejar la seguridad.

**Estructura recomendada (Tu Arquitectura Real):**
- Portal web: `portal.dinamyt.com`
- Academy web: `academy.dinamyt.com`
- Campeonatos web: `campeonatos.dinamyt.com`
- APIs: `api.dinamyt.com/ecosystem/...` (O simplemente dejar las APIs en los links genéricos de Railway/Render y ocultarlas del usuario final, ya que el usuario solo ve las webs).

> 🏆 **Recomendación:** Compra tu dominio en **Namecheap** o **Porkbun**. Vercel te permite conectar dominios comprados en otras plataformas con un par de clics (solo copiando unos registros en los DNS).

---

## 5. Correo Electrónico y SMTP (El bloqueador actual)

El correo es fundamental (Validar usuarios, restablecer contraseñas, facturas). Gmail no sirve para producción masiva.

### Alternativas Profesionales
1. **Resend (API):**
   - *Pros:* Extremadamente fácil de integrar en código. Te regalan **3,000 correos al mes gratis**. No usa el puerto SMTP, usa HTTP (por lo que nunca te lo bloqueará Render ni Railway). 
   - *Contras:* Debes verificar el dominio comprado (el del paso 4) para que tus correos no caigan en SPAM.
2. **SendGrid / Brevo:**
   - *Pros:* Los gigantes de la industria. Te dan SMTP clásico.
   - *Contras:* Más complejos de configurar.

> 🏆 **Recomendación para el Email:** **Resend.com**. 
> Es la "Alternativa Moderna" que te mencioné. Si tú compras tu dominio `dinamyt.com`, lo conectas a Resend. Yo modifico tu archivo `mailer.service.ts` para que, en lugar de usar `nodemailer`, envíe las peticiones a la API de Resend. Esto asegura que el correo **llegue siempre, al instante y nunca caiga en la carpeta de SPAM**.

---

## RESUMEN DE LA ARQUITECTURA IDEAL PARA DINAMYT:

- **Frontend:** Vercel
- **Backend:** Railway (o Render pago)
- **Base de Datos:** Supabase
- **Email:** Resend API
- **Dominio:** Namecheap (ej. `dinamyt.app`)
