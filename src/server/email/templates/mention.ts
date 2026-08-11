import "server-only";
import { splitMentions } from "@/lib/mentions";
import { emailShell, type EmailContent } from "./shell";

/** First token of a full name ("Leliso Agegnehu" → "Leliso") — falls back to a generic
 *  greeting for a blank/whitespace-only name rather than rendering "Hi ,". */
function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

/** Escape the note excerpt for HTML embedding — UNLIKE the app's own render (React's escaped
 *  children), this text lands in a raw HTML string, and a note body is free-form user text (the
 *  most XSS-sensitive field in the app, D-3). The plain-text part needs no escaping. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EXCERPT_MAX = 300;

function excerptOf(body: string): string {
  return body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX - 1)}…` : body;
}

/** Highlights `@token`s the same way `splitMentions` styles mentions in-app — navy, the app's
 *  actual main color (`Button`'s default "primary" variant is `bg-navy`; `notes-tab.tsx` renders
 *  mention runs as `text-navy` React `<strong>`s). Every run (mention or not) is escaped
 *  individually before being joined back into the raw HTML string. */
function highlightMentions(text: string): string {
  return splitMentions(text)
    .map((seg) =>
      seg.mention
        ? `<strong style="color:#1e4a8a;">${escapeHtml(seg.text)}</strong>`
        : escapeHtml(seg.text),
    )
    .join("");
}

export function mentionEmail(opts: {
  name: string;
  authorName: string;
  candidateName: string;
  body: string;
  url: string;
}): EmailContent {
  const greeting = firstName(opts.name) ? `Hi ${firstName(opts.name)},` : "Hello,";
  const excerpt = excerptOf(opts.body);

  const html = emailShell({
    preheader: `${opts.authorName} mentioned you in a note on ${opts.candidateName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 20px;">
        <strong>${escapeHtml(opts.authorName)}</strong> mentioned you in a note on
        <strong>${escapeHtml(opts.candidateName)}</strong>:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;background-color:#f8f6f1;border-radius:6px;">
        <tr>
          <td style="padding:16px 20px;font-size:14px;line-height:1.6;white-space:pre-wrap;">
            ${highlightMentions(excerpt)}
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
        <tr>
          <td style="border-radius:6px;background-color:#8b7355;">
            <a href="${opts.url}" target="_blank" rel="noopener"
              style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#f8f6f1;text-decoration:none;border-radius:6px;">
              View note
            </a>
          </td>
        </tr>
      </table>
    `,
  });

  const text = `${greeting}

${opts.authorName} mentioned you in a note on ${opts.candidateName}:

${excerpt}

View note: ${opts.url}`;

  return { subject: `${opts.authorName} mentioned you on ${opts.candidateName}`, html, text };
}
