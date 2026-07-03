import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "DestaHealth ATS",
  description: "Applicant Tracking System for Desta Works — healthcare staffing & recruiting.",
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
