export async function sendInvitationEmail(email: string, organizationName: string, campaignName: string, joinLink: string, message?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[CloudSuite] Invitación pendiente de envío para ${email}: ${joinLink}`);
    return { sent: false, error: 'RESEND_API_KEY no está configurada.', joinLink };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? 'CloudSuite <onboarding@resend.dev>', to: [email], subject: 'Te invitaron a CloudSuite 2', html: `<h1>Te invitaron a CloudSuite 2</h1><p>Sumate a <strong>${campaignName}</strong> de ${organizationName}.</p>${message ? `<p>${message}</p>` : ''}<p><a href="${joinLink}">Aceptar invitación</a></p>` }) });
    if (!response.ok) throw new Error(await response.text());
    return { sent: true, joinLink };
  } catch (error) { console.error('[CloudSuite] Resend falló:', error); return { sent: false, error: error instanceof Error ? error.message : 'Error desconocido', joinLink }; }
}
