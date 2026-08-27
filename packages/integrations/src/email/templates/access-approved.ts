import "server-only";
import { emailShell, type EmailContent } from "./shell";

/** First token of a full name ("Leliso Agegnehu" → "Leliso") — falls back to a generic
 *  greeting for a blank/whitespace-only name rather than rendering "Hi ,". */
function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

export function accessApprovedEmail(opts: {
  name: string;
  email: string;
  temporaryPassword: string;
  signInUrl: string;
}): EmailContent {
  const greeting = firstName(opts.name) ? `Hi ${firstName(opts.name)},` : "Hello,";

  const html = emailShell({
    preheader: "Your DestaHealth ATS access request was approved — here's how to sign in.",
    bodyHtml: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 24px;">
        Your request for access to DestaHealth ATS has been approved. Here's a temporary
        password to sign in with — you can change it any time from My Profile once you're in.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background-color:#f8f6f1;border-radius:6px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#6b6b6b;text-transform:uppercase;">Email</p>
            <p style="margin:0 0 12px;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;">${opts.email}</p>
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#6b6b6b;text-transform:uppercase;">Temporary password</p>
            <p style="margin:0;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;">${opts.temporaryPassword}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="border-radius:6px;background-color:#8b7355;">
            <a href="${opts.signInUrl}" target="_blank" rel="noopener"
              style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#f8f6f1;text-decoration:none;border-radius:6px;">
              Sign in to DestaHealth ATS
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#6b6b6b;font-size:13px;">
        If you weren't expecting this, you can ignore this email — the account won't be usable
        without this password.
      </p>
    `,
  });

  const text = `${greeting}

Your request for access to DestaHealth ATS has been approved.

Email: ${opts.email}
Temporary password: ${opts.temporaryPassword}

Sign in: ${opts.signInUrl}

You can change your password any time from My Profile once you're in. If you weren't expecting this, you can ignore this email — the account won't be usable without this password.`;

  return { subject: "Your DestaHealth ATS access request was approved", html, text };
}
