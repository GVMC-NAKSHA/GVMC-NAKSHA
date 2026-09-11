import { Injectable, Logger } from '@nestjs/common';

// Recipients' text fields (ticket notes, house numbers, ward names) come from user input —
// escape before interpolating into htmlContent so a crafted value can't inject markup/links
// into an outbound email.
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Transactional email via Brevo (SNS replacement — see final.md). Best-effort: a missing key,
// missing sender, or failed request must never fail the alert/ticket request that triggered it,
// so every failure path here logs and returns instead of throwing (same philosophy as
// LlmService's templated fallbacks).
@Injectable()
export class Brevo {
  private readonly log = new Logger(Brevo.name);

  async send(to: string[], subject: string, html: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!to.length) return;
    if (!apiKey || !senderEmail) {
      this.log.warn(`email skipped (BREVO_API_KEY/BREVO_SENDER_EMAIL not set): ${subject}`);
      return;
    }
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'GVMC Naksha' },
          to: to.map((email) => ({ email })),
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) this.log.warn(`Brevo send failed (${res.status}): ${await res.text()}`);
    } catch (e) {
      this.log.warn(`Brevo send error: ${e}`);
    }
  }
}
