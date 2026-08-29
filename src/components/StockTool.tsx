'use client';

import { useEffect, useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import {
  buildStockSnapshot,
  daysSince,
  deadStockReason,
  isExpired,
  isExtinguir,
  isNeverSold,
  isStale,
  isStillBuyingDead,
  parseStockRows,
  parseStockSnapshots,
  RECENT_BUY_DAYS,
  STOCK_SNAPSHOT_STORAGE,
  STALE_SALE_DAYS,
  STALE_YEAR_DAYS,
  stockAsOf,
  stockHasSaleDates,
  upsertStockSnapshot,
  type StockLine,
  type StockSnapshot,
} from '@/lib/stock-files';
import {
  coverDays,
  formatCoverDays,
  aggregateProductSales,
  COVER_DAYS,
  COVER_YEAR_DAYS,
  isSalesFile,
  type ProductSales,
} from '@/lib/stock-sales';

interface StockToolProps {
  onBack: () => void;
}

type StockView = 'resumen' | 'riesgo' | 'tendencia';
type GroupKey = 'situacion' | 'familia' | 'marca';
type RiskFilter = 'todo' | 'sin-venta' | '180' | '365' | 'comprando' | 'sin-12m' | 'cover-180' | 'cover-365';

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
}

function formatQty(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 0 });
}

function formatPct(part: number, total: number): string {
  if (total === 0) return '—';
  return `${((part / total) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function groupBy(lines: StockLine[], keyFn: (line: StockLine) => string): { label: string; qty: number; cost: number; rows: number }[] {
  const map = new Map<string, { label: string; qty: number; cost: number; rows: number }>();
  lines.forEach((line) => {
    const label = keyFn(line) || 'Sin dato';
    const current = map.get(label) || { label, qty: 0, cost: 0, rows: 0 };
    current.qty += line.qty;
    current.cost += line.cost;
    current.rows += 1;
    map.set(label, current);
  });
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <p className="h-8 text-[10px] leading-8 text-[var(--text-muted)]">Pocas fotos</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 160;
  const height = 36;
  const pad = 3;
  const coords = values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" aria-hidden>
      <polyline fill="none" stroke="var(--kpi-debt)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={coords.join(' ')} />
    </svg>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone || 'text-[var(--text-primary)]'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

export default function StockTool({ onBack }: StockToolProps) {
  const [lines, setLines] = useState<StockLine[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<StockView>('resumen');
  const [group, setGroup] = useState<GroupKey>('situacion');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('todo');
  const [snapshots, setSnapshots] = useState<StockSnapshot[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseStockSnapshots(window.localStorage.getItem(STOCK_SNAPSHOT_STORAGE));
  });
  const [salesById, setSalesById] = useState<Map<string, ProductSales>>(new Map());
  const [salesFileName, setSalesFileName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const today = useMemo(() => stockAsOf(lines), [lines]);

  useEffect(() => {
    window.localStorage.setItem(STOCK_SNAPSHOT_STORAGE, JSON.stringify(snapshots));
  }, [snapshots]);

  const handleLoaded = (data: unknown[][], name: string) => {
    try {
      if (isSalesFile(data)) {
        if (lines.length === 0) {
          throw new Error('Primero sube el Stock.csv de Equipaciones.');
        }
        const aggregated = aggregateProductSales(data);
        setSalesById(aggregated);
        setSalesFileName(name);
        setError(null);
        setNote(`Ventas cruzadas: ${aggregated.size.toLocaleString('de-DE')} productos, últimos 12 meses.`);
        setView('riesgo');
        return;
      }
      const parsed = parseStockRows(data);
      setLines(parsed);
      setFileName(name);
      setError(null);
      setNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const productStock = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    lines.forEach((line) => {
      const current = map.get(line.id) || { qty: 0, cost: 0 };
      current.qty += line.qty;
      current.cost += line.cost;
      map.set(line.id, current);
    });
    return map;
  }, [lines]);

  const productCover = useMemo(() => {
    const map = new Map<string, number | null>();
    productStock.forEach((stock, id) => {
      map.set(id, coverDays(stock.qty, salesById.get(id)?.qty12 ?? 0));
    });
    return map;
  }, [productStock, salesById]);

  const totals = useMemo(() => {
    let qty = 0;
    let cost = 0;
    let pvp = 0;
    let extinguirCost = 0;
    let expiredCost = 0;
    let clearanceCost = 0;
    let noSaleCost = 0;
    let staleCost = 0;
    let buyingDeadCost = 0;
    let withLastSale = 0;
    const saleAges: number[] = [];
    const hasSaleDates = stockHasSaleDates(lines);
    const skus = new Set<string>();
    lines.forEach((line) => {
      qty += line.qty;
      cost += line.cost;
      pvp += line.pvp;
      skus.add(`${line.referencia}|${line.talla}`);
      if (isExtinguir(line.situacion)) extinguirCost += line.cost;
      if (isExpired(line, today)) expiredCost += line.cost;
      if (line.clearance > 0) clearanceCost += line.cost;
      const age = daysSince(line.lastSale, today);
      if (age !== null) {
        withLastSale += 1;
        saleAges.push(age);
      }
      if (hasSaleDates && isNeverSold(line)) noSaleCost += line.cost;
      if (isStale(line, today)) staleCost += line.cost;
      if (isStillBuyingDead(line, today)) buyingDeadCost += line.cost;
    });
    saleAges.sort((a, b) => a - b);
    return {
      qty,
      cost,
      pvp,
      skus: skus.size,
      extinguirCost,
      expiredCost,
      clearanceCost,
      noSaleCost,
      staleCost,
      buyingDeadCost,
      withLastSale,
      hasSaleDates,
      avgSaleDays: saleAges.length === 0 ? null : saleAges[Math.floor(saleAges.length / 2)],
    };
  }, [lines, today]);

  const hasSales = salesById.size > 0;
  const coverTotals = useMemo(() => {
    if (!hasSales) return { no12: 0, cover180: 0, cover365: 0 };
    let no12 = 0;
    let cover180 = 0;
    let cover365 = 0;
    lines.forEach((line) => {
      const cover = productCover.get(line.id);
      if (cover === null) no12 += line.cost;
      else {
        if (cover >= COVER_DAYS) cover180 += line.cost;
        if (cover >= COVER_YEAR_DAYS) cover365 += line.cost;
      }
    });
    return { no12, cover180, cover365 };
  }, [hasSales, lines, productCover]);

  const groups = useMemo(() => {
    const keyFn = {
      situacion: (line: StockLine) => line.situacion,
      familia: (line: StockLine) => line.familia,
      marca: (line: StockLine) => line.marca,
    }[group];
    return groupBy(lines, keyFn).slice(0, 20);
  }, [group, lines]);

  const riskLines = useMemo(() => {
    const hasSaleDates = stockHasSaleDates(lines);
    return lines
      .filter((line) => {
        const cover = productCover.get(line.id);
        const never = isNeverSold(line);
        const stale180 = isStale(line, today);
        const stale365 = isStale(line, today, STALE_YEAR_DAYS);
        const buying = isStillBuyingDead(line, today);
        if (riskFilter === 'sin-venta') return hasSaleDates && never;
        if (riskFilter === '180') return stale180;
        if (riskFilter === '365') return stale365;
        if (riskFilter === 'comprando') return buying;
        if (riskFilter === 'sin-12m') return hasSales && cover === null && line.qty > 0;
        if (riskFilter === 'cover-180') return hasSales && cover !== null && cover >= COVER_DAYS;
        if (riskFilter === 'cover-365') return hasSales && cover !== null && cover >= COVER_YEAR_DAYS;
        if (hasSales) {
          return (cover === null && line.qty > 0) || (cover !== null && cover >= COVER_DAYS) || never || stale180;
        }
        if (!hasSaleDates) return false;
        return never || stale180;
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 100);
  }, [hasSales, lines, productCover, riskFilter, today]);

  const saveSnapshot = () => {
    if (lines.length === 0) return;
    const next = buildStockSnapshot(lines, fileName ?? 'Stock.csv', today);
    setSnapshots((current) => upsertStockSnapshot(current, next));
    setNote(`Foto ${next.weekLabel} guardada en este navegador.`);
    setView('tendencia');
  };

  const chrono = [...snapshots].sort((a, b) => a.weekKey.localeCompare(b.weekKey) || a.savedAt.localeCompare(b.savedAt));

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
        {lines.length > 0 && (
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-1">
            {([
              ['resumen', 'Resumen'],
              ['riesgo', 'Riesgo'],
              ['tendencia', 'Tendencia'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  view === id ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Almacén</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Stock Equipaciones</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Foto semanal: coste y cobertura. Stock.csv y, si puedes, Ventas.csv para ver días de stock al ritmo de venta.
        </p>
      </section>

      <div className="grid max-w-4xl gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="stock-equipaciones-input"
            label="Stock Equipaciones"
            hint="Stock.csv: Referencia, cantidad, coste medio total, primera/última compra y venta"
            onFileLoaded={handleLoaded}
            keepDropzone
          />
          {fileName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {fileName} · {lines.length.toLocaleString('de-DE')} líneas · {totals.skus.toLocaleString('de-DE')} SKU
            </p>
          )}
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="stock-ventas-input"
            label="Ventas 12 meses"
            hint="Ventas.csv: id, Year-Month, Importe, Unidades. Primero el stock."
            onFileLoaded={handleLoaded}
            keepDropzone
          />
          {salesFileName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {salesFileName} · {salesById.size.toLocaleString('de-DE')} productos
            </p>
          )}
        </section>
      </div>

      {note && lines.length > 0 && (
        <p className="text-[12px] font-medium text-[var(--success)]">{note}</p>
      )}
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {lines.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Sube el export de stock de Equipaciones.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-secondary)]">
            Lo importante es el coste de lo que no se vende: sin venta o parado ≥ {STALE_SALE_DAYS} días.
          </p>
        </section>
      )}

      {lines.length > 0 && view === 'resumen' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Valor a coste" value={formatCurrency(totals.cost)} hint={`${formatQty(totals.qty)} ud · ${formatCurrency(totals.pvp)} PVP`} />
            <StatCard
              label="A extinguir"
              value={formatCurrency(totals.extinguirCost)}
              hint={`${formatPct(totals.extinguirCost, totals.cost)} del almacén`}
              tone="text-[var(--danger)]"
            />
            <StatCard
              label="Fin de venta pasado"
              value={formatCurrency(totals.expiredCost)}
              hint={`${formatPct(totals.expiredCost, totals.cost)} · ya fuera de vigencia`}
              tone="text-[var(--kpi-debt)]"
            />
            <StatCard
              label="Con dto. clearance"
              value={formatCurrency(totals.clearanceCost)}
              hint="Ya marcado para salir barato"
            />
            <StatCard
              label="Foto semanal"
              value={`${snapshots.length.toLocaleString('de-DE')} guardadas`}
              hint="Guarda esta semana para ver si el coste sube o baja"
            />
            {totals.hasSaleDates && (
              <>
                <StatCard
                  label="Sin última venta"
                  value={formatCurrency(totals.noSaleCost)}
                  hint={`${formatPct(totals.noSaleCost, totals.cost)} del coste · nunca vendido`}
                  tone={totals.noSaleCost > 0 ? 'text-[var(--danger)]' : undefined}
                />
                <StatCard
                  label={`Parado ≥ ${STALE_SALE_DAYS} días`}
                  value={formatCurrency(totals.staleCost)}
                  hint={totals.avgSaleDays === null
                    ? '—'
                    : `Mediana ${totals.avgSaleDays.toLocaleString('de-DE')} días desde última venta`}
                />
              </>
            )}
            {hasSales && (
              <>
                <StatCard
                  label="Sin venta 12 meses"
                  value={formatCurrency(coverTotals.no12)}
                  hint={`${formatPct(coverTotals.no12, totals.cost)} del almacén · el producto no ha salido`}
                  tone="text-[var(--danger)]"
                />
                <StatCard
                  label={`Cobertura ≥ ${COVER_YEAR_DAYS} días`}
                  value={formatCurrency(coverTotals.cover365)}
                  hint={`${formatPct(coverTotals.cover365, totals.cost)} · más de un año de stock al ritmo actual`}
                  tone="text-[var(--kpi-debt)]"
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['situacion', 'Situación'],
                ['familia', 'Familia'],
                ['marca', 'Marca'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGroup(id)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                    group === id
                      ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                      : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={saveSnapshot}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
            >
              <Camera className="h-3.5 w-3.5" />
              Guardar foto de esta semana
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-[var(--bg-soft)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">{group === 'situacion' ? 'Situación' : group === 'familia' ? 'Familia' : 'Marca'}</th>
                  <th className="px-3 py-2 text-right">Líneas</th>
                  <th className="px-3 py-2 text-right">Unidades</th>
                  <th className="px-3 py-2 text-right">Coste</th>
                  <th className="px-3 py-2 text-right">% almacén</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((row) => (
                  <tr key={row.label} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(row.rows)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(row.qty)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.cost)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPct(row.cost, totals.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {lines.length > 0 && view === 'riesgo' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Sin venta"
              value={formatCurrency(totals.noSaleCost)}
              hint={`${formatPct(totals.noSaleCost, totals.cost)} del almacén · nunca ha salido`}
              tone="text-[var(--danger)]"
            />
            <StatCard
              label={`Parado ≥ ${STALE_SALE_DAYS} días`}
              value={formatCurrency(totals.staleCost)}
              hint={totals.avgSaleDays === null
                ? 'Días desde la última venta'
                : `Mediana ${totals.avgSaleDays.toLocaleString('de-DE')} días en todo el almacén`}
            />
            <StatCard
              label={`Seguimos comprando`}
              value={formatCurrency(totals.buyingDeadCost)}
              hint={`Última compra ≤ ${RECENT_BUY_DAYS} días y no gira`}
              tone={totals.buyingDeadCost > 0 ? 'text-[var(--kpi-debt)]' : undefined}
            />
            {hasSales && (
              <>
                <StatCard
                  label="Sin venta 12 meses"
                  value={formatCurrency(coverTotals.no12)}
                  hint="El producto no ha vendido en el último año"
                  tone="text-[var(--danger)]"
                />
                <StatCard
                  label={`Cobertura ≥ ${COVER_YEAR_DAYS} días`}
                  value={formatCurrency(coverTotals.cover365)}
                  hint="Más de un año de stock al ritmo de venta"
                  tone="text-[var(--kpi-debt)]"
                />
              </>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="text-sm font-medium">Lo que no se vende</p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {hasSales
                    ? 'Cobertura al ritmo de los últimos 12 meses (por producto) y última venta (por talla). Top 100 por coste.'
                    : 'Sin venta o parado por última fecha. Sube Ventas.csv para ver días de cobertura.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['todo', 'Todo'],
                  ...(hasSales
                    ? [
                      ['sin-12m', 'Sin venta 12m'],
                      ['cover-180', `Cobertura ≥ ${COVER_DAYS}`],
                      ['cover-365', `Cobertura ≥ ${COVER_YEAR_DAYS}`],
                    ] as const
                    : []),
                  ['sin-venta', 'Sin venta'],
                  ['180', `≥ ${STALE_SALE_DAYS} días`],
                  ['365', `≥ ${STALE_YEAR_DAYS} días`],
                  ['comprando', 'Seguimos comprando'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRiskFilter(id)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                      riskFilter === id
                        ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                        : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-soft)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2 text-right">Ud</th>
                    <th className="px-3 py-2 text-right">Coste</th>
                    {hasSales && (
                      <>
                        <th className="px-3 py-2 text-right">Ud 12m</th>
                        <th className="px-3 py-2 text-right">Cobertura</th>
                      </>
                    )}
                    <th className="px-3 py-2">Última venta</th>
                    <th className="px-3 py-2">Última compra</th>
                    <th className="px-3 py-2 text-right">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {riskLines.length === 0 ? (
                    <tr>
                      <td colSpan={hasSales ? 9 : 7} className="px-3 py-8 text-center text-[13px] text-[var(--text-secondary)]">
                        Con este filtro no hay líneas.
                      </td>
                    </tr>
                  ) : riskLines.map((line) => {
                    const age = daysSince(line.lastSale, today);
                    return (
                      <tr key={line.key} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2">
                          <p className="font-medium">{line.producto || line.referencia}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{line.marca} · {line.referencia} · {line.talla || '—'}</p>
                        </td>
                        <td className="px-3 py-2">
                          {deadStockReason(line, today)}
                          {isStillBuyingDead(line, today) ? (
                            <span className="mt-0.5 block text-[10px] text-[var(--kpi-debt)]">Compra reciente</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(line.qty)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(line.cost)}</td>
                        {hasSales && (
                          <>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatQty(salesById.get(line.id)?.qty12 ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatCoverDays(productCover.get(line.id) ?? null)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {line.lastSale ? line.lastSale.toLocaleDateString('es-ES') : 'Nunca'}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {line.lastBuy ? line.lastBuy.toLocaleDateString('es-ES') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {age === null ? '—' : formatQty(age)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {view === 'tendencia' && (
        <section className="space-y-4">
          {note && <p className="text-[12px] font-medium text-[var(--success)]">{note}</p>}
          {snapshots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
              <TrendingUp className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
              <p className="mt-3 text-sm font-medium">Todavía no hay fotos semanales.</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-secondary)]">
                Sube el CSV del viernes, pulsa Guardar foto de esta semana. La siguiente foto te dice si el almacén ha crecido.
              </p>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={saveSnapshot}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-semibold"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Guardar foto de esta semana
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Coste del almacén</p>
                  <Sparkline values={chrono.map((row) => row.cost)} />
                </article>
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">A extinguir</p>
                  <Sparkline values={chrono.map((row) => row.extinguirCost)} />
                </article>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="bg-[var(--bg-soft)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Semana</th>
                      <th className="px-3 py-2 text-right">Coste</th>
                      <th className="px-3 py-2 text-right">A extinguir</th>
                      <th className="px-3 py-2 text-right">Caducado</th>
                      <th className="px-3 py-2 text-right">Temp. vieja</th>
                      <th className="px-3 py-2 text-right">Sin venta</th>
                      <th className="px-3 py-2 text-right">Parado</th>
                      <th className="px-3 py-2 text-right">SKU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((row) => (
                      <tr key={row.weekKey} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">
                          {row.weekLabel}
                          <span className="mt-0.5 block text-[10px] font-normal text-[var(--text-muted)]">{row.fileName}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.cost)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.extinguirCost)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.expiredCost)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.oldSeasonCost)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.noSaleCost ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(row.staleCost ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(row.skus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Las fotos viven en este navegador. Si subes dos veces la misma semana, se sustituye.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
