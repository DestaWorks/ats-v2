import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "DestaHealth ATS",
  description: "Applicant Tracking System for Desta Works — healthcare staffing & recruiting.",
};

/**
 * Light-only app: the `color-scheme` META (rendered in <head>, honored before CSS) keeps NATIVE
 * UI — select popups, date pickers, scrollbars — light even when the OS is in dark mode.
 */
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* App-wide toasts (Sonner). Use toast.success/error for all user feedback. */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
