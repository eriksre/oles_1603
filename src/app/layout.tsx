import type { Metadata, Viewport } from "next";
import { Orbitron, Sora } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-orbitron",
});

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Cosmic Weather",
  description: "Local cosmic weather and astronomy event recommendations."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030308"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${orbitron.variable} ${sora.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
