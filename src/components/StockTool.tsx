'use client';

import { useEffect, useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import {
  buildStockSnapshot,
  daysSince,
  isExpired,
  isExtinguir,
  isNeverSold,
  isOldSeason,
  isStale,
  isStockMovementFile,
  mergeStockMovements,
  parseStockMovements,
  parseStockRows,
  parseStockSnapshots,
  STOCK_SNAPSHOT_STORAGE,
  STALE_SALE_DAYS,
  stockAsOf,
  stockHasSaleDates,
  upsertStockSnapshot,
  type StockLine,
  type StockMovement,
  type StockSnapshot,
} from '@/lib/stock-files';
import { ArrowLeft, Camera, FileSpreadsheet, TrendingUp } from 'lucide-react';

interface StockToolProps {
  onBack: () => void;
}

type StockView = 'resumen' | 'riesgo' | 'tendencia';
type GroupKey = 'situacion' | 'year' | 'familia' | 'marca';

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
  const [baseLines, setBaseLines] = useState<StockLine[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [moveFileName, setMoveFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<StockView>('resumen');
  const [group, setGroup] = useState<GroupKey>('situacion');
  const [snapshots, setSnapshots] = useState<StockSnapshot[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseStockSnapshots(window.localStorage.getItem(STOCK_SNAPSHOT_STORAGE));
  });
  const [note, setNote] = useState<string | null>(null);
  const lines = useMemo(() => mergeStockMovements(baseLines, movements), [baseLines, movements]);
  const today = useMemo(() => stockAsOf(lines), [lines]);
  const currentYear = today.getFullYear();

  useEffect(() => {
    window.localStorage.setItem(STOCK_SNAPSHOT_STORAGE, JSON.stringify(snapshots));
  }, [snapshots]);

  const handleLoaded = (data: unknown[][], name: string) => {
    try {
      if (isStockMovementFile(data)) {
        if (baseLines.length === 0) {
          throw new Error('Primero sube el Stock.csv de Equipaciones.');
        }
        const parsedMoves = parseStockMovements(data);
        setMovements(parsedMoves);
        setMoveFileName(name);
        setError(null);
        setNote(`Cruzadas ${parsedMoves.length.toLocaleString('de-DE')} filas de movimiento.`);
        return;
      }
      const parsed = parseStockRows(data);
      setBaseLines(parsed);
      setFileName(name);
      setError(null);
      setNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const totals = useMemo(() => {
    let qty = 0;
    let cost = 0;
    let pvp = 0;
    let extinguirCost = 0;
    let expiredCost = 0;
    let oldSeasonCost = 0;
    let clearanceCost = 0;
    let noSaleCost = 0;
    let staleCost = 0;
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
      if (isOldSeason(line, currentYear)) oldSeasonCost += line.cost;
      if (line.clearance > 0) clearanceCost += line.cost;
      const age = daysSince(line.lastSale, today);
      if (age !== null) {
        withLastSale += 1;
        saleAges.push(age);
      }
      if (hasSaleDates && isNeverSold(line)) noSaleCost += line.cost;
      if (isStale(line, today)) staleCost += line.cost;
    });
    saleAges.sort((a, b) => a - b);
    return {
      qty,
      cost,
      pvp,
      skus: skus.size,
      extinguirCost,
      expiredCost,
      oldSeasonCost,
      clearanceCost,
      noSaleCost,
      staleCost,
      withLastSale,
      hasSaleDates,
      avgSaleDays: saleAges.length === 0 ? null : saleAges[Math.floor(saleAges.length / 2)],
    };
  }, [currentYear, lines, today]);

  const groups = useMemo(() => {
    const keyFn = {
      situacion: (line: StockLine) => line.situacion,
      year: (line: StockLine) => (line.year ? String(line.year) : 'Sin año'),
      familia: (line: StockLine) => line.familia,
      marca: (line: StockLine) => line.marca,
    }[group];
    return groupBy(lines, keyFn).slice(0, 20);
  }, [group, lines]);

  const riskLines = useMemo(() => {
    const hasSaleDates = stockHasSaleDates(lines);
    return lines
      .filter((line) => (
        isExtinguir(line.situacion)
        || isExpired(line, today)
        || isOldSeason(line, currentYear)
        || line.clearance >= 40
        || (hasSaleDates && isNeverSold(line))
        || isStale(line, today)
      ))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 80);
  }, [currentYear, lines, today]);

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
          Foto semanal del almacén: coste, a extinguir, temporada y rotación. Sube este Stock.csv cada viernes.
        </p>
      </section>

      <div className="grid max-w-4xl gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="stock-equipaciones-input"
            label="Stock Equipaciones"
            hint="El export definitivo: Referencia, coste, fin de venta, primera/última compra y venta"
            onFileLoaded={handleLoaded}
            keepDropzone
          />
          {fileName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {fileName} · {lines.length.toLocaleString('de-DE')} líneas · {totals.skus.toLocaleString('de-DE')} SKU
            </p>
          )}
        </section>
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="stock-movimientos-input"
            label="Fechas (opcional)"
            hint="Solo si un día vienen aparte. Este Stock.csv ya las trae."
            onFileLoaded={handleLoaded}
            keepDropzone
          />
          {moveFileName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {moveFileName} · {movements.length.toLocaleString('de-DE')} productos
            </p>
          )}
        </section>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {lines.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Sube el export de stock de Equipaciones.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-secondary)]">
            Lo importante es el coste. Este archivo ya trae compra/venta: verás nunca vendido y parado ≥ 180 días.
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
              label={`Temporada ≤ ${currentYear - 2}`}
              value={formatCurrency(totals.oldSeasonCost)}
              hint={`${formatPct(totals.oldSeasonCost, totals.cost)} · carry de años viejos`}
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['situacion', 'Situación'],
                ['year', 'Año'],
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
                  <th className="px-3 py-2">{group === 'situacion' ? 'Situación' : group === 'year' ? 'Año' : group === 'familia' ? 'Familia' : 'Marca'}</th>
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
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-medium">Lo que más riesgo tiene de perder valor</p>
            <p className="text-[12px] text-[var(--text-secondary)]">
              A extinguir, fin de venta pasado, temporada ≤ {currentYear - 2} o clearance ≥ 40%
              {totals.hasSaleDates ? `, sin venta o parado ≥ ${STALE_SALE_DAYS} días` : ''}. Top 80 por coste.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-[var(--bg-soft)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Situación</th>
                  <th className="px-3 py-2">Año</th>
                  <th className="px-3 py-2 text-right">Ud</th>
                  <th className="px-3 py-2 text-right">Coste</th>
                  <th className="px-3 py-2 text-right">Clearance</th>
                  {totals.hasSaleDates && (
                    <>
                      <th className="px-3 py-2">Última venta</th>
                      <th className="px-3 py-2 text-right">Días</th>
                    </>
                  )}
                  <th className="px-3 py-2">Fin venta</th>
                </tr>
              </thead>
              <tbody>
                {riskLines.map((line) => (
                  <tr key={line.key} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      <p className="font-medium">{line.producto || line.referencia}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{line.marca} · {line.referencia} · {line.talla || '—'}</p>
                    </td>
                    <td className="px-3 py-2">{line.situacion || '—'}</td>
                    <td className="px-3 py-2">{line.year ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(line.qty)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(line.cost)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.clearance ? `${formatQty(line.clearance)}%` : '—'}</td>
                    {totals.hasSaleDates && (
                      <>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {line.lastSale ? line.lastSale.toLocaleDateString('es-ES') : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {daysSince(line.lastSale, today) === null ? '—' : formatQty(daysSince(line.lastSale, today) as number)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {line.saleEnd ? line.saleEnd.toLocaleDateString('es-ES') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
