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
  icons: {
    icon: '/icon.svg?v=ts-mark',
  },
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
                <rect width="64" height="64" rx="16" fill="#171612"/>
                <rect x="4" y="4" width="56" height="56" rx="13" fill="#1F4B7A"/>
                <path fill="#F4F1EA" d="M11 15.5h24v7.2H27.4V48h-8.8V22.7H11z"/>
                <path fill="none" stroke="#F4F1EA" strokeWidth="6.4" strokeLinecap="round" strokeLinejoin="round" d="M53.2 20.6c0-3.3-2.6-5.6-6.8-5.6H39.4c-4.2 0-6.8 2.4-6.8 5.7 0 3.3 2.3 5.3 6.8 5.8l8.4 1.1c4.6.6 7.2 3.1 7.2 6.8 0 4.2-3.4 6.9-8.6 6.9H38.6c-4.8 0-7.8-2.6-7.8-6.4"/>
                <rect x="13" y="51.4" width="11" height="3.4" rx="1.7" fill="#E8F5EE"/>
                <rect x="26.5" y="51.4" width="11" height="3.4" rx="1.7" fill="#C9A227"/>
                <rect x="40" y="51.4" width="11" height="3.4" rx="1.7" fill="#F4F1EA"/>
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
