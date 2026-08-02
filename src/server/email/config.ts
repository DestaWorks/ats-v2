import "server-only";

/**
 * Provider-agnostic email config. Nodemailer talks plain SMTP, so swapping providers (Ethereal for
 * staging → a real SMTP provider for production — Gmail SMTP, SES, Postmark, Resend's SMTP
 * endpoint, …) is an env var change, never a code change. Mirrors the `AI_MODEL` pattern in
 * `server/ai/config.ts`. Keys live server-side only (STACK §13).
 */

export const EMAIL_HOST = process.env.EMAIL_HOST ?? "";
export const EMAIL_PORT = Number(process.env.EMAIL_PORT ?? 587);
/** Implicit TLS (port 465) vs STARTTLS (587/25) — most providers, incl. Ethereal, use STARTTLS. */
export const EMAIL_SECURE = process.env.EMAIL_SECURE === "true";
export const EMAIL_USER = process.env.EMAIL_USER ?? "";
export const EMAIL_PASS = process.env.EMAIL_PASS ?? "";
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "DestaHealth ATS <no-reply@desta.works>";

/** Email features (forgot-password, notifications, …) are enabled iff SMTP creds are present. */
export const emailEnabled: boolean = Boolean(EMAIL_HOST && EMAIL_USER && EMAIL_PASS);
