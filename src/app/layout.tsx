import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Budget App - Teamsports',
  description: 'Herramienta de gestión de budget',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <nav className="border-b border-[var(--border)] px-6 py-3 flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            <span className="text-[var(--accent)]">Budget</span> App
          </h1>
          <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] px-2 py-0.5 rounded">
            Teamsports
          </span>
        </nav>
        <main className="max-w-[1400px] mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
