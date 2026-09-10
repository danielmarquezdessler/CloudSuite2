import { Resend } from 'resend';

const FROM = 'CloudSuite <notificaciones@app.politicfy.com>';
const LOGIN_URL = 'https://app.politicfy.com';

type EmailResult = { sent: boolean; id?: string; error?: string };
type EmailInput = { to: string; subject: string; html: string };
type WelcomeInput = { to: string; name: string; organizationName: string; campaignName?: string | null; loginUrl?: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

/**
 * Sends through Resend when configured. Delivery errors are returned to callers
 * so that business operations can succeed without losing their primary result.
 */
export async function sendEmail({ to, subject, html }: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[CloudSuite] Email pendiente para ${to}: RESEND_API_KEY no está configurada.`);
    return { sent: false, error: 'RESEND_API_KEY no está configurada.' };
  }

  try {
    const { data, error } = await new Resend(apiKey).emails.send({ from: FROM, to: [to], subject, html });
    if (error) throw new Error(error.message);
    return { sent: true, id: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`[CloudSuite] Resend falló al enviar a ${to}:`, message);
    return { sent: false, error: message };
  }
}

export async function sendWelcomeEmail({ to, name, organizationName, campaignName, loginUrl = LOGIN_URL }: WelcomeInput) {
  const safeName = escapeHtml(name);
  const safeOrganization = escapeHtml(organizationName);
  const safeCampaign = campaignName ? escapeHtml(campaignName) : null;
  const safeLoginUrl = escapeHtml(loginUrl);
  const assignment = safeCampaign ? `<p>Ya estás vinculado/a a la campaña <strong>${safeCampaign}</strong> de <strong>${safeOrganization}</strong>.</p>` : `<p>Tu cuenta fue creada en <strong>${safeOrganization}</strong>.</p>`;

  return sendEmail({
    to,
    subject: 'Bienvenido/a a CloudSuite — tu cuenta está lista',
    html: `<div style="font-family:Arial,sans-serif;color:#303030;max-width:600px;margin:0 auto;padding:24px"><h1 style="color:#0060F0;font-size:24px">Bienvenido/a a CloudSuite, ${safeName}</h1><p>Tu cuenta ya está lista para usar.</p>${assignment}<p>Ingresá con tu email y la contraseña que te compartió el administrador.</p><p style="margin:28px 0"><a href="${safeLoginUrl}" style="background:#0060F0;border-radius:6px;color:#fff;display:inline-block;padding:12px 20px;text-decoration:none">Iniciar sesión</a></p><hr style="border:0;border-top:1px solid #e6eaf0"><p style="color:#60708a;font-size:13px">CloudSuite — Gestión de campañas políticas</p></div>`
  });
}

export async function sendInvitationEmail(email: string, organizationName: string, campaignName: string, joinLink: string, message?: string) {
  const safeOrganization = escapeHtml(organizationName);
  const safeCampaign = escapeHtml(campaignName);
  const safeMessage = message?.trim() ? `<p>${escapeHtml(message.trim())}</p>` : '';
  const safeJoinLink = escapeHtml(joinLink);
  const result = await sendEmail({
    to: email,
    subject: 'Te invitaron a CloudSuite',
    html: `<div style="font-family:Arial,sans-serif;color:#303030;max-width:600px;margin:0 auto;padding:24px"><h1 style="color:#0060F0;font-size:24px">Te invitaron a CloudSuite</h1><p>Sumate a <strong>${safeCampaign}</strong> de <strong>${safeOrganization}</strong>.</p>${safeMessage}<p style="margin:28px 0"><a href="${safeJoinLink}" style="background:#0060F0;border-radius:6px;color:#fff;display:inline-block;padding:12px 20px;text-decoration:none">Aceptar invitación</a></p><p style="color:#60708a;font-size:13px">CloudSuite — Gestión de campañas políticas</p></div>`
  });
  return { ...result, joinLink };
}
