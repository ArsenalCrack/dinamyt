import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Correo transaccional del ecosistema (OTP de verificación y recuperación).
 *
 * Configuración por variables de entorno:
 *  - Gmail (rápido):    MAIL_USER + MAIL_PASS (contraseña de aplicación).
 *  - SMTP genérico:     MAIL_HOST + MAIL_PORT (+ MAIL_USER/MAIL_PASS),
 *                       p. ej. Brevo, Resend, Mailgun o el SMTP de tu dominio.
 *  - Sin variables (dev): NO envía — imprime el código en la consola para que
 *    el registro local funcione sin cuenta de correo.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
    if (MAIL_HOST) {
      this.transporter = nodemailer.createTransport({
        host: MAIL_HOST,
        port: parseInt(MAIL_PORT ?? '587', 10),
        secure: MAIL_PORT === '465',
        auth: MAIL_USER ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
      });
    } else if (MAIL_USER && MAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: MAIL_USER, pass: MAIL_PASS },
      });
    } else {
      this.logger.warn(
        'MAIL_* sin configurar: los códigos OTP se imprimirán en esta consola (solo dev).',
      );
    }
  }

  async sendOtp(
    to: string,
    code: string,
    type: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
  ) {
    // Modo dev sin SMTP: el código sale por consola y el flujo no se rompe.
    if (!this.transporter) {
      this.logger.warn(`[DEV] OTP ${type} para ${to}: ${code}`);
      return;
    }

    const subject =
      type === 'EMAIL_VERIFY'
        ? 'DINAMYT — Verifica tu correo'
        : 'DINAMYT — Recupera tu contraseña';

    const message =
      type === 'EMAIL_VERIFY'
        ? `Tu código de verificación es: <b>${code}</b>. Expira en 10 minutos.`
        : `Tu código para restablecer tu contraseña es: <b>${code}</b>. Expira en 10 minutos.`;

    await this.transporter.sendMail({
      from: `"DINAMYT Ecosystem" <${process.env.MAIL_FROM ?? process.env.MAIL_USER}>`,
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #1B2A6B;">DINAMYT Ecosystem</h2>
          <p>${message}</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                      color: #1B2A6B; text-align: center; padding: 20px;">
            ${code}
          </div>
          <p style="color: #888; font-size: 12px;">
            Si no solicitaste esto, ignora este correo.
          </p>
        </div>
      `,
    });

    this.logger.log(`OTP enviado a ${to}`);
  }
}
