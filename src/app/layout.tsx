import type { Metadata } from 'next';
import { Manrope, Outfit } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TS Operaciones Herramientas',
  description: 'Herramientas operativas de Teamsports',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/favicon-180.png',
  },
};

export const viewport = {
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${manrope.variable} ${outfit.variable}`}>
      <body className="min-h-screen">
        <nav className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-md px-6 py-4">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden>
                <rect width="64" height="64" rx="14" fill="#111827"/>
                <circle cx="32" cy="32" r="13.5" fill="#F9FAFB"/>
                <polygon points="36.40,19.50 35.17,12.50 28.83,12.50 27.60,19.50" fill="#F9FAFB"/>
                <circle cx="32" cy="12.5" r="3.17" fill="#F9FAFB"/>
                <polygon points="45.03,29.56 50.47,24.99 47.30,19.51 40.63,21.94" fill="#F9FAFB"/>
                <circle cx="48.89" cy="22.25" r="3.17" fill="#F9FAFB"/>
                <polygon points="40.63,42.06 47.30,44.49 50.47,39.01 45.03,34.44" fill="#F9FAFB"/>
                <circle cx="48.89" cy="41.75" r="3.17" fill="#F9FAFB"/>
                <polygon points="27.60,44.50 28.83,51.50 35.17,51.50 36.40,44.50" fill="#F9FAFB"/>
                <circle cx="32" cy="51.5" r="3.17" fill="#F9FAFB"/>
                <polygon points="18.97,34.44 13.53,39.01 16.70,44.49 23.37,42.06" fill="#F9FAFB"/>
                <circle cx="15.11" cy="41.75" r="3.17" fill="#F9FAFB"/>
                <polygon points="23.37,21.94 16.70,19.51 13.53,24.99 18.97,29.56" fill="#F9FAFB"/>
                <circle cx="15.11" cy="22.25" r="3.17" fill="#F9FAFB"/>
                <circle cx="32" cy="32" r="5.4" fill="#111827"/>
              </svg>
              <div>
                <h1 className="font-display text-lg font-semibold leading-tight tracking-tight">
                  TS Operaciones
                </h1>
                <p className="text-xs text-[var(--text-secondary)]">Herramientas internas · Teamsports</p>
              </div>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/80 px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              Budget FY 26/27
            </span>
          </div>
        </nav>
        <main className="mx-auto max-w-[1680px] px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
