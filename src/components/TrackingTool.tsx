'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import FileUpload from '@/components/FileUpload';
import { classifyLine, normalizeText } from '@/lib/business-classification';
import { ArrowLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';

interface TrackingToolProps {
  onBack: () => void;
}

interface TrackingLine {
  key: string;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  area: string;
  responsable: string;
  subresponsable: string;
  facturacion: number;
  budget: number;
  facturacionLy: number;
  gm: number;
  gmBudget: number;
}

interface MetricBlock {
  key: string;
  label: string;
  facturacion: number;
  budget: number;
  facturacionLy: number;
  gm: number;
  gmBudget: number;
  rows: number;
}

const AREA_ORDER = ['Grassroots', 'B2B', 'Pro Clubs', 'Sin área'];

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/^\*+\s*/, '').replace(/\s+/g, ' ');
}

function cellPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).replace(/\u00a0/g, ' ').trim() !== '';
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!cellPresent(value)) return 0;

  const raw = String(value).replace(/€/g, '').replace(/%/g, '').replace(/\s/g, '').trim();
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');

  return Number(normalized) || 0;
}

function findColumn(headers: string[], test: (header: string) => boolean): number {
  return headers.findIndex(test);
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function formatSignedCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value > 0 ? '+' : ''}${formatted}%`;
}

function formatAbsPercent(value: number | null, digits = 1): string {
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

function vsPct(actual: number, target: number): number | null {
  if (target === 0) return null;
  return ((actual - target) / Math.abs(target)) * 100;
}

function ratioPct(part: number, total: number): number | null {
  if (total === 0) return null;
  return (part / total) * 100;
}

function toneClass(value: number | null): string {
  if (value === null) return 'text-[var(--text-muted)]';
  if (value > 0.05) return 'text-[var(--success)]';
  if (value < -0.05) return 'text-[var(--danger)]';
  return 'text-[var(--text-secondary)]';
}

function barClass(value: number | null): string {
  if (value === null) return 'bg-[var(--border-strong)]';
  if (value > 0.05) return 'bg-[var(--success)]';
  if (value < -0.05) return 'bg-[var(--danger)]';
  return 'bg-[var(--text-muted)]';
}

function emptyMetrics(key: string, label: string): MetricBlock {
  return {
    key,
    label,
    facturacion: 0,
    budget: 0,
    facturacionLy: 0,
    gm: 0,
    gmBudget: 0,
    rows: 0,
  };
}

function addLine(block: MetricBlock, line: TrackingLine): void {
  block.facturacion += line.facturacion;
  block.budget += line.budget;
  block.facturacionLy += line.facturacionLy;
  block.gm += line.gm;
  block.gmBudget += line.gmBudget;
  block.rows += 1;
}

function collapseZona(line: TrackingLine): TrackingLine {
  const area = normalizeText(line.area);
  if (area === 'pro clubs' || area === 'b2b') {
    return { ...line, zona: '' };
  }
  return line;
}

function mergeTrackingLines(lines: TrackingLine[]): TrackingLine[] {
  const grouped = new Map<string, TrackingLine>();

  lines.forEach((line) => {
    const collapsed = collapseZona(line);
    const key = [
      collapsed.area,
      collapsed.responsable,
      collapsed.subresponsable,
      collapsed.vertical,
      collapsed.medio,
      collapsed.region,
      collapsed.zona,
    ].map((part) => normalizeText(part)).join('|');
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { ...collapsed, key });
      return;
    }

    existing.facturacion += collapsed.facturacion;
    existing.budget += collapsed.budget;
    existing.facturacionLy += collapsed.facturacionLy;
    existing.gm += collapsed.gm;
    existing.gmBudget += collapsed.gmBudget;
  });

  return Array.from(grouped.values());
}

function parseTrackingData(rows: unknown[][]): TrackingLine[] {
  if (!rows.length) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes('vertical')));
  if (headerIndex < 0) {
    throw new Error('No encuentro la columna Vertical. ¿Es el export de Teamsports?');
  }

  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const colMap = {
    vertical: findColumn(headers, (header) => header === 'vertical'),
    medio: findColumn(headers, (header) => header.includes('medio')),
    region: findColumn(headers, (header) => header.includes('region')),
    zona: findColumn(headers, (header) => header === 'zona'),
    facturacion: findColumn(headers, (header) => (
      header.includes('importe') && header.includes('teamsports') && !header.includes('a/a') && !header.includes('var')
    )),
    budget: findColumn(headers, (header) => (
      header.includes('budget') && header.includes('teamsports') && !header.includes('%') && !header.includes('desviacion')
    )),
    facturacionLy: findColumn(headers, (header) => header.includes('importe') && header.includes('a/a')),
    gm: findColumn(headers, (header) => header === 'gm'),
    gmBudget: findColumn(headers, (header) => header.includes('gm') && header.includes('bg')),
  };

  if (colMap.facturacion < 0) {
    colMap.facturacion = findColumn(headers, (header) => header.includes('importe') && !header.includes('a/a') && !header.includes('var'));
  }
  if (colMap.budget < 0) {
    colMap.budget = findColumn(headers, (header) => header.includes('budget') && !header.includes('%'));
  }
  if (colMap.gm < 0) {
    colMap.gm = findColumn(headers, (header) => header === 'gm' || header === 'margen bruto' || header === 'margen');
  }

  const missing = Object.entries({
    vertical: colMap.vertical,
    medio: colMap.medio,
    facturacion: colMap.facturacion,
    budget: colMap.budget,
  }).filter(([, index]) => index < 0).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Faltan columnas: ${missing.join(', ')}`);
  }

  const parsed = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)))
    .map((row, index) => {
      const vertical = String(row[colMap.vertical] ?? '').trim();
      const medio = String(row[colMap.medio] ?? '').trim();
      const region = colMap.region >= 0 ? String(row[colMap.region] ?? '').trim() : '';
      const zona = colMap.zona >= 0 ? String(row[colMap.zona] ?? '').trim() : '';
      const classified = classifyLine({ vertical, medio, region, zona });

      return {
        key: `${index}|${vertical}|${medio}|${region}|${zona}`,
        vertical,
        medio,
        region,
        zona,
        ...classified,
        facturacion: parseAmount(row[colMap.facturacion]),
        budget: parseAmount(row[colMap.budget]),
        facturacionLy: colMap.facturacionLy >= 0 ? parseAmount(row[colMap.facturacionLy]) : 0,
        gm: colMap.gm >= 0 ? parseAmount(row[colMap.gm]) : 0,
        gmBudget: colMap.gmBudget >= 0 ? parseAmount(row[colMap.gmBudget]) : 0,
      };
    })
    .filter((line) => (
      line.vertical !== ''
      && (line.facturacion !== 0 || line.budget !== 0 || line.gm !== 0 || line.gmBudget !== 0 || line.facturacionLy !== 0)
    ));

  return mergeTrackingLines(parsed);
}

function groupMetrics(lines: TrackingLine[], keyFn: (line: TrackingLine) => string): MetricBlock[] {
  const grouped = new Map<string, MetricBlock>();
  lines.forEach((line) => {
    const key = keyFn(line);
    const current = grouped.get(key) || emptyMetrics(key, key);
    addLine(current, line);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const areaA = AREA_ORDER.indexOf(a.label);
    const areaB = AREA_ORDER.indexOf(b.label);
    if (areaA >= 0 || areaB >= 0) return (areaA < 0 ? 99 : areaA) - (areaB < 0 ? 99 : areaB);
    if (a.label === 'Pendiente') return 1;
    if (b.label === 'Pendiente') return -1;
    return b.facturacion - a.facturacion;
  });
}

function KpiBar({
  label,
  actual,
  budget,
  kind = 'money',
}: {
  label: string;
  actual: number | null;
  budget: number | null;
  kind?: 'money' | 'margin';
}) {
  const actualN = actual ?? 0;
  const budgetN = budget ?? 0;
  const pct = kind === 'money' ? vsPct(actualN, budgetN) : (actual !== null && budget !== null ? actual - budget : null);
  const fillBase = budgetN === 0 ? 0 : (actualN / Math.abs(budgetN)) * 100;
  const fill = actual === null || budget === null ? 0 : Math.max(4, Math.min(100, fillBase));
  const delta = kind === 'money' ? actualN - budgetN : pct;

  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold tabular-nums leading-tight text-[var(--text-primary)]">
        {kind === 'money' ? formatCurrency(actualN) : formatAbsPercent(actual)}
        <span className="font-medium text-[var(--text-muted)]"> / {kind === 'money' ? formatCurrency(budgetN) : formatAbsPercent(budget)}</span>
      </p>
      <p className={`text-[11px] font-semibold tabular-nums ${toneClass(delta)}`}>
        {kind === 'money' ? `${formatSignedCurrency(actualN - budgetN)} · ${formatPercent(pct)}` : formatPp(delta)}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
        <div className={`h-full rounded-full ${barClass(kind === 'money' ? pct : delta)}`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

function TreeCard({
  block,
  selected,
  onClick,
  eyebrow,
}: {
  block: MetricBlock;
  selected?: boolean;
  onClick?: () => void;
  eyebrow?: string;
}) {
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
      {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{eyebrow}</p>}
      <p className={`font-display text-sm font-semibold ${eyebrow ? 'mt-1' : ''}`}>{block.label}</p>
      <div className="mt-3 space-y-3">
        <KpiBar label="Gross margin" actual={block.gm} budget={block.gmBudget} />
        <KpiBar label="Facturación" actual={block.facturacion} budget={block.budget} />
        <KpiBar
          label="% margen"
          actual={ratioPct(block.gm, block.facturacion)}
          budget={ratioPct(block.gmBudget, block.budget)}
          kind="margin"
        />
      </div>
    </button>
  );
}

function TreeColumn({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export default function TrackingTool({ onBack }: TrackingToolProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TrackingLine[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedResponsable, setSelectedResponsable] = useState<string | null>(null);
  const [selectedSubresponsable, setSelectedSubresponsable] = useState<string | null>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const end = treeScrollRef.current?.querySelector('[data-tree-end]');
    end?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [selectedArea, selectedResponsable]);

  const handleFileLoaded = (data: unknown[][], name: string) => {
    try {
      const parsed = parseTrackingData(data);
      if (parsed.length === 0) throw new Error('El archivo no tiene líneas con importe o budget.');
      setLines(parsed);
      setFileName(name);
      setError(null);
      setSelectedArea(null);
      setSelectedResponsable(null);
      setSelectedSubresponsable(null);
    } catch (err) {
      setLines([]);
      setFileName(null);
      setError(err instanceof Error ? err.message : 'No he podido leer el archivo.');
    }
  };

  const company = useMemo(() => {
    const block = emptyMetrics('teamsports', 'Teamsports');
    lines.forEach((line) => addLine(block, line));
    return block;
  }, [lines]);

  const areaNodes = useMemo(() => groupMetrics(lines, (line) => line.area), [lines]);

  const responsableNodes = useMemo(() => {
    if (!selectedArea) return [];
    return groupMetrics(
      lines.filter((line) => line.area === selectedArea),
      (line) => line.responsable,
    );
  }, [lines, selectedArea]);

  const subresponsableNodes = useMemo(() => {
    if (!selectedArea || !selectedResponsable) return [];
    return groupMetrics(
      lines.filter((line) => line.area === selectedArea && line.responsable === selectedResponsable),
      (line) => line.subresponsable,
    );
  }, [lines, selectedArea, selectedResponsable]);

  const detailLines = useMemo(() => {
    return lines.filter((line) => {
      if (selectedArea && line.area !== selectedArea) return false;
      if (selectedResponsable && line.responsable !== selectedResponsable) return false;
      if (selectedSubresponsable && line.subresponsable !== selectedSubresponsable) return false;
      return true;
    }).sort((a, b) => Math.abs(b.facturacion - b.budget) - Math.abs(a.facturacion - a.budget));
  }, [lines, selectedArea, selectedResponsable, selectedSubresponsable]);

  const pathLabel = ['Teamsports', selectedArea, selectedResponsable, selectedSubresponsable].filter(Boolean).join(' › ');

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Herramientas
        </button>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Seguimiento facturación</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Árbol de izquierda a derecha: Teamsports → área → responsable → subresponsable. En cada caja: gross margin, facturación y % margen, con importe, budget y diferencia.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <FileUpload
          inputId="tracking-input"
          label="Export Teamsports (CSV o Excel)"
          onFileLoaded={handleFileLoaded}
        />
        {fileName && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {fileName} · {lines.length.toLocaleString('de-DE')} líneas</p>}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {lines.length === 0 && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Carga el CSV para ver el árbol de seguimiento.</p>
        </section>
      )}

      {lines.length > 0 && (
        <>
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="mb-4 text-xs text-[var(--text-secondary)]">{pathLabel}. Pincha una caja para seguir bajando.</p>
            <div ref={treeScrollRef} className="flex items-start gap-2 overflow-x-auto pb-2">
              <TreeColumn title="Compañía">
                <TreeCard
                  block={company}
                  eyebrow="Total"
                  selected={!selectedArea}
                  onClick={() => {
                    setSelectedArea(null);
                    setSelectedResponsable(null);
                    setSelectedSubresponsable(null);
                  }}
                />
              </TreeColumn>

              <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />

              <TreeColumn title="Área" hint="Elige una rama">
                {areaNodes.map((node) => (
                  <TreeCard
                    key={node.key}
                    block={node}
                    selected={selectedArea === node.key}
                    onClick={() => {
                      setSelectedArea(node.key);
                      setSelectedResponsable(null);
                      setSelectedSubresponsable(null);
                    }}
                  />
                ))}
              </TreeColumn>

              {selectedArea && (
                <>
                  <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                  <div data-tree-end={!selectedResponsable ? 'true' : undefined}>
                    <TreeColumn title="Responsable" hint={selectedArea}>
                      {responsableNodes.map((node) => (
                        <TreeCard
                          key={node.key}
                          block={node}
                          selected={selectedResponsable === node.key}
                          onClick={() => {
                            setSelectedResponsable(node.key);
                            setSelectedSubresponsable(null);
                          }}
                        />
                      ))}
                    </TreeColumn>
                  </div>
                </>
              )}

              {selectedResponsable && (
                <>
                  <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                  <div data-tree-end="true">
                    <TreeColumn title="Subresponsable" hint={selectedResponsable}>
                      {(subresponsableNodes.length > 0
                        ? subresponsableNodes
                        : responsableNodes.filter((node) => node.key === selectedResponsable)
                      ).map((node) => (
                        <TreeCard
                          key={node.key}
                          block={node}
                          selected={selectedSubresponsable === node.key}
                          onClick={() => setSelectedSubresponsable(selectedSubresponsable === node.key ? null : node.key)}
                        />
                      ))}
                    </TreeColumn>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="text-sm font-semibold">Líneas · {pathLabel}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              En Pro Clubs y B2B la zona no parte las líneas: facturación y budget del mismo vertical/medio se suman juntos.
            </p>
            <div className="mt-3 max-h-[420px] overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="sticky top-0 bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Vertical</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Medio</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Región</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium">Zona</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturación</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Budget</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif. fact.</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">vs Budget</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">GM</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">GM Bg</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif. GM</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">% mg</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">% mg Bg</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Δ mg</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLines.map((line) => {
                    const sales = vsPct(line.facturacion, line.budget);
                    const mg = ratioPct(line.gm, line.facturacion);
                    const mgBg = ratioPct(line.gmBudget, line.budget);
                    const mgDelta = mg !== null && mgBg !== null ? mg - mgBg : null;
                    return (
                      <tr key={line.key} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2">{line.vertical}</td>
                        <td className="px-3 py-2">{line.medio}</td>
                        <td className="px-3 py-2">{line.region || '—'}</td>
                        <td className="px-3 py-2">{line.zona || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.facturacion)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.budget)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${toneClass(line.facturacion - line.budget)}`}>{formatSignedCurrency(line.facturacion - line.budget)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${toneClass(sales)}`}>{formatPercent(sales)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.gm)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.gmBudget)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${toneClass(line.gm - line.gmBudget)}`}>{formatSignedCurrency(line.gm - line.gmBudget)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatAbsPercent(mg)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatAbsPercent(mgBg)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${toneClass(mgDelta)}`}>{formatPp(mgDelta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
