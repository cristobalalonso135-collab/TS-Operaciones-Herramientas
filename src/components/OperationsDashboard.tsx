'use client';

import { ArrowLeft, ArrowRight, Calculator, CreditCard, Gift, Globe, LayoutDashboard, Percent, Target, Wallet } from 'lucide-react';
import type { TrackingViewMode } from '@/components/TrackingTool';

interface OperationsDashboardProps {
  onBack: () => void;
  onOpenBudget: () => void;
  onOpenTracking: (view: TrackingViewMode) => void;
}

type KpiSource = 'budget' | 'tracking';

interface DashboardKpi {
  id: string;
  number: string;
  title: string;
  watch: string;
  metric: string;
  source: KpiSource;
  sourceLabel: string;
  openLabel: string;
  trackingView?: TrackingViewMode;
  accent?: string;
  icon: typeof Calculator;
}

const PLAN: DashboardKpi[] = [
  {
    id: 'budget-ly',
    number: '01',
    title: 'Budget vs facturación LY',
    watch: 'Este budget contra la facturación del año pasado. Sale del Comparador, no del cuadre al céntimo.',
    metric: 'vs LY',
    source: 'budget',
    sourceLabel: '02 Budget · Comparador',
    openLabel: 'Abrir Budget',
    icon: Calculator,
  },
];

const PNL: DashboardKpi[] = [
  {
    id: 'sales',
    number: '02',
    title: 'Facturación vs budget',
    watch: 'Ventas del tramo contra el budget del mismo tramo. El vs LY es extra, no la base.',
    metric: 'vs budget €',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · YTD',
    openLabel: 'Abrir Seguimiento',
    trackingView: 'ytd',
    icon: Target,
  },
  {
    id: 'gm',
    number: '03',
    title: 'Gross margin vs budget',
    watch: 'GM en euros contra el GM budget del mismo tramo.',
    metric: 'vs budget €',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · YTD',
    openLabel: 'Abrir Seguimiento',
    trackingView: 'ytd',
    icon: Wallet,
  },
  {
    id: 'margin',
    number: '04',
    title: '% margen vs budget',
    watch: 'Margen en puntos. El mix no puede esconderse detrás de los euros.',
    metric: 'vs budget pp',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · YTD',
    openLabel: 'Abrir Seguimiento',
    trackingView: 'ytd',
    icon: Percent,
  },
];

const CONDITIONS: DashboardKpi[] = [
  {
    id: 'frees',
    number: '05',
    title: 'Frees vs facturación grassroots',
    watch: '% = free / (grassroots + frees). Banda 10% ±1,5 pp. B2B y Pro Clubs no llevan este KPI.',
    metric: '% sobre bruta',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · Frees',
    openLabel: 'Abrir Frees',
    trackingView: 'frees',
    accent: 'var(--kpi-free)',
    icon: Gift,
  },
  {
    id: 'gen',
    number: '06',
    title: 'Generados vs Web B2C −1',
    watch: 'Sobre Equipaciones Web B2C del mes anterior. Banda 12% ±1,5 pp.',
    metric: '% sobre B2C −1',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · Generados',
    openLabel: 'Abrir Generados',
    trackingView: 'generados',
    accent: 'var(--kpi-gen)',
    icon: Globe,
  },
  {
    id: 'debt',
    number: '07',
    title: 'Deuda vs facturación',
    watch: 'Deuda ÷ neta del tramo. Semáforo en días de cobro (techo 55; vencida 10).',
    metric: 'días de cobro',
    source: 'tracking',
    sourceLabel: '03 Seguimiento · Deuda',
    openLabel: 'Abrir Deuda',
    trackingView: 'deuda',
    accent: 'var(--kpi-debt)',
    icon: CreditCard,
  },
];

const ALL_KPIS = [...PLAN, ...PNL, ...CONDITIONS];

const GROUPS = [
  {
    id: 'plan',
    label: 'Plan',
    hint: 'Calidad del budget. Sale del Comparador (pestaña 02).',
    kpis: PLAN,
    cols: 'md:grid-cols-1 xl:grid-cols-1',
  },
  {
    id: 'pnl',
    label: 'P&L',
    hint: 'El año contra el plan. Sale de Seguimiento YTD.',
    kpis: PNL,
    cols: 'md:grid-cols-3',
  },
  {
    id: 'conditions',
    label: 'Condiciones y caja',
    hint: 'Frees y generados empujan el P&L. La deuda cierra el año.',
    kpis: CONDITIONS,
    cols: 'md:grid-cols-3',
  },
] as const;

function EmptyRing({ accent }: { accent?: string }) {
  return (
    <svg viewBox="0 0 88 88" className="h-[72px] w-[72px]" aria-hidden>
      <circle cx="44" cy="44" r="34" fill="none" stroke="var(--bg-soft)" strokeWidth="7" />
      <circle
        cx="44"
        cy="44"
        r="34"
        fill="none"
        stroke={accent || 'var(--border-strong)'}
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

function KpiCard({
  kpi,
  onOpen,
}: {
  kpi: DashboardKpi;
  onOpen: (kpi: DashboardKpi) => void;
}) {
  const Icon = kpi.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(kpi)}
      className="flex min-h-[240px] flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-white"
      style={kpi.accent ? { borderColor: `${kpi.accent}66` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold tracking-[0.18em] text-[var(--text-muted)]">{kpi.number}</p>
          <h3 className="mt-1 font-display text-lg font-semibold leading-tight">{kpi.title}</h3>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: kpi.accent ? undefined : 'var(--accent-soft)',
            color: kpi.accent || 'var(--accent)',
            ...(kpi.accent ? { backgroundColor: `${kpi.accent}22` } : {}),
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">{kpi.metric}</p>
          <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-[var(--border-strong)]">—</p>
        </div>
        <EmptyRing accent={kpi.accent} />
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
        <div className="h-full w-[8%] rounded-full" style={{ background: kpi.accent || 'var(--border-strong)' }} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{kpi.watch}</p>
      <p className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] font-medium">
        <span className="text-[var(--text-muted)]">{kpi.sourceLabel}</span>
        <span className="inline-flex items-center gap-1 text-[var(--accent)]">
          {kpi.openLabel}
          <ArrowRight className="h-3 w-3" />
        </span>
      </p>
    </button>
  );
}

export default function OperationsDashboard({
  onBack,
  onOpenBudget,
  onOpenTracking,
}: OperationsDashboardProps) {
  const openKpi = (kpi: DashboardKpi) => {
    if (kpi.source === 'budget') {
      onOpenBudget();
      return;
    }
    onOpenTracking(kpi.trackingView ?? 'ytd');
  };

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
              El 01 mide el plan contra el año pasado. Del 02 al 07 miden el año contra el plan, cada uno con su base. Pincha un recuadro y saltas a Budget o a Seguimiento.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Plan', '02 Budget'],
              ['P&L', '03 YTD'],
              ['Caja', 'Frees · gen · deuda'],
            ].map(([label, hint]) => (
              <div key={label} className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-3">
                <p className="font-display text-sm font-semibold">{label}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{group.label}</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{group.hint}</p>
          </div>
          <div className={`grid gap-3 ${group.cols}`}>
            {group.kpis.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} onOpen={openKpi} />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Cadena</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Si el budget no está bien plantado vs LY, facturación y margen mienten. Si frees o generados van tarde, inflan el P&L. La deuda es lo último: vender está bien, cobrar cierra el año.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {ALL_KPIS.map((kpi, index) => (
            <button
              key={kpi.id}
              type="button"
              onClick={() => openKpi(kpi)}
              className="relative rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/50 px-3 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-white"
            >
              <p className="font-display text-[11px] font-semibold text-[var(--text-muted)]">{kpi.number}</p>
              <p className="mt-1 text-sm font-semibold leading-tight">{kpi.title}</p>
              {index < ALL_KPIS.length - 1 && (
                <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[var(--border-strong)] xl:block">→</span>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
