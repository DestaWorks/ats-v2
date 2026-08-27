import "server-only";
import nodemailer from "nodemailer";
import { AppError } from "../http/app-error";
import {
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_SECURE,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  emailEnabled,
} from "./config";

let cachedTransporter: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  cachedTransporter ??= nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return cachedTransporter;
}

/**
 * Send one email over the configured SMTP transport. Throws `FEATURE_DISABLED` if no transport is
 * configured, `UPSTREAM_ERROR` if the send itself fails — same two-error shape every other external
 * integration in this app uses (`server/ai/shared.ts`). Returns the Ethereal preview URL when the
 * configured transport is Ethereal (staging); `null` for a real provider, which has no such preview.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ previewUrl: string | null }> {
  if (!emailEnabled) {
    throw new AppError("FEATURE_DISABLED", "Email is not configured on this environment");
  }
  try {
    const info = await transporter().sendMail({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    return { previewUrl: previewUrl || null };
  } catch {
    // Never log the raw error (may echo the recipient address or SMTP transcript — PII).
    throw new AppError("UPSTREAM_ERROR", "Could not send the email — please try again");
  }
}
