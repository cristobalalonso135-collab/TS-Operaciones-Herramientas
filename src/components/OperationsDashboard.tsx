'use client';

import { ArrowLeft, Calculator, CreditCard, Gift, Globe, LayoutDashboard, Percent, Target } from 'lucide-react';

interface OperationsDashboardProps {
  onBack: () => void;
}

const KPIS = [
  {
    id: 'budget',
    number: '01',
    title: 'Budget cuadrado',
    watch: 'Que el diario y el general cuadren al céntimo.',
    metric: 'Estado del budget',
    icon: Calculator,
  },
  {
    id: 'sales',
    number: '02',
    title: 'Facturación vs budget',
    watch: 'Ritmo YTD frente al budget y al año pasado.',
    metric: 'Desviación €',
    icon: Target,
  },
  {
    id: 'margin',
    number: '03',
    title: 'Margen vs budget',
    watch: 'Gross margin en € y en %. El mix no puede esconderse.',
    metric: 'pp vs budget',
    icon: Percent,
  },
  {
    id: 'frees',
    number: '04',
    title: 'Frees',
    watch: 'Condición de contrato. Retrasada infla facturación y margen.',
    metric: 'Pendiente de meter',
    icon: Gift,
  },
  {
    id: 'web',
    number: '05',
    title: 'Generados web',
    watch: 'Packs del mes anterior → coste comercial el mes siguiente.',
    metric: 'A facturar',
    icon: Globe,
  },
  {
    id: 'debt',
    number: '06',
    title: 'Deuda',
    watch: 'Vender está bien. Cobrar cierra el año.',
    metric: 'Vencido',
    icon: CreditCard,
  },
] as const;

const ZONAS = ['Norte', 'Centro-Sur', 'Levante', 'Portugal', 'Francia', 'Italia Norte', 'Italia Centro-Sur'];

const FILES = [
  { name: 'Budget', use: 'Base y cuadre' },
  { name: 'Teamsports', use: 'Facturación y margen' },
  { name: 'Frees', use: 'Negativos Grassroots' },
  { name: 'Generados web', use: 'Condición mes +1' },
  { name: 'Deuda', use: 'Aging y cobro' },
];

function EmptyRing() {
  return (
    <svg viewBox="0 0 88 88" className="h-[72px] w-[72px]" aria-hidden>
      <circle cx="44" cy="44" r="34" fill="none" stroke="var(--bg-soft)" strokeWidth="7" />
      <circle
        cx="44"
        cy="44"
        r="34"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="7"
        strokeDasharray="213.6"
        strokeDashoffset="160"
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        opacity="0.55"
      />
    </svg>
  );
}

export default function OperationsDashboard({ onBack }: OperationsDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Herramientas
        </button>
        <span className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/80 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Maqueta · sin datos
        </span>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-7 shadow-sm sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-[var(--accent-soft)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-16 h-40 w-40 rounded-full bg-[var(--success-soft)] blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Operaciones · FY 26/27
            </p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Cuadro de mando</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Los 6 KPIs de operaciones, en una sola pantalla. Hoy es el esqueleto. Cuando unamos los Excels, cada recuadro se enciende.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['P&L', '¿Miente hoy?'],
              ['Ritmo', '¿Vamos tarde?'],
              ['Caja', '¿Hemos cobrado?'],
            ].map(([label, hint]) => (
              <div key={label} className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-3">
                <p className="font-display text-sm font-semibold">{label}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article
              key={kpi.id}
              className="flex min-h-[220px] flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[11px] font-semibold tracking-[0.18em] text-[var(--text-muted)]">{kpi.number}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold leading-tight">{kpi.title}</h3>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">{kpi.metric}</p>
                  <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-[var(--border-strong)]">—</p>
                </div>
                <EmptyRing />
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                <div className="h-full w-[8%] rounded-full bg-[var(--border-strong)]" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{kpi.watch}</p>
              <p className="mt-auto pt-3 text-[11px] font-medium text-[var(--text-muted)]">Sin archivo · pendiente</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Cadena</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Si falla el primero, el resto miente. El rojo de verdad está al final: frees tarde, generados tarde, deuda vencida.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {KPIS.map((kpi, index) => (
            <div key={kpi.id} className="relative rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/50 px-3 py-3">
              <p className="font-display text-[11px] font-semibold text-[var(--text-muted)]">{kpi.number}</p>
              <p className="mt-1 text-sm font-semibold leading-tight">{kpi.title}</p>
              {index < KPIS.length - 1 && (
                <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[var(--border-strong)] xl:block">→</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Zonas</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Aquí irá el semáforo por zona cuando entren frees, facturación y deuda.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ZONAS.map((zona) => (
              <div key={zona} className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                {zona}
                <span className="ml-2 text-[var(--text-muted)]">—</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Excels que lo alimentarán</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Pocos archivos, siempre los mismos.</p>
          <ul className="mt-4 space-y-2">
            {FILES.map((file) => (
              <li key={file.name} className="flex items-center justify-between rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm">
                <span className="font-medium">{file.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{file.use}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
