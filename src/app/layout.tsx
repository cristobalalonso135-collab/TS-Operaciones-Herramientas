import type { Metadata } from 'next';
import { Manrope, Outfit } from 'next/font/google';
import { AccessProvider } from '@/components/AccessProvider';
import OwnerAuthGate, { OwnerSessionBar } from '@/components/OwnerAuthGate';
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
  manifest: '/site.webmanifest?v=2',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/favicon.svg?v=2', type: 'image/svg+xml' },
    ],
    apple: '/favicon-180.png?v=2',
  },
};

export const viewport = {
  themeColor: '#0F766E',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${manrope.variable} ${outfit.variable}`}>
      <body className="min-h-screen">
        <AccessProvider>
          <OwnerAuthGate>
            <nav className="border-b border-[var(--border)] bg-white px-6 py-3">
              <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
                    <rect width="64" height="64" rx="14" fill="#0F766E"/>
                    <g stroke="#FFFFFF" strokeWidth="3">
                      <line x1="32" y1="16" x2="32" y2="48"/>
                      <line x1="16" y1="32" x2="48" y2="32"/>
                    </g>
                    <circle cx="32" cy="32" r="8" fill="#FFFFFF"/>
                    <circle cx="32" cy="15" r="5" fill="#FFFFFF"/>
                    <circle cx="32" cy="49" r="5" fill="#FFFFFF"/>
                    <circle cx="15" cy="32" r="5" fill="#FFFFFF"/>
                    <circle cx="49" cy="32" r="5" fill="#FFFFFF"/>
                  </svg>
                  <h1 className="font-display text-lg font-semibold leading-tight tracking-tight">
                    TS Operaciones
                  </h1>
                </div>
                <OwnerSessionBar />
              </div>
            </nav>
            <main className="mx-auto max-w-[1680px] px-6 py-8">{children}</main>
          </OwnerAuthGate>
        </AccessProvider>
      </body>
    </html>
  );
}
