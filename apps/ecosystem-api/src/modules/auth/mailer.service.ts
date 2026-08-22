import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as nodemailer from 'nodemailer';

/**
 * Correo transaccional del ecosistema.
 *
 * ── EL CONTRATO DE VARIABLES (§5.3 del plan maestro) ────────────────────────
 *
 *   SMTP_HOST=smtp.resend.com
 *   SMTP_PORT=587
 *   SMTP_USER=resend
 *   SMTP_PASS=                  la API key del proveedor
 *   MAIL_FROM=DINAMYT <no-reply@dinamyt.org>
 *   MAIL_REPLY_TO=soporte@dinamyt.org
 *   MAIL_DAILY_MAX=90           tope propio, por debajo del del proveedor
 *   PORTAL_URL=https://dinamyt.org   se usa en los enlaces del pie
 *
 * Es SMTP y no el SDK de nadie: Resend y Amazon SES hablan los dos SMTP, así
 * que cambiar de proveedor son cuatro variables y ni una línea de código.
 *
 * ── SIN `SMTP_HOST`, LA FUNCIÓN DE CORREO NO EXISTE ─────────────────────────
 *
 * No se rompe: no existe. Es el mismo criterio que ya usan las apps con el SSO
 * y con `CRON_SECRET`, y es lo que permite que el ecosistema esté en producción
 * desde el 20 de agosto sin proveedor de correo contratado. Quien llama recibe
 * un `false` y decide qué hacer — la invitación del maestro, por ejemplo,
 * devuelve el enlace para que lo mande por WhatsApp.
 *
 * ── EL TOPE SE CUENTA AQUÍ, NO EN EL PROVEEDOR ──────────────────────────────
 *
 * Si Resend rechaza el correo 101 el fallo es silencioso y nadie se entera
 * hasta que alguien reclama. Con el tope propio, el envío 91 no sale y queda
 * escrito en el registro con esas palabras.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  /** Envíos de hoy. Se reinicia solo al cambiar el día. */
  private enviadosHoy = 0;
  private diaDelContador = MailerService.hoy();

  constructor() {
    const host = process.env.SMTP_HOST ?? process.env.MAIL_HOST;
    const puerto = parseInt(
      process.env.SMTP_PORT ?? process.env.MAIL_PORT ?? '587',
      10,
    );
    const usuario = process.env.SMTP_USER ?? process.env.MAIL_USER;
    const clave = process.env.SMTP_PASS ?? process.env.MAIL_PASS;

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: puerto,
        secure: puerto === 465,
        auth: usuario ? { user: usuario, pass: clave } : undefined,
      });
      this.logger.log(`Correo por SMTP: ${host}:${puerto}`);
    } else {
      this.logger.warn(
        'SMTP_HOST sin configurar: el ecosistema NO envía correos. ' +
          'Los códigos salen por este registro y las invitaciones devuelven el enlace.',
      );
    }
  }

  /** `true` si hay un servidor SMTP configurado. */
  habilitado(): boolean {
    return this.transporter !== null;
  }

  private static hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private get topeDiario(): number {
    return parseInt(process.env.MAIL_DAILY_MAX ?? '90', 10);
  }

  /** ¿Queda cupo hoy? Reinicia el contador si cambió el día. */
  private hayCupo(): boolean {
    const hoy = MailerService.hoy();
    if (hoy !== this.diaDelContador) {
      this.diaDelContador = hoy;
      this.enviadosHoy = 0;
    }
    return this.enviadosHoy < this.topeDiario;
  }

  /**
   * Manda un correo. Devuelve `false` —sin lanzar— cuando no hay proveedor o
   * se agotó el cupo del día: quien llama sabe si llegó y decide qué contarle
   * a la persona.
   */
  private async enviar(
    para: string,
    asunto: string,
    html: string,
    texto: string,
  ): Promise<boolean> {
    if (!this.transporter) return false;

    if (!this.hayCupo()) {
      this.logger.error(
        `Tope diario de correo alcanzado (${this.topeDiario}). No se envió «${asunto}» a ${para}.`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'DINAMYT <no-reply@dinamyt.org>',
        replyTo: process.env.MAIL_REPLY_TO,
        to: para,
        subject: asunto,
        html,
        // La versión de texto no es un adorno: sin ella los filtros de spam
        // puntúan peor el correo, y hay clientes (relojes, lectores de
        // pantalla en modo texto) que no pintan HTML.
        text: texto,
        attachments: MailerService.adjuntos(),
      });
      this.enviadosHoy += 1;
      this.logger.log(
        `Enviado «${asunto}» a ${para} (${this.enviadosHoy}/${this.topeDiario} hoy)`,
      );
      return true;
    } catch (err) {
      // Un correo que no sale no puede tumbar el registro ni la invitación:
      // se anota y quien llama decide.
      this.logger.error(
        `Falló el envío de «${asunto}» a ${para}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LA PLANTILLA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ── Por qué tablas y estilos en línea, en 2026 ──
  //
  // Porque Outlook de escritorio sigue pintando el HTML con el motor de Word:
  // sin `flex`, sin `grid`, sin `<style>` en el `<head>` que sobreviva, y sin
  // la mitad de las propiedades de caja. Un correo hecho como una página web
  // se ve bien en la pantalla de quien lo escribe y roto en el buzón de medio
  // club. Las tablas anidadas con `bgcolor` son feas de leer y son lo único
  // que se ve igual en todas partes.
  //
  // ── Por qué el logo va ADJUNTO y no enlazado ──
  //
  // Un `<img src="https://dinamyt.org/logo.png">` depende de que el cliente se
  // baje imágenes remotas, y Outlook y Thunderbird no lo hacen hasta que la
  // persona pulsa «descargar imágenes». El correo que abre el alumno es
  // justamente el que lleva su código de verificación: el peor momento para
  // que la marca aparezca como un cuadro roto. Adjunto con `cid:` viaja dentro
  // del mensaje y se pinta siempre.
  //
  // Si el archivo no está (una compilación sin `assets`, ver `nest-cli.json`),
  // no se rompe nada: no hay adjunto y queda el nombre en letra dorada.

  /** El escudo, leído una sola vez y guardado en memoria. `null` si no está. */
  private static logoEnMemoria: Buffer | null | undefined;

  private static logo(): Buffer | null {
    if (MailerService.logoEnMemoria !== undefined) {
      return MailerService.logoEnMemoria;
    }
    // `__dirname` es `dist/modules/auth` compilado y `src/modules/auth` bajo
    // ts-jest. Las dos rutas suben lo mismo, y el archivo existe en las dos.
    const ruta = join(__dirname, '..', '..', 'assets', 'logo-dinamyt.png');
    try {
      MailerService.logoEnMemoria = existsSync(ruta)
        ? readFileSync(ruta)
        : null;
    } catch {
      MailerService.logoEnMemoria = null;
    }
    if (!MailerService.logoEnMemoria) {
      new Logger(MailerService.name).warn(
        `No se encontró el escudo para los correos en ${ruta}: saldrán sin logo.`,
      );
    }
    return MailerService.logoEnMemoria;
  }

  private static readonly CID_LOGO = 'escudo-dinamyt';

  private static adjuntos(): nodemailer.SendMailOptions['attachments'] {
    const logo = MailerService.logo();
    if (!logo) return undefined;
    return [
      {
        filename: 'dinamyt.png',
        content: logo,
        cid: MailerService.CID_LOGO,
        // `inline` y no `attachment`: así no sale como archivo adjunto al pie
        // del mensaje, que es lo que hace que un correo parezca sospechoso.
        contentDisposition: 'inline',
      },
    ];
  }

  /** La paleta, la misma de `globals.css` de las tres webs. */
  private static readonly C = {
    fondo: '#0e0e15',
    tarjeta: '#15151f',
    elevado: '#1d1d2a',
    borde: '#262635',
    texto: '#f3f1e8',
    tenue: '#a19db8',
    oro: '#f0b800',
    oroApagado: '#c99a00',
    accion: '#1f8f63',
    accionTexto: '#eafff4',
  };

  private static portal(): string {
    return (process.env.PORTAL_URL ?? 'https://dinamyt.org').replace(
      /\/+$/,
      '',
    );
  }

  private static soporte(): string {
    return process.env.MAIL_REPLY_TO ?? 'soporte@dinamyt.org';
  }

  /** Un `<` en el nombre de alguien no puede convertirse en etiqueta HTML. */
  private static escapar(valor: string): string {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * El armazón de todos los correos.
   *
   * @param etiqueta  La línea pequeña de arriba («Verificación de correo»).
   *                  Dice de qué va el mensaje antes de leer nada.
   * @param titulo    El titular.
   * @param avance    Lo que enseña el buzón junto al asunto, antes de abrirlo.
   *                  Sin esto, la lista de correos enseña el primer texto que
   *                  encuentre — que suele ser «Si no esperabas este correo».
   * @param saludo    Nombre de quien recibe, si se sabe. Un correo que sabe tu
   *                  nombre se distingue a simple vista de uno de pesca.
   * @param cuerpo    El HTML del centro.
   * @param pie       Una línea extra bajo el cuerpo (por qué te llegó esto).
   */
  private static plantilla({
    etiqueta,
    titulo,
    avance,
    saludo,
    cuerpo,
    pie,
  }: {
    etiqueta: string;
    titulo: string;
    avance: string;
    saludo?: string | null;
    cuerpo: string;
    pie?: string;
  }): string {
    const C = MailerService.C;
    const portal = MailerService.portal();
    const anio = new Date().getFullYear();
    const logo = MailerService.logo();

    const escudo = logo
      ? `<img src="cid:${MailerService.CID_LOGO}" width="56" height="56" alt="DINAMYT"
             style="display:block; border:0; width:56px; height:56px; border-radius:14px;">`
      : `<div style="width:56px; height:56px; border-radius:14px; background:${C.elevado};
                     border:1px solid ${C.oroApagado};"></div>`;

    const nombre = saludo ? MailerService.escapar(saludo) : null;

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${MailerService.escapar(titulo)}</title>
</head>
<body style="margin:0; padding:0; background:${C.fondo}; color:${C.texto};
             font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- El avance del buzón: se lee en la lista de correos y no se ve al abrir. -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
  ${MailerService.escapar(avance)}
  &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${C.fondo}" style="background:${C.fondo};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px; width:100%;">

        <!-- ── Cabecera: el escudo y el nombre ──────────────────────────── -->
        <tr>
          <td align="center" style="padding:0 0 22px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;">${escudo}</td>
                <td style="font-size:26px; font-weight:800; letter-spacing:3px;
                           color:${C.oro}; text-transform:uppercase;">DINAMYT</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── La tarjeta ───────────────────────────────────────────────── -->
        <tr>
          <td bgcolor="${C.tarjeta}"
              style="background:${C.tarjeta}; border:1px solid ${C.borde};
                     border-radius:16px; padding:0;">

            <!-- Filo dorado: la firma de la marca, y en Outlook una tabla de
                 3px de alto es lo único que se pinta igual que un borde. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="${C.oro}"
                    style="background:${C.oro}; height:3px; line-height:3px;
                           font-size:0; border-radius:16px 16px 0 0;">&nbsp;</td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:28px 28px 8px 28px;">
                  <p style="margin:0 0 10px 0; font-size:11px; font-weight:700;
                            letter-spacing:2px; text-transform:uppercase;
                            color:${C.oroApagado};">${MailerService.escapar(etiqueta)}</p>
                  <h1 style="margin:0; font-size:22px; line-height:1.25; font-weight:700;
                             color:${C.texto};">${MailerService.escapar(titulo)}</h1>
                  ${
                    nombre
                      ? `<p style="margin:14px 0 0 0; font-size:15px; color:${C.texto};">Hola, ${nombre}.</p>`
                      : ''
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:6px 28px 28px 28px; font-size:15px; line-height:1.6;
                           color:${C.texto};">
                  ${cuerpo}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Pie ──────────────────────────────────────────────────────── -->
        <tr>
          <td style="padding:22px 12px 0 12px; font-size:12px; line-height:1.65;
                     color:${C.tenue};" align="center">
            ${pie ? `<p style="margin:0 0 10px 0;">${pie}</p>` : ''}
            <p style="margin:0 0 10px 0;">
              Este mensaje se envía solo, desde un buzón que no lee nadie.
              ¿Necesitas ayuda? Escribe a
              <a href="mailto:${MailerService.soporte()}"
                 style="color:${C.oro}; text-decoration:none;">${MailerService.soporte()}</a>.
            </p>
            <p style="margin:0 0 10px 0;">
              <a href="${portal}" style="color:${C.tenue}; text-decoration:underline;">DINAMYT</a>
              &nbsp;·&nbsp;
              <a href="${portal}/privacidad" style="color:${C.tenue}; text-decoration:underline;">Privacidad</a>
            </p>
            <p style="margin:0; color:${C.borde};">
              &copy; ${anio} DINAMYT — Membresías, Campeonatos y Academy.
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
  }

  /** El código, grande, espaciado y seleccionable de un toque. */
  private static bloqueCodigo(code: string): string {
    const C = MailerService.C;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:20px 0;">
        <tr>
          <td align="center" bgcolor="${C.elevado}"
              style="background:${C.elevado}; border:1px solid ${C.oroApagado};
                     border-radius:12px; padding:18px 12px;">
            <div style="font-family:'Courier New',Consolas,monospace; font-size:34px;
                        font-weight:700; letter-spacing:10px; color:${C.oro};
                        text-indent:10px;">${MailerService.escapar(code)}</div>
          </td>
        </tr>
      </table>`;
  }

  private static boton(enlace: string, texto: string): string {
    const C = MailerService.C;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:24px 0 12px 0;">
        <tr>
          <td align="center">
            <a href="${enlace}"
               style="display:inline-block; background:${C.accion}; color:${C.accionTexto};
                      text-decoration:none; padding:14px 30px; border-radius:10px;
                      font-size:15px; font-weight:700;">${MailerService.escapar(texto)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:12px; color:${C.tenue}; word-break:break-all;">
        ¿El botón no hace nada? Copia esta dirección en tu navegador:<br>
        <span style="color:${C.oroApagado};">${enlace}</span>
      </p>`;
  }

  /** Una lista de «qué vas a poder hacer», con vistos dorados. */
  private static lista(puntos: string[]): string {
    const C = MailerService.C;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:18px 0 4px 0;">
        ${puntos
          .map(
            (p) => `<tr>
          <td valign="top" width="22" style="padding:4px 0; color:${C.oro}; font-size:15px;">&#10003;</td>
          <td style="padding:4px 0; font-size:14px; line-height:1.5; color:${C.tenue};">${p}</td>
        </tr>`,
          )
          .join('')}
      </table>`;
  }

  /** Un recuadro de aviso, para lo que no puede pasar desapercibido. */
  private static aviso(texto: string): string {
    const C = MailerService.C;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:18px 0 0 0;">
        <tr>
          <td bgcolor="${C.elevado}"
              style="background:${C.elevado}; border-left:3px solid ${C.oro};
                     border-radius:0 8px 8px 0; padding:12px 14px; font-size:13px;
                     line-height:1.55; color:${C.tenue};">${texto}</td>
        </tr>
      </table>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LOS CORREOS
  // ══════════════════════════════════════════════════════════════════════════

  /** Código de un solo uso: verificar el correo o recuperar la contraseña. */
  async sendOtp(
    to: string,
    code: string,
    type: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
    nombre?: string | null,
  ): Promise<boolean> {
    if (!this.transporter) {
      // Sin proveedor, el código sale por el registro: en desarrollo el flujo
      // completo sigue siendo probable sin cuenta de correo.
      this.logger.warn(`[SIN CORREO] OTP ${type} para ${to}: ${code}`);
      return false;
    }

    const esVerificacion = type === 'EMAIL_VERIFY';
    // El primer nombre basta y sobra: «Hola, ANA» se lee mejor que el nombre
    // completo en mayúsculas, que es como se guarda en las tres apps.
    const saludo = (nombre ?? '').trim().split(/\s+/)[0] || null;

    const asunto = esVerificacion
      ? `${code} es tu código de DINAMYT`
      : `${code} — recupera tu contraseña de DINAMYT`;

    const cuerpo = esVerificacion
      ? `<p style="margin:0;">Estás creando tu cuenta de DINAMYT. Escribe este código
           en la pantalla que dejaste abierta para terminar:</p>
         ${MailerService.bloqueCodigo(code)}
         <p style="margin:0; font-size:13px; color:${MailerService.C.tenue};">
           Vence en 10 minutos. Tu cuenta todavía <b>no existe</b>: se crea justo
           cuando tecleas el código.
         </p>
         ${MailerService.lista([
           'Una sola cuenta para <b>Membresías</b>, <b>Campeonatos</b> y <b>Academy</b>.',
           'Tu maestro te acepta en el club y tu ficha nace sola.',
           'Tus datos —foto, cinturón, contacto de emergencia— se escriben una vez.',
         ])}`
      : `<p style="margin:0;">Alguien pidió recuperar la contraseña de esta cuenta.
           Si fuiste tú, escribe este código en la pantalla de recuperación:</p>
         ${MailerService.bloqueCodigo(code)}
         <p style="margin:0; font-size:13px; color:${MailerService.C.tenue};">
           Vence en 10 minutos y sirve una sola vez.
         </p>
         ${MailerService.aviso(
           'La contraseña de DINAMYT es <b>la misma</b> para el portal y para tu club en Membresías. Al cambiarla aquí, cambia en las dos.',
         )}`;

    const texto = esVerificacion
      ? `DINAMYT — Verifica tu correo\n\nTu código es: ${code}\n\nVence en 10 minutos. Tu cuenta se crea cuando lo escribas.\n\nSi no esperabas este correo, ignóralo.\n${MailerService.portal()}`
      : `DINAMYT — Recupera tu contraseña\n\nTu código es: ${code}\n\nVence en 10 minutos y sirve una sola vez.\n\nSi no lo pediste, ignora este correo: tu contraseña no ha cambiado.\n${MailerService.portal()}`;

    return this.enviar(
      to,
      asunto,
      MailerService.plantilla({
        etiqueta: esVerificacion
          ? 'Verificación de correo'
          : 'Recuperar contraseña',
        titulo: esVerificacion
          ? 'Tu código para entrar'
          : 'Tu código de recuperación',
        avance: `Tu código es ${code}. Vence en 10 minutos.`,
        saludo,
        cuerpo,
        pie: esVerificacion
          ? 'Recibes esto porque alguien usó este correo para crear una cuenta en DINAMYT. Si no fuiste tú, ignóralo: sin el código no se crea nada.'
          : 'Recibes esto porque alguien pidió recuperar la contraseña de esta cuenta. Si no fuiste tú, ignóralo: tu contraseña no ha cambiado.',
      }),
      texto,
    );
  }

  /**
   * Invitación del maestro (camino B, §2.1): la cuenta ya existe y no tiene
   * contraseña; este enlace es lo único que hace falta para ponerla.
   */
  async enviarInvitacion(
    to: string,
    enlace: string,
    club: string,
    dias: number,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`[SIN CORREO] Invitación para ${to}: ${enlace}`);
      return false;
    }

    const nombreClub = MailerService.escapar(club);

    return this.enviar(
      to,
      `${club} te dio de alta en DINAMYT`,
      MailerService.plantilla({
        etiqueta: 'Tu cuenta ya está creada',
        titulo: `${club} te está esperando`,
        avance: `Tu cuenta ya existe. Solo falta que pongas tu contraseña.`,
        cuerpo: `
          <p style="margin:0;"><b>${nombreClub}</b> te dio de alta en DINAMYT. Tu cuenta
            ya existe y tu ficha también: lo único que falta es tu contraseña.</p>
          ${MailerService.boton(enlace, 'Poner mi contraseña')}
          ${MailerService.lista([
            'Consulta los horarios, la sede y el contacto de tu club.',
            'Mira tu estado de pagos y tu asistencia en <b>Membresías</b>.',
            'Inscríbete a campeonatos sin volver a teclear tus datos.',
          ])}
          ${MailerService.aviso(
            `El enlace vence en <b>${dias} días</b>. Si se te pasa, pídele a tu maestro que te lo mande otra vez.`,
          )}`,
        pie: `Recibes esto porque ${nombreClub} usó este correo para darte de alta. Si no conoces ese club, ignora el mensaje: sin poner contraseña, nadie entra a la cuenta.`,
      }),
      `DINAMYT — ${club} te dio de alta\n\nTu cuenta ya existe. Pon tu contraseña aquí:\n${enlace}\n\nEl enlace vence en ${dias} días.\n${MailerService.portal()}`,
    );
  }

  /**
   * Invitación a un club para quien YA tiene cuenta.
   *
   * ── Por qué es distinta de `enviarInvitacion` ──
   *
   * Aquella crea la cuenta y manda la llave para ponerle contraseña: quien la
   * recibe no ha decidido nada, y no podía —no tenía dónde—. Esta es lo
   * contrario: la persona ya tiene cuenta, la decisión es SUYA, y el correo
   * solo la avisa. Lo que hay que aceptar o rechazar vive en el portal, no en
   * el enlace: un botón «aceptar» dentro de un correo mete a alguien en un club
   * con solo reenviar el mensaje a quien no debe.
   */
  async enviarInvitacionAClub(
    to: string,
    club: string,
    rol: string,
    invitadoPor: string | null,
    nombre?: string | null,
  ): Promise<boolean> {
    const enlace = `${MailerService.portal()}/dashboard`;
    if (!this.transporter) {
      this.logger.warn(`[SIN CORREO] Invitación de ${club} para ${to}`);
      return false;
    }

    const nombreClub = MailerService.escapar(club);
    const quien = invitadoPor ? MailerService.escapar(invitadoPor) : null;
    const saludo = (nombre ?? '').trim().split(/\s+/)[0] || null;

    return this.enviar(
      to,
      `${club} te invita a su club en DINAMYT`,
      MailerService.plantilla({
        etiqueta: 'Invitación a un club',
        titulo: `${club} quiere sumarte`,
        avance: `Entra a DINAMYT para aceptar o rechazar la invitación de ${club}.`,
        saludo,
        cuerpo: `
          <p style="margin:0;">
            ${quien ? `<b>${quien}</b>, de <b>${nombreClub}</b>,` : `<b>${nombreClub}</b>`}
            te invitó a entrar al club como <b>${MailerService.escapar(rol)}</b>.
          </p>
          <p style="margin:14px 0 0 0;">
            <b>Nadie te ha metido en ningún sitio.</b> La invitación está esperando
            en tu cuenta y decides tú: entra a DINAMYT y acéptala o recházala.
          </p>
          ${MailerService.boton(enlace, 'Ver la invitación')}
          ${MailerService.lista([
            'Si la aceptas, tu ficha del club nace sola en <b>Membresías</b>.',
            'Si la rechazas, no pasa nada más y el club se entera.',
            'Puedes decidirlo cuando quieras: la invitación te espera.',
          ])}`,
        pie: `Recibes esto porque ${nombreClub} invitó a este correo. Si no conoces ese club, entra y recházala — o simplemente ignora el mensaje.`,
      }),
      `DINAMYT — ${club} te invita a su club\n\n${quien ? `${invitadoPor}, de ${club},` : club} te invitó como ${rol}.\n\nEntra a DINAMYT para aceptarla o rechazarla:\n${enlace}\n\nNadie te ha metido en ningún club: la decisión es tuya.`,
    );
  }

  /**
   * El maestro respondió a quien pidió entrar con el código del club.
   *
   * Cierra el bucle que quedaba abierto: quien tecleaba el código veía «te
   * avisamos cuando tu maestro la acepte» y ese aviso no existía en ninguna
   * parte. La persona tenía que volver a entrar al portal a probar suerte.
   */
  async avisarSolicitudResuelta(
    to: string,
    club: string,
    aceptada: boolean,
    nombre?: string | null,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `[SIN CORREO] Solicitud de ${to} a ${club}: ${aceptada ? 'aceptada' : 'rechazada'}`,
      );
      return false;
    }

    const enlace = `${MailerService.portal()}/dashboard`;
    const nombreClub = MailerService.escapar(club);
    const saludo = (nombre ?? '').trim().split(/\s+/)[0] || null;

    const cuerpo = aceptada
      ? `<p style="margin:0;">Tu maestro aceptó tu solicitud: <b>ya eres parte de
           ${nombreClub}</b>.</p>
         ${MailerService.boton(enlace, 'Entrar a DINAMYT')}
         ${MailerService.lista([
           'Tu ficha del club se crea sola la primera vez que entres a <b>Membresías</b>.',
           'En «Mi club» tienes la sede, los horarios y a quién escribirle.',
           'Tu cinturón y tus datos los mantiene tu maestro desde el portal.',
         ])}
         ${MailerService.aviso(
           'Si ya tenías DINAMYT abierto, <b>vuelve a entrar</b> para que tu sesión se entere de tu club nuevo.',
         )}`
      : `<p style="margin:0;">Tu solicitud para entrar a <b>${nombreClub}</b> no fue
           aceptada.</p>
         <p style="margin:14px 0 0 0;">Casi siempre es un código que ya no estaba
           vigente o una confusión de club. Habla con tu maestro y, si te da un
           código nuevo, puedes volver a pedirlo cuando quieras.</p>
         ${MailerService.boton(enlace, 'Volver a DINAMYT')}`;

    return this.enviar(
      to,
      aceptada
        ? `Ya eres parte de ${club}`
        : `Tu solicitud a ${club} no fue aceptada`,
      MailerService.plantilla({
        etiqueta: aceptada ? 'Solicitud aceptada' : 'Solicitud rechazada',
        titulo: aceptada ? `Bienvenido a ${club}` : 'Tu solicitud no siguió',
        avance: aceptada
          ? `${club} te aceptó. Entra a DINAMYT para verlo.`
          : `${club} no aceptó tu solicitud.`,
        saludo,
        cuerpo,
        pie: `Recibes esto porque pediste entrar a ${nombreClub} con su código.`,
      }),
      aceptada
        ? `DINAMYT — Ya eres parte de ${club}\n\nTu maestro aceptó tu solicitud.\n\nSi ya tenías DINAMYT abierto, vuelve a entrar para que tu sesión se entere.\n${enlace}`
        : `DINAMYT — Tu solicitud a ${club} no fue aceptada\n\nHabla con tu maestro: con un código nuevo puedes volver a pedirlo.\n${enlace}`,
    );
  }
}
