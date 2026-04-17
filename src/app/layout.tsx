import type { Metadata } from "next";
import { Cormorant_Garamond, Space_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-cormorant-garamond",
  display: "swap"
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-space-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ORRERY — Astronomy Events",
  description: "Local astronomy event recommendations."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${cormorantGaramond.variable} ${spaceMono.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
