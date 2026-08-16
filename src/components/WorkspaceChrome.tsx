'use client';

import { ArrowLeft } from 'lucide-react';

interface WorkspaceTab {
  id: string;
  label: string;
}

export default function WorkspaceChrome({
  onBack,
  tabs,
  active,
  onSelect,
}: {
  onBack: () => void;
  tabs: WorkspaceTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Herramientas
      </button>
      <div className="flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              active === tab.id
                ? 'bg-[var(--text-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
