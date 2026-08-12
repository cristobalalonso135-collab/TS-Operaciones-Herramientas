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
    icon: '/icon.svg?v=gear',
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--text-primary)] text-sm font-semibold tracking-wide text-[var(--bg-card)]">
                TS
              </div>
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
