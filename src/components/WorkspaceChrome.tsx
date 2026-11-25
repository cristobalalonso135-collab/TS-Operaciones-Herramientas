'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface WorkspaceTab {
  id: string;
  label: string;
}

/** Round back button with the tool number and name next to it. */
export function ToolTitle({
  onBack,
  backLabel = 'Herramientas',
  number,
  title,
}: {
  onBack: () => void;
  backLabel?: string;
  number?: string;
  title?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        title={`Volver a ${backLabel}`}
        aria-label={`Volver a ${backLabel}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      {title && (
        <div className="min-w-0">
          {number && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              {number} {title}
            </p>
          )}
          <h2 className="truncate font-display text-2xl font-semibold leading-tight tracking-tight">{title}</h2>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceChrome({
  onBack,
  backLabel = 'Herramientas',
  showBack = true,
  number,
  title,
  actions,
  tabs,
  active,
  onSelect,
}: {
  onBack: () => void;
  backLabel?: string;
  /** False when the page shows its own back button. */
  showBack?: boolean;
  /** Tool number shown above the title, e.g. "05". */
  number?: string;
  title?: string;
  /** Buttons shown after the tabs, e.g. "Nuevo abono". */
  actions?: ReactNode;
  tabs: WorkspaceTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-4 ${showBack ? 'justify-between' : 'justify-end'}`}>
      {showBack && <ToolTitle onBack={onBack} backLabel={backLabel} number={number} title={title} />}
      <div className="flex max-w-full flex-wrap items-center gap-3">
        {tabs.length > 1 && (
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  active === tab.id
                    ? 'bg-[var(--text-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
