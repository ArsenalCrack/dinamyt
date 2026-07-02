import nodemailer from 'nodemailer';

/**
 * Envío de correos "best effort": si no hay SMTP configurado (SMTP_HOST), las
 * invitaciones siguen funcionando solo in-app (el competidor las ve al entrar
 * con su cuenta). Nunca tumba la petición: un fallo de correo se loguea y ya.
 */
const smtpHost = process.env.SMTP_HOST;

const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;

export async function enviarCorreo(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'DINAMYT <no-reply@dinamyt.com>',
      ...opts,
    });
    return true;
  } catch (e) {
    console.error('[mailer] no se pudo enviar el correo:', e);
    return false;
  }
}

export function plantillaInvitacion(campeonato: string, webUrl: string): string {
  return `
  <div style="font-family:system-ui,Arial,sans-serif;background:#14141e;color:#f0f0f8;padding:32px;border-radius:12px">
    <h1 style="color:#f0b800;margin:0 0 8px">DINAMYT Campeonatos</h1>
    <p>Has sido invitado a competir en <strong>${campeonato}</strong>.</p>
    <p>Entra con tu cuenta DINAMYT para aceptar la invitación, elegir tus
    modalidades y completar tus datos:</p>
    <p><a href="${webUrl}/invitaciones"
      style="background:#f0b800;color:#14141e;padding:10px 20px;border-radius:8px;
      text-decoration:none;font-weight:bold">Ver mi invitación</a></p>
    <p style="color:#9090b0;font-size:12px">Si no tienes cuenta, regístrate con
    este mismo correo para ver la invitación.</p>
  </div>`;
}
