import nodemailer from 'nodemailer';

/**
 * Envío de correo **best-effort** (respaldo de las notificaciones Push). Si no hay
 * SMTP configurado (MAIL_*), no hace nada y devuelve false: nunca bloquea el flujo.
 */
export async function enviarCorreo(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const host = process.env.MAIL_HOST;
  if (!user && !host) return false;

  try {
    const transport = nodemailer.createTransport(
      host
        ? {
            host,
            port: Number(process.env.MAIL_PORT ?? 587),
            secure: process.env.MAIL_SECURE === 'true',
            auth: user ? { user, pass } : undefined,
          }
        : { service: 'gmail', auth: { user, pass } },
    );
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? user,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return true;
  } catch {
    return false;
  }
}
