'use client';

import { Camera, ChevronRight, Download, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  branchAtPath,
  childrenAtPath,
  findBranchExact,
  marginPct,
  snapshotRoot,
  snapshotsChronological,
  vsBudgetPct,
  type SnapshotBranch,
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

function formatPhotoDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
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
    return <p className="h-8 text-[10px] leading-8 text-[var(--text-muted)]">Pocos tramos</p>;
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

function TrendNodeCard({
  node,
  selected,
  onClick,
}: {
  node: SnapshotBranch;
  selected?: boolean;
  onClick?: () => void;
}) {
  const vsBg = vsBudgetPct(node.facturacion, node.budget);
  const mg = marginPct(node.gm, node.facturacion);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-3 text-left shadow-sm transition ${
        selected
          ? 'border-[var(--accent)] bg-white ring-2 ring-[var(--accent-soft)]'
          : 'border-[var(--border)] bg-[var(--bg-card)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]'
      }`}
    >
      <p className="font-display text-sm font-semibold">{node.label}</p>
      <p className="mt-2 text-[13px] font-semibold tabular-nums">{formatCurrency(node.facturacion)}</p>
      <p className={`text-[11px] font-semibold tabular-nums ${toneClass(vsBg)}`}>{formatPct(vsBg)} vs budget</p>
      <p className="text-[11px] tabular-nums text-[var(--text-secondary)]">{formatPct(mg)} margen</p>
      {node.freePct !== null && Math.abs(node.freePct) > 0.05 && (
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--kpi-free)' }}>{formatPct(node.freePct)} free</p>
      )}
      {node.genPct !== null && Math.abs(node.genPct) > 0.05 && (
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--kpi-gen)' }}>{formatPct(node.genPct)} gen</p>
      )}
      {node.hasDebt && (
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--kpi-debt)' }}>{formatDays(node.dso)} cobro</p>
      )}
    </button>
  );
}

function TreeColumn({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="w-[220px] shrink-0 space-y-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
        {hint && <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SeguimientoTrendView({
  snapshots,
  onExport,
}: {
  snapshots: TrackingSnapshot[];
  onExport?: () => void;
}) {
  const [path, setPath] = useState<string[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const chrono = snapshotsChronological(snapshots);
  const selected = snapshots.find((row) => row.weekKey === (weekKey ?? snapshots[0]?.weekKey)) ?? snapshots[0] ?? null;
  const previous = selected ? snapshots[snapshots.findIndex((row) => row.weekKey === selected.weekKey) + 1] ?? null : null;
  const root = selected ? snapshotRoot(selected) : null;
  const node = selected ? branchAtPath(selected, path) : null;
  const hasTree = Boolean(selected?.tree?.children?.length);

  const series = useMemo(() => {
    const pick = (read: (branch: SnapshotBranch) => number | null) => chrono.map((row) => {
      const branch = findBranchExact(snapshotRoot(row), path);
      return branch ? read(branch) : null;
    });
    return {
      facturacion: pick((branch) => branch.facturacion),
      vsBudget: pick((branch) => vsBudgetPct(branch.facturacion, branch.budget)),
      margin: pick((branch) => marginPct(branch.gm, branch.facturacion)),
      free: pick((branch) => branch.freePct),
      gen: pick((branch) => branch.genPct),
      dso: pick((branch) => branch.dso),
    };
  }, [chrono, path]);

  const cards = node ? [
    {
      label: 'Facturación',
      value: formatCurrency(node.facturacion),
      change: previous ? vsBudgetPct(node.facturacion, branchAtPath(previous, path).facturacion) : null,
      changeKind: 'pct' as const,
      invert: false,
      spark: series.facturacion,
    },
    {
      label: 'vs budget',
      value: formatPct(vsBudgetPct(node.facturacion, node.budget)),
      change: delta(
        vsBudgetPct(node.facturacion, node.budget),
        previous ? vsBudgetPct(branchAtPath(previous, path).facturacion, branchAtPath(previous, path).budget) : null,
      ),
      changeKind: 'pp' as const,
      invert: false,
      spark: series.vsBudget,
    },
    {
      label: '% margen',
      value: formatPct(marginPct(node.gm, node.facturacion)),
      change: delta(
        marginPct(node.gm, node.facturacion),
        previous ? marginPct(branchAtPath(previous, path).gm, branchAtPath(previous, path).facturacion) : null,
      ),
      changeKind: 'pp' as const,
      invert: false,
      spark: series.margin,
    },
    {
      label: '% Free',
      value: formatPct(node.freePct),
      change: delta(node.freePct, previous ? branchAtPath(previous, path).freePct : null),
      changeKind: 'pp' as const,
      invert: true,
      spark: series.free,
      accent: 'var(--kpi-free)',
    },
    {
      label: 'Generados',
      value: formatPct(node.genPct),
      change: delta(node.genPct, previous ? branchAtPath(previous, path).genPct : null),
      changeKind: 'pp' as const,
      invert: true,
      spark: series.gen,
      accent: 'var(--kpi-gen)',
    },
    {
      label: 'Días de cobro',
      value: formatDays(node.dso),
      change: delta(node.dso, previous ? branchAtPath(previous, path).dso : null),
      changeKind: 'days' as const,
      invert: true,
      spark: series.dso,
      accent: 'var(--kpi-debt)',
    },
  ] : [];

  const pathLabel = ['Teamsports', ...path.map((key, index) => {
    if (!selected) return key;
    return findBranchExact(snapshotRoot(selected), path.slice(0, index + 1))?.label ?? key;
  })].join(' › ');

  const extraParent = root && path.length >= 3 ? findBranchExact(root, path.slice(0, 3)) : node;
  const extraTitle = extraParent?.extraKind === 'zona' ? 'Zona' : extraParent?.extraKind === 'vertical' ? 'Vertical' : 'Rama';

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tendencia</p>
            <h3 className="mt-1 font-display text-lg font-semibold">Tramos cerrados</h3>
            <p className="mt-1 max-w-2xl text-[13px] leading-snug text-[var(--text-secondary)]">
              Abril, Abril–Mayo, Abril–Junio… según el CSV. La deuda de cada cierre es la foto más cercana a fin de mes.
              {selected ? ` Ahora: ${selected.weekLabel}.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {snapshots.length > 0 && (
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                Tramo
                <select
                  value={selected?.weekKey ?? ''}
                  onChange={(event) => {
                    setWeekKey(event.target.value);
                    setPath([]);
                  }}
                  className="mt-1 block rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  {snapshots.map((row) => (
                    <option key={row.weekKey} value={row.weekKey}>{row.weekLabel}</option>
                  ))}
                </select>
              </label>
            )}
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                disabled={snapshots.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar JSON
              </button>
            )}
          </div>
        </div>
      </div>

      {snapshots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <TrendingUp className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">No hay meses cerrados en este tramo.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-secondary)]">
            Sube el CSV de operación con Year-Month. Si quieres deuda en la curva, sube también la foto de cada cierre.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--text-secondary)]">{pathLabel}. Pincha para bajar.</p>

          {root && hasTree && (
            <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <div className="flex items-start gap-2 overflow-x-auto pb-2">
                <TreeColumn title="Compañía">
                  <TrendNodeCard
                    node={root}
                    selected={path.length === 0}
                    onClick={() => setPath([])}
                  />
                </TreeColumn>
                {root.children.length > 0 && (
                  <>
                    <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                    <TreeColumn title="Área" hint="Elige una rama">
                      {root.children.map((area) => (
                        <TrendNodeCard
                          key={area.key}
                          node={area}
                          selected={path[0] === area.key}
                          onClick={() => setPath([area.key])}
                        />
                      ))}
                    </TreeColumn>
                  </>
                )}
                {path[0] && childrenAtPath(root, [path[0]]).length > 0 && (
                  <>
                    <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                    <TreeColumn title="Responsable" hint={findBranchExact(root, [path[0]])?.label}>
                      {childrenAtPath(root, [path[0]]).map((resp) => (
                        <TrendNodeCard
                          key={resp.key}
                          node={resp}
                          selected={path[1] === resp.key}
                          onClick={() => setPath([path[0], resp.key])}
                        />
                      ))}
                    </TreeColumn>
                  </>
                )}
                {path[0] && path[1] && childrenAtPath(root, path.slice(0, 2)).length > 0 && (
                  <>
                    <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                    <TreeColumn title="Subresponsable" hint={findBranchExact(root, path.slice(0, 2))?.label}>
                      {childrenAtPath(root, path.slice(0, 2)).map((sub) => (
                        <TrendNodeCard
                          key={sub.key}
                          node={sub}
                          selected={path[2] === sub.key}
                          onClick={() => setPath([path[0], path[1], sub.key])}
                        />
                      ))}
                    </TreeColumn>
                  </>
                )}
                {path.length >= 3 && childrenAtPath(root, path.slice(0, 3)).length > 0 && (
                  <>
                    <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                    <TreeColumn title={extraTitle} hint={findBranchExact(root, path.slice(0, 3))?.label}>
                      {childrenAtPath(root, path.slice(0, 3)).map((extra) => (
                        <TrendNodeCard
                          key={extra.key}
                          node={extra}
                          selected={path[3] === extra.key}
                          onClick={() => setPath([path[0], path[1], path[2], extra.key])}
                        />
                      ))}
                    </TreeColumn>
                  </>
                )}
              </div>
            </section>
          )}

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
                    ? `${card.change > 0 ? '+' : ''}${formatPct(card.change)} vs tramo anterior`
                    : card.changeKind === 'days' && card.change !== null
                      ? `${card.change > 0 ? '+' : ''}${card.change.toLocaleString('de-DE', { maximumFractionDigits: 0 })} d vs tramo anterior`
                      : `${formatPp(card.change)} vs tramo anterior`}
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
                    <th className="px-3 py-2">Tramo</th>
                    <th className="px-3 py-2">Deuda foto</th>
                    <th className="px-3 py-2 text-right">Facturación</th>
                    <th className="px-3 py-2 text-right">vs budget</th>
                    <th className="px-3 py-2 text-right">GM</th>
                    <th className="px-3 py-2 text-right">% mg</th>
                    <th className="px-3 py-2 text-right">Free</th>
                    <th className="px-3 py-2 text-right">Gen</th>
                    <th className="px-3 py-2 text-right">Deuda %</th>
                    <th className="px-3 py-2 text-right">Días</th>
                    <th className="px-3 py-2 text-right">Vencida %</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((row) => {
                    const branch = findBranchExact(snapshotRoot(row), path) ?? snapshotRoot(row);
                    const vsBg = vsBudgetPct(branch.facturacion, branch.budget);
                    const mg = marginPct(branch.gm, branch.facturacion);
                    return (
                      <tr key={row.weekKey} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">
                          {row.weekLabel}
                          <span className="mt-0.5 block text-[10px] font-normal text-[var(--text-muted)]">
                            {row.periodLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {row.files.debt
                            ? (
                              <>
                                {row.files.debt}
                                <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                                  {formatPhotoDate(row.savedAt)}
                                </span>
                              </>
                            )
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(branch.facturacion)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${toneClass(vsBg)}`}>{formatPct(vsBg)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(branch.gm)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPct(mg)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-free)' }}>{formatPct(branch.freePct)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-gen)' }}>{formatPct(branch.genPct)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-debt)' }}>{branch.hasDebt ? formatPct(branch.debtPct) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-debt)' }}>
                          {branch.hasDebt ? formatDays(branch.dso) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--kpi-debt)' }}>
                          {branch.hasDebt ? formatPct(branch.debtDuePct) : '—'}
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
        El P&L sale del CSV. La deuda no: cada cierre usa la foto más cercana a fin de mes. Si no hay foto de ese cierre, ese tramo va sin deuda.
      </p>
    </section>
  );
}
