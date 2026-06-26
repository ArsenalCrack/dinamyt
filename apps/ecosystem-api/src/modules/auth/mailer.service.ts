import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendOtp(
    to: string,
    code: string,
    type: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
  ) {
    const subject =
      type === 'EMAIL_VERIFY'
        ? 'DINAMYT — Verifica tu correo'
        : 'DINAMYT — Recupera tu contraseña';

    const message =
      type === 'EMAIL_VERIFY'
        ? `Tu código de verificación es: <b>${code}</b>. Expira en 10 minutos.`
        : `Tu código para restablecer tu contraseña es: <b>${code}</b>. Expira en 10 minutos.`;

    await this.transporter.sendMail({
      from: `"DINAMYT Ecosystem" <${process.env.MAIL_USER}>`,
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
