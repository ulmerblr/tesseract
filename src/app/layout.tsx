import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { VaultProvider } from "@/components/VaultProvider";
import { TopBar } from "@/components/TopBar";
import { ClipboardToast } from "@/components/ClipboardToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// For the Emergency Sheet only: a monospace face with a dotted/slashed zero and clearly
// different 1, l and I. next/font serves it from this app, so printing needs no internet.
const printMono = JetBrains_Mono({
  variable: "--font-print-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "TESSERACT — demo",
  description: "Click-through demo of the Tesseract password vault. Fake data only.",
};

export const viewport: Viewport = {
  themeColor: "#08080b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${printMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <VaultProvider>
          <TopBar />
          <div className="flex flex-1 flex-col">{children}</div>
          <ClipboardToast />
        </VaultProvider>
      </body>
    </html>
  );
}
