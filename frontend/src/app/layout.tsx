import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { MainNav } from "@/components/main-nav";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Promo List BG",
  description: "Track your list and compare active supermarket promotions in Bulgaria.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg">
      <body className={`${manrope.variable} ${ibmPlexMono.variable} bg-canvas text-ink antialiased`}>
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-8">
          <header className="rounded-3xl border border-line bg-surface px-5 py-4 shadow-sm sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Promo List BG</h1>
                <p className="text-sm text-ink-muted">
                  Hobby MVP: list items + best available offers from Lidl, Kaufland and Billa.
                </p>
              </div>
              <MainNav />
            </div>
          </header>

          <main className="mt-6 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
