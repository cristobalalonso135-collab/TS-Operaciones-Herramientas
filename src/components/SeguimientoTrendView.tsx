'use client';

import { Camera, Copy, Download, Trash2, TrendingUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { SNAPSHOT_SETUP_SQL } from '@/lib/seguimiento-db';
import {
  marginPct,
  snapshotsChronological,
  vsBudgetPct,
  type TrackingSnapshot,
} from '@/lib/seguimiento-snapshots';

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
}

function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function formatPp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = Math.abs(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (value > 0) return `+${formatted} pp`;
  if (value < 0) return `−${formatted} pp`;
  return `${formatted} pp`;
}

function formatDays(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} d`;
}

function toneClass(value: number | null, invert = false): string {
  if (value === null) return 'text-[var(--text-muted)]';
  const signed = invert ? -value : value;
  if (signed > 0.05) return 'text-[var(--success)]';
  if (signed < -0.05) return 'text-[var(--danger)]';
  return 'text-[var(--text-secondary)]';
}

function Sparkline({
  values,
  invert = false,
}: {
  values: (number | null)[];
  invert?: boolean;
}) {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null && Number.isFinite(point.value));
  if (points.length < 2) {
    return <p className="h-8 text-[10px] leading-8 text-[var(--text-muted)]">Pocas fotos</p>;
  }
  const nums = points.map((point) => point.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const width = 132;
  const height = 36;
  const pad = 3;
  const coords = points.map((point) => {
    const x = pad + (point.index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  const last = nums[nums.length - 1];
  const first = nums[0];
  const up = last - first;
  const good = invert ? up < 0 : up > 0;
  const color = Math.abs(up) < 0.05 ? 'var(--text-muted)' : good ? 'var(--success)' : 'var(--danger)';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={coords.join(' ')} />
      {coords.length > 0 && (
        <circle
          cx={Number(coords[coords.length - 1].split(',')[0])}
          cy={Number(coords[coords.length - 1].split(',')[1])}
          r="2.4"
          fill={color}
        />
      )}
    </svg>
  );
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

export default function SeguimientoTrendView({
  snapshots,
  cloudStatus,
  cloudError,
  onDelete,
  onExport,
  onImport,
}: {
  snapshots: TrackingSnapshot[];
  cloudStatus: 'loading' | 'online' | 'setup' | 'offline';
  cloudError: string | null;
  onDelete: (weekKey: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const chrono = snapshotsChronological(snapshots);
  const newest = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;

  const series = {
    facturacion: chrono.map((row) => row.facturacion),
    vsBudget: chrono.map((row) => vsBudgetPct(row.facturacion, row.budget)),
    margin: chrono.map((row) => marginPct(row.gm, row.facturacion)),
    free: chrono.map((row) => row.freePct),
    gen: chrono.map((row) => row.genPct),
    dso: chrono.map((row) => row.dso),
  };

  const cards = newest ? [
    {
      label: 'Facturación',
      value: formatCurrency(newest.facturacion),
      change: previous ? vsBudgetPct(newest.facturacion, previous.facturacion) : null,
      changeKind: 'pct' as const,
      invert: false,
      spark: series.facturacion,
    },
    {
      label: 'vs budget',
      value: formatPct(vsBudgetPct(newest.facturacion, newest.budget)),
      change: delta(vsBudgetPct(newest.facturacion, newest.budget), previous ? vsBudgetPct(previous.facturacion, previous.budget) : null),
      changeKind: 'pp' as const,
      invert: false,
      spark: series.vsBudget,
    },
    {
      label: '% margen',
      value: formatPct(marginPct(newest.gm, newest.facturacion)),
      change: delta(marginPct(newest.gm, newest.facturacion), previous ? marginPct(previous.gm, previous.facturacion) : null),
      changeKind: 'pp' as const,
      invert: false,
      spark: series.margin,
    },
    {
      label: '% Free',
      value: formatPct(newest.freePct),
      change: delta(newest.freePct, previous?.freePct ?? null),
      changeKind: 'pp' as const,
      invert: true,
      spark: series.free,
      accent: 'var(--kpi-free)',
    },
    {
      label: 'Generados',
      value: formatPct(newest.genPct),
      change: delta(newest.genPct, previous?.genPct ?? null),
      changeKind: 'pp' as const,
      invert: true,
      spark: series.gen,
      accent: 'var(--kpi-gen)',
    },
    {
      label: 'Días de cobro',
      value: formatDays(newest.dso),
      change: delta(newest.dso, previous?.dso ?? null),
      changeKind: 'days' as const,
      invert: true,
      spark: series.dso,
      accent: 'var(--kpi-debt)',
    },
  ] : [];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tendencia</p>
            <h3 className="mt-1 font-display text-lg font-semibold">Fotos semanales</h3>
            <p className="mt-1 max-w-2xl text-[13px] leading-snug text-[var(--text-secondary)]">
              Una foto por semana, guardada en la base de datos. La ves igual desde el portátil o desde casa.
              {newest ? ` Última: ${newest.weekLabel}.` : ''}
            </p>
            {cloudStatus === 'loading' && (
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">Leyendo las fotos en la nube…</p>
            )}
            {cloudStatus === 'online' && (
              <p className="mt-2 text-[12px] font-medium text-[var(--success)]">Conectado a la base de datos.</p>
            )}
            {cloudStatus === 'offline' && (
              <p className="mt-2 text-[12px] text-[var(--danger)]">No llego a la base de datos{cloudError ? `: ${cloudError}` : '.'}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={snapshots.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Importar
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = '';
              }}
            />
          </div>
        </div>
        {cloudStatus === 'setup' && (
          <div className="mt-4 rounded-xl border border-[var(--warning)] bg-white p-3">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Falta crear la tabla en Supabase (una vez).</p>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
              SQL Editor del proyecto → pega esto → Run. Luego recarga. {cloudError ? `(${cloudError})` : ''}
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(SNAPSHOT_SETUP_SQL);
                setCopied(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1.5 text-[11px] font-semibold"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copiado' : 'Copiar SQL'}
            </button>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-[var(--bg-soft)] p-2 text-[10px] leading-snug text-[var(--text-secondary)]">{SNAPSHOT_SETUP_SQL}</pre>
          </div>
        )}
      </div>

      {snapshots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <TrendingUp className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Todavía no hay fotos.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-secondary)]">
            Sube los archivos, mira el cuadro general y pulsa <span className="font-semibold">Guardar foto en la nube</span>.
            La semana que viene, otra. Aquí verás si cobras antes, si el free se va o si el margen aguanta.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.label}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5 shadow-sm"
                style={card.accent ? { borderColor: `${card.accent}66` } : undefined}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]"
                  style={card.accent ? { color: card.accent } : undefined}
                >
                  {card.label}
                </p>
                <p className="mt-1.5 font-display text-xl font-semibold tabular-nums leading-none">{card.value}</p>
                <p className={`mt-1 text-[12px] font-semibold tabular-nums ${toneClass(card.change, card.invert)}`}>
                  {card.changeKind === 'pct' && card.change !== null
                    ? `${card.change > 0 ? '+' : ''}${formatPct(card.change)} vs foto anterior`
                    : card.changeKind === 'days' && card.change !== null
                      ? `${card.change > 0 ? '+' : ''}${card.change.toLocaleString('de-DE', { maximumFractionDigits: 0 })} d vs foto anterior`
                      : `${formatPp(card.change)} vs foto anterior`}
                </p>
                <Sparkline values={card.spark} invert={card.invert} />
              </article>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-soft)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Semana</th>
                    <th className="px-3 py-2">Tramo</th>
                    <th className="px-3 py-2 text-right">Facturación</th>
                    <th className="px-3 py-2 text-right">vs budget</th>
                    <th className="px-3 py-2 text-right">GM</th>
                    <th className="px-3 py-2 text-right">% mg</th>
                    <th className="px-3 py-2 text-right">Free</th>
                    <th className="px-3 py-2 text-right">Gen</th>
                    <th className="px-3 py-2 text-right">Deuda %</th>
                    <th className="px-3 py-2 text-right">Días</th>
                    <th className="px-3 py-2 text-right">Vencida %</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((row, index) => {
                    const prev = snapshots[index + 1];
                    const vsBg = vsBudgetPct(row.facturacion, row.budget);
                    const mg = marginPct(row.gm, row.facturacion);
                    return (
                      <tr key={row.weekKey} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">
                          {row.weekLabel}
                          <span className="mt-0.5 block text-[10px] font-normal text-[var(--text-muted)]">
                            {new Date(row.savedAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{row.periodLabel}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.facturacion)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${toneClass(vsBg)}`}>{formatPct(vsBg)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.gm)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPct(mg)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-free)' }}>{formatPct(row.freePct)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-gen)' }}>{formatPct(row.genPct)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-debt)' }}>{row.hasDebt ? formatPct(row.debtPct) : '—'}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${toneClass(delta(row.dso, prev?.dso ?? null), true)}`}>
                          {row.hasDebt ? formatDays(row.dso) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-debt)' }}>
                          {row.hasDebt ? formatPct(row.debtDuePct) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onDelete(row.weekKey)}
                            className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                            aria-label={`Borrar ${row.weekLabel}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <Camera className="h-3.5 w-3.5" />
        Si subes dos veces la misma semana, se sustituye la foto. El histórico está en Supabase, no en este navegador.
      </p>
    </section>
  );
}
