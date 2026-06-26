import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TS Operaciones',
  description: 'Herramientas operativas de Teamsports',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <nav className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/90 backdrop-blur px-6 py-3">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-soft)] text-sm font-semibold">
                TS
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight">TS Operaciones</h1>
                <p className="text-xs text-[var(--text-secondary)]">Herramientas internas</p>
              </div>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              Budget FY 26/27
            </span>
          </div>
        </nav>
        <main className="mx-auto max-w-[1680px] px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
