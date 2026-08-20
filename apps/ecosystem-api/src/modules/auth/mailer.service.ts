import { Injectable, Logger } from '@nestjs/common';
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
  private async enviar(para: string, asunto: string, html: string): Promise<boolean> {
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
      });
      this.enviadosHoy += 1;
      this.logger.log(`Enviado «${asunto}» a ${para} (${this.enviadosHoy}/${this.topeDiario} hoy)`);
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

  // ── Plantillas ────────────────────────────────────────────────────────────

  private static plantilla(titulo: string, cuerpo: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #1B2A6B;">DINAMYT</h2>
        <h3 style="color: #1B2A6B; font-weight: normal;">${titulo}</h3>
        ${cuerpo}
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          Si no esperabas este correo, ignóralo.
        </p>
      </div>
    `;
  }

  private static boton(enlace: string, texto: string): string {
    return `
      <p style="text-align: center; margin: 28px 0;">
        <a href="${enlace}"
           style="background: #1B2A6B; color: #fff; text-decoration: none;
                  padding: 12px 24px; border-radius: 8px; font-weight: bold;">
          ${texto}
        </a>
      </p>
      <p style="color: #888; font-size: 12px; word-break: break-all;">
        Si el botón no funciona, copia esta dirección en tu navegador:<br>${enlace}
      </p>
    `;
  }

  /** Código de un solo uso: verificar el correo o recuperar la contraseña. */
  async sendOtp(
    to: string,
    code: string,
    type: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
  ): Promise<boolean> {
    if (!this.transporter) {
      // Sin proveedor, el código sale por el registro: en desarrollo el flujo
      // completo sigue siendo probable sin cuenta de correo.
      this.logger.warn(`[SIN CORREO] OTP ${type} para ${to}: ${code}`);
      return false;
    }

    const esVerificacion = type === 'EMAIL_VERIFY';
    return this.enviar(
      to,
      esVerificacion ? 'DINAMYT — Verifica tu correo' : 'DINAMYT — Recupera tu contraseña',
      MailerService.plantilla(
        esVerificacion ? 'Verifica tu correo' : 'Recupera tu contraseña',
        `<p>Tu código es válido durante 10 minutos.</p>
         <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                     color: #1B2A6B; text-align: center; padding: 20px;">${code}</div>`,
      ),
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

    return this.enviar(
      to,
      `DINAMYT — ${club} te está esperando`,
      MailerService.plantilla(
        'Tu cuenta de DINAMYT ya está creada',
        `<p><b>${club}</b> te dio de alta. Solo falta que pongas tu contraseña.</p>
         ${MailerService.boton(enlace, 'Poner mi contraseña')}
         <p style="color:#888; font-size:12px;">El enlace vence en ${dias} días.</p>`,
      ),
    );
  }
}
