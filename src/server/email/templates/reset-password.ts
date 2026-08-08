import "server-only";
import { emailShell, type EmailContent } from "./shell";

/** First token of a full name ("Leliso Agegnehu" → "Leliso") — falls back to a generic
 *  greeting for a blank/whitespace-only name rather than rendering "Hi ,". */
function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

export function resetPasswordEmail(opts: { name: string; url: string }): EmailContent {
  const greeting = firstName(opts.name) ? `Hi ${firstName(opts.name)},` : "Hello,";

  const html = emailShell({
    preheader: "Reset your DestaHealth ATS password — this link expires in 1 hour.",
    bodyHtml: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 24px;">
        We received a request to reset the password for your DestaHealth ATS account. Click the
        button below to choose a new one.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:6px;background-color:#8b7355;">
            <a href="${opts.url}" target="_blank" rel="noopener"
              style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#f8f6f1;text-decoration:none;border-radius:6px;">
              Reset your password
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#6b6b6b;font-size:13px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
        <a href="${opts.url}" target="_blank" rel="noopener" style="color:#1e4a8a;">${opts.url}</a>
      </p>
      <p style="margin:0;color:#6b6b6b;font-size:13px;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely
        ignore this email — your password won't be changed.
      </p>
    `,
  });

  const text = `${greeting}

We received a request to reset the password for your DestaHealth ATS account.

Reset your password: ${opts.url}

This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't be changed.`;

  return { subject: "Reset your DestaHealth ATS password", html, text };
}
