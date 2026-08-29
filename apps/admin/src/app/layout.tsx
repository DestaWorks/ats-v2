import type { Metadata, Viewport } from "next";
import "./request-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "DestaWorks Platform Console",
  description: "Operate the DestaWorks installation: tenants, health and platform metrics.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
