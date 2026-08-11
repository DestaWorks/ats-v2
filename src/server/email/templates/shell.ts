import "server-only";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Shared branded wrapper for every transactional email — table-based layout (not flexbox/grid),
 * every rule inlined, no external assets/fonts/images. Email clients (Outlook desktop's Word
 * rendering engine especially) don't reliably support modern CSS, so this deliberately stays to
 * the "bulletproof email" subset rather than reusing the app's own Tailwind/webfont setup.
 * `preheader` is the hidden snippet Gmail/Outlook show in the inbox list next to the subject —
 * without one, clients fall back to showing the first visible text (here, the greeting).
 *
 * The header band's `background-image` gradient matches the sign-in page's own dark background
 * (`(auth)/auth-shell.tsx`) exactly, not a hand-picked flat color — `background-color` is the
 * solid fallback for clients (Outlook desktop) that ignore `background-image`.
 */
export function emailShell(opts: { preheader: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>DestaHealth ATS</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2d2d2d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td style="background-color:#0a0a1a;background-image:linear-gradient(160deg,#0a0a1a 0%,#0f1628 40%,#151015 100%);border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;letter-spacing:3px;color:#8b7355;text-transform:uppercase;">Desta Works</p>
              <p style="margin:4px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#f8f6f1;">DestaHealth ATS</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #ececec;border-top:none;border-radius:0 0 10px 10px;padding:36px 32px;font-size:15px;line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;color:#9a9a9a;">
              Desta Works &middot; Healthcare Recruiting Pipeline<br>
              This is an automated message — please don't reply directly to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
