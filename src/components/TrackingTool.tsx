'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import FileUpload from '@/components/FileUpload';
import FreesTrackingView from '@/components/FreesTrackingView';
import GeneradosWebTrackingView from '@/components/GeneradosWebTrackingView';
import DeudaTrackingView, { parseDebtData, pickDebtSheet, type DebtClient } from '@/components/DeudaTrackingView';
import { classifyLine, normalizeText } from '@/lib/business-classification';
import {
  buildTrackingLines,
  filterByRange,
  freesFromOperation,
  generadosFromOperation,
  grassrootsBudgetFrom,
  parseBudgetRows,
  parseOperationRows,
  rangeFromFiscalMonths,
  shiftRange,
  snapshotFromFileName,
  webB2cBudgetFrom,
  type BudgetLine,
  type OperationLine,
} from '@/lib/seguimiento-files';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';

interface TrackingToolProps {
  onBack: () => void;
}

interface TrackingLine {
  key: string;
  monthIndex: number | null;
  monthLabel: string;
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
  gmLy: number;
}

interface MetricBlock {
  key: string;
  label: string;
  facturacion: number;
  budget: number;
  facturacionLy: number;
  gm: number;
  gmBudget: number;
  gmLy: number;
  rows: number;
}

type SortDirection = 'asc' | 'desc';
type TrackingViewMode = 'ytd' | 'monthly' | 'frees' | 'generados' | 'deuda';
type TableSortKey =
  | 'month'
  | 'vertical'
  | 'medio'
  | 'region'
  | 'zona'
  | 'facturacion'
  | 'budget'
  | 'diffFact'
  | 'vsBudget'
  | 'gm'
  | 'gmBudget'
  | 'diffGm'
  | 'mg'
  | 'mgBg'
  | 'mgDelta'
  | 'vsLy';

const AREA_ORDER = ['Grassroots', 'B2B', 'Pro Clubs', 'Sin área'];
const ZONA_ORDER = ['Norte', 'Portugal'];
const FISCAL_MONTHS = [
  { index: 1, label: '1 · Abril', names: ['abril', 'april', 'apr', 'abr'] },
  { index: 2, label: '2 · Mayo', names: ['mayo', 'may'] },
  { index: 3, label: '3 · Junio', names: ['junio', 'june', 'jun'] },
  { index: 4, label: '4 · Julio', names: ['julio', 'july', 'jul'] },
  { index: 5, label: '5 · Agosto', names: ['agosto', 'august', 'ago', 'aug'] },
  { index: 6, label: '6 · Septiembre', names: ['septiembre', 'setiembre', 'september', 'sept', 'sep', 'set'] },
  { index: 7, label: '7 · Octubre', names: ['octubre', 'october', 'oct'] },
  { index: 8, label: '8 · Noviembre', names: ['noviembre', 'november', 'nov'] },
  { index: 9, label: '9 · Diciembre', names: ['diciembre', 'december', 'dic', 'dec'] },
  { index: 10, label: '10 · Enero', names: ['enero', 'january', 'ene', 'jan'] },
  { index: 11, label: '11 · Febrero', names: ['febrero', 'february', 'feb'] },
  { index: 12, label: '12 · Marzo', names: ['marzo', 'march', 'mar'] },
] as const;

function extraLevelKind(area: string | null, subresponsable: string | null): 'zona' | 'vertical' | null {
  if (!subresponsable) return null;
  if (area === 'Grassroots' && subresponsable === 'Juanjo') return 'zona';
  if (area === 'Pro Clubs') return 'vertical';
  return null;
}

function extraLevelLabel(kind: 'zona' | 'vertical' | null): string {
  if (kind === 'zona') return 'Zona';
  if (kind === 'vertical') return 'Vertical';
  return '';
}

function extraLevelValue(line: TrackingLine, kind: 'zona' | 'vertical'): string {
  if (kind === 'zona') return line.zona || 'Sin zona';
  return line.vertical || 'Sin vertical';
}

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

function parsePercent(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) <= 1.5 ? value * 100 : value;
  }
  if (!cellPresent(value)) return null;
  return parseAmount(value);
}

function findColumn(headers: string[], test: (header: string) => boolean): number {
  return headers.findIndex(test);
}

function fiscalMonthByIndex(index: number): { index: number; label: string } | null {
  const found = FISCAL_MONTHS.find((month) => month.index === index);
  return found ? { index: found.index, label: found.label } : null;
}

function parseFiscalMonth(value: unknown): { index: number; label: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fiscalMonthByIndex(((value.getMonth() + 9) % 12) + 1);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 1 && rounded <= 12) return fiscalMonthByIndex(rounded);
    if (value > 20000 && value < 60000) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return parseFiscalMonth(date);
    }
  }

  if (!cellPresent(value)) return null;

  const normalized = normalizeText(value)
    .replace(/[._'`’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = FISCAL_MONTHS
    .flatMap((month) => month.names.map((name) => ({ name, month })))
    .sort((a, b) => b.name.length - a.name.length);

  const named = aliases.find(({ name }) => (
    name.length <= 3
      ? new RegExp(`(?:^| )${name}(?: |$)`).test(normalized)
      : normalized.includes(name)
  ));
  if (named) return { index: named.month.index, label: named.month.label };

  const numbered = normalized.match(/(?:^| )(1[0-2]|0?[1-9])(?: |$)/);
  if (!numbered) return null;
  return fiscalMonthByIndex(Number(numbered[1]));
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
    gmLy: 0,
    rows: 0,
  };
}

function addLine(block: MetricBlock, line: TrackingLine): void {
  block.facturacion += line.facturacion;
  block.budget += line.budget;
  block.facturacionLy += line.facturacionLy;
  block.gm += line.gm;
  block.gmBudget += line.gmBudget;
  block.gmLy += line.gmLy;
  block.rows += 1;
}

function collapseLine(line: TrackingLine): TrackingLine {
  const area = normalizeText(line.area);
  const isKingsLeague = normalizeText(line.vertical).includes('kings league');
  return {
    ...line,
    vertical: isKingsLeague ? 'Kings League' : line.vertical,
    region: isKingsLeague ? '' : line.region,
    zona: area === 'pro clubs' || area === 'b2b' || isKingsLeague ? '' : line.zona,
  };
}

function mergeTrackingLines(lines: TrackingLine[]): TrackingLine[] {
  const grouped = new Map<string, TrackingLine>();

  lines.forEach((line) => {
    const collapsed = collapseLine(line);
    const key = [
      collapsed.monthIndex ?? 'ytd',
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
    existing.gmLy += collapsed.gmLy;
  });

  return Array.from(grouped.values());
}

function withoutMonth(line: TrackingLine): TrackingLine {
  return { ...line, monthIndex: null, monthLabel: '' };
}

function aggregateYtdLines(lines: TrackingLine[]): TrackingLine[] {
  const tyMonths = new Set(
    lines
      .filter((line) => line.facturacion !== 0 || line.gm !== 0)
      .map((line) => line.monthIndex),
  );
  return mergeTrackingLines(lines.map((line) => {
    const keep = line.monthIndex !== null && tyMonths.has(line.monthIndex);
    return withoutMonth({
      ...line,
      budget: keep ? line.budget : 0,
      gmBudget: keep ? line.gmBudget : 0,
      facturacionLy: keep ? line.facturacionLy : 0,
      gmLy: keep ? line.gmLy : 0,
    });
  })).filter((line) => (
    line.facturacion !== 0 || line.budget !== 0 || line.gm !== 0 || line.gmBudget !== 0
    || line.facturacionLy !== 0 || line.gmLy !== 0
  ));
}

function parseTrackingData(rows: unknown[][]): TrackingLine[] {
  if (!rows.length) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes('vertical')));
  if (headerIndex < 0) {
    throw new Error('No encuentro la columna Vertical. ¿Es el export de Teamsports?');
  }

  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const colMap = {
    month: findColumn(headers, (header) => (
      !header.includes('medio')
      && (
        header === 'mes'
        || header === 'periodo'
        || header.includes('year-month')
        || header.includes('year month')
        || header.includes('ano-mes')
        || header.includes('ano mes')
        || header.includes('month')
        || header.includes('mes fiscal')
        || header.includes('# mes')
        || header.startsWith('mes')
      )
    )),
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
    marginLy: findColumn(headers, (header) => header.includes('margen') && header.includes('a/a')),
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
      const facturacionLy = colMap.facturacionLy >= 0 ? parseAmount(row[colMap.facturacionLy]) : 0;
      const marginLy = colMap.marginLy >= 0 ? parsePercent(row[colMap.marginLy]) : null;
      const month = colMap.month >= 0 ? parseFiscalMonth(row[colMap.month]) : null;

      return {
        key: `${index}|${month?.index ?? 'ytd'}|${vertical}|${medio}|${region}|${zona}`,
        monthIndex: month?.index ?? null,
        monthLabel: month?.label ?? '',
        vertical,
        medio,
        region,
        zona,
        ...classified,
        facturacion: parseAmount(row[colMap.facturacion]),
        budget: parseAmount(row[colMap.budget]),
        facturacionLy,
        gm: colMap.gm >= 0 ? parseAmount(row[colMap.gm]) : 0,
        gmBudget: colMap.gmBudget >= 0 ? parseAmount(row[colMap.gmBudget]) : 0,
        gmLy: marginLy === null ? 0 : facturacionLy * (marginLy / 100),
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
  ly,
  kind = 'money',
  showLyLabel = false,
}: {
  label: string;
  actual: number | null;
  budget: number | null;
  ly?: number | null;
  kind?: 'money' | 'margin';
  showLyLabel?: boolean;
}) {
  const actualN = actual ?? 0;
  const budgetN = budget ?? 0;
  const pct = kind === 'money' ? vsPct(actualN, budgetN) : (actual !== null && budget !== null ? actual - budget : null);
  const fillBase = budgetN === 0 ? 0 : (actualN / Math.abs(budgetN)) * 100;
  const fill = actual === null || budget === null ? 0 : Math.max(4, Math.min(100, fillBase));
  const delta = kind === 'money' ? actualN - budgetN : pct;
  const lyDelta = kind === 'money'
    ? vsPct(actualN, ly ?? 0)
    : (actual !== null && ly !== null && ly !== undefined ? actual - ly : null);

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
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
      <div className="w-[58px] shrink-0 border-l border-[var(--border)] pl-2 text-right">
        {showLyLabel && <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">vs LY</p>}
        <p className={`mt-3 text-[11px] font-semibold tabular-nums ${toneClass(lyDelta)}`}>
          {kind === 'money' ? formatPercent(lyDelta) : formatPp(lyDelta)}
        </p>
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
        <KpiBar label="Gross margin" actual={block.gm} budget={block.gmBudget} ly={block.gmLy} showLyLabel />
        <KpiBar label="Facturación" actual={block.facturacion} budget={block.budget} ly={block.facturacionLy} />
        <KpiBar
          label="% margen"
          actual={ratioPct(block.gm, block.facturacion)}
          budget={ratioPct(block.gmBudget, block.budget)}
          ly={ratioPct(block.gmLy, block.facturacionLy)}
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
    <div className="flex w-[320px] shrink-0 flex-col gap-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: TableSortKey;
  sort: { key: TableSortKey; direction: SortDirection };
  onSort: (key: TableSortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      <span>{label}</span>
      <Icon className={`h-3 w-3 ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} />
    </button>
  );
}

function lineSortValue(line: TrackingLine, key: TableSortKey): string | number | null {
  const sales = vsPct(line.facturacion, line.budget);
  const mg = ratioPct(line.gm, line.facturacion);
  const mgBg = ratioPct(line.gmBudget, line.budget);
  if (key === 'month') return line.monthIndex ?? 99;
  if (key === 'vertical') return line.vertical;
  if (key === 'medio') return line.medio;
  if (key === 'region') return line.region;
  if (key === 'zona') return line.zona;
  if (key === 'facturacion') return line.facturacion;
  if (key === 'budget') return line.budget;
  if (key === 'diffFact') return line.facturacion - line.budget;
  if (key === 'vsBudget') return sales;
  if (key === 'gm') return line.gm;
  if (key === 'gmBudget') return line.gmBudget;
  if (key === 'diffGm') return line.gm - line.gmBudget;
  if (key === 'mg') return mg;
  if (key === 'mgBg') return mgBg;
  if (key === 'mgDelta') return mg !== null && mgBg !== null ? mg - mgBg : null;
  return vsPct(line.facturacion, line.facturacionLy);
}

const DEFAULT_FY = 2026;
const DEFAULT_FROM_MONTH = 1;
const DEFAULT_TO_MONTH = 12;

function fyLabel(start: number): string {
  return `${String(start).slice(-2)}/${String(start + 1).slice(-2)}`;
}

export default function TrackingTool({ onBack }: TrackingToolProps) {
  const [operation, setOperation] = useState<OperationLine[]>([]);
  const [operationName, setOperationName] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [budgetRows, setBudgetRows] = useState<BudgetLine[]>([]);
  const [budgetName, setBudgetName] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [debtClients, setDebtClients] = useState<DebtClient[]>([]);
  const [debtSnapshot, setDebtSnapshot] = useState<Date | null>(null);
  const [debtName, setDebtName] = useState<string | null>(null);
  const [debtError, setDebtError] = useState<string | null>(null);
  const [fromMonth, setFromMonth] = useState(DEFAULT_FROM_MONTH);
  const [toMonth, setToMonth] = useState(DEFAULT_TO_MONTH);
  const [fyStart, setFyStart] = useState(DEFAULT_FY);
  const [viewMode, setViewMode] = useState<TrackingViewMode>('ytd');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedResponsable, setSelectedResponsable] = useState<string | null>(null);
  const [selectedSubresponsable, setSelectedSubresponsable] = useState<string | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: TableSortKey; direction: SortDirection }>({ key: 'diffFact', direction: 'desc' });
  const treeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const end = treeScrollRef.current?.querySelector('[data-tree-end]');
    end?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [selectedArea, selectedMonth, selectedResponsable, selectedSubresponsable]);

  useEffect(() => {
    setSelectedMonth(null);
    setSelectedArea(null);
    setSelectedResponsable(null);
    setSelectedSubresponsable(null);
    setSelectedExtra(null);
  }, [fromMonth, fyStart, toMonth]);

  const handleOperationLoaded = (data: unknown[][], name: string) => {
    try {
      const parsed = parseOperationRows(data);
      setOperation(parsed);
      setOperationName(name);
      setOperationError(null);
      setSelectedMonth(null);
      setSelectedArea(null);
      setSelectedResponsable(null);
      setSelectedSubresponsable(null);
      setSelectedExtra(null);
    } catch (err) {
      setOperation([]);
      setOperationName(null);
      setOperationError(err instanceof Error ? err.message : 'No he podido leer la operación.');
    }
  };

  const handleBudgetLoaded = (data: unknown[][], name: string) => {
    try {
      const parsed = parseBudgetRows(data);
      setBudgetRows(parsed);
      setBudgetName(name);
      setBudgetError(null);
    } catch (err) {
      setBudgetRows([]);
      setBudgetName(null);
      setBudgetError(err instanceof Error ? err.message : 'No he podido leer el budget.');
    }
  };

  const handleDebtLoaded = (sheets: Record<string, unknown[][]>, name: string) => {
    try {
      const parsed = parseDebtData(pickDebtSheet(sheets));
      setDebtClients(parsed.clients);
      setDebtSnapshot(parsed.snapshot ?? snapshotFromFileName(name));
      setDebtName(name);
      setDebtError(null);
    } catch (err) {
      setDebtClients([]);
      setDebtSnapshot(null);
      setDebtName(null);
      setDebtError(err instanceof Error ? err.message : 'No he podido leer la deuda.');
    }
  };

  const dateRange = useMemo(
    () => rangeFromFiscalMonths(fyStart, fromMonth, toMonth),
    [fromMonth, fyStart, toMonth],
  );
  const lyRange = useMemo(() => shiftRange(dateRange, -1), [dateRange]);

  const built = useMemo(() => buildTrackingLines(operation, budgetRows, dateRange), [budgetRows, dateRange, operation]);
  const lines = built.lines as TrackingLine[];
  const freeLines = useMemo(() => {
    const all = freesFromOperation(operation);
    return [...filterByRange(all, dateRange), ...filterByRange(all, lyRange)];
  }, [dateRange, lyRange, operation]);
  const genLines = useMemo(() => {
    const all = generadosFromOperation(operation);
    return [...filterByRange(all, dateRange), ...filterByRange(all, lyRange)];
  }, [dateRange, lyRange, operation]);
  const grassrootsBudget = useMemo(() => {
    if (!budgetName || budgetRows.length === 0) return null;
    try {
      return grassrootsBudgetFrom(budgetRows, budgetName);
    } catch {
      return null;
    }
  }, [budgetName, budgetRows]);
  const webB2cBudget = useMemo(() => {
    if (!budgetName || budgetRows.length === 0) return null;
    try {
      return webB2cBudgetFrom(budgetRows, budgetName);
    } catch {
      return null;
    }
  }, [budgetName, budgetRows]);
  const error = operationError;
  const periodLabel = useMemo(() => {
    const start = FISCAL_MONTHS.find((month) => month.index === Math.min(fromMonth, toMonth));
    const end = FISCAL_MONTHS.find((month) => month.index === Math.max(fromMonth, toMonth));
    return `${start?.label ?? fromMonth} → ${end?.label ?? toMonth} · FY ${fyLabel(fyStart)}`;
  }, [fromMonth, fyStart, toMonth]);

  const monthlyLines = useMemo(() => lines.filter((line) => line.monthIndex !== null), [lines]);
  const hasMonths = monthlyLines.length > 0;
  const ytdLines = useMemo(() => aggregateYtdLines(lines), [lines]);
  const zonaSales = useMemo(() => (
    (hasMonths ? monthlyLines : ytdLines).map((line) => ({
      zona: line.zona,
      monthIndex: line.monthIndex,
      facturacion: line.facturacion,
    }))
  ), [hasMonths, monthlyLines, ytdLines]);
  const debtSales = useMemo(() => (
    (hasMonths ? monthlyLines : ytdLines).map((line) => ({
      zona: line.zona,
      area: line.area,
      medio: line.medio,
      monthIndex: line.monthIndex,
      facturacion: line.facturacion,
    }))
  ), [hasMonths, monthlyLines, ytdLines]);
  const activeHasData = viewMode === 'ytd' ? ytdLines.length > 0 : hasMonths;

  const monthNodes = useMemo(() => {
    return groupMetrics(
      monthlyLines,
      (line) => line.monthLabel,
    ).sort((a, b) => {
      const orderA = FISCAL_MONTHS.find((month) => month.label === a.label)?.index ?? 99;
      const orderB = FISCAL_MONTHS.find((month) => month.label === b.label)?.index ?? 99;
      return orderA - orderB;
    });
  }, [monthlyLines]);

  const scopedLines = useMemo(() => {
    if (viewMode === 'ytd') return ytdLines;
    if (selectedMonth === null) return [];
    return monthlyLines.filter((line) => line.monthIndex === selectedMonth);
  }, [monthlyLines, selectedMonth, viewMode, ytdLines]);

  const company = useMemo(() => {
    const block = emptyMetrics('teamsports', 'Teamsports');
    ytdLines.forEach((line) => addLine(block, line));
    return block;
  }, [ytdLines]);

  const areaNodes = useMemo(() => groupMetrics(scopedLines, (line) => line.area), [scopedLines]);

  const responsableNodes = useMemo(() => {
    if (!selectedArea) return [];
    return groupMetrics(
      scopedLines.filter((line) => line.area === selectedArea),
      (line) => line.responsable,
    );
  }, [scopedLines, selectedArea]);

  const subresponsableNodes = useMemo(() => {
    if (!selectedArea || !selectedResponsable) return [];
    return groupMetrics(
      scopedLines.filter((line) => line.area === selectedArea && line.responsable === selectedResponsable),
      (line) => line.subresponsable,
    );
  }, [scopedLines, selectedArea, selectedResponsable]);

  const extraKind = extraLevelKind(selectedArea, selectedSubresponsable);

  const extraNodes = useMemo(() => {
    if (!selectedArea || !selectedResponsable || !selectedSubresponsable || !extraKind) return [];
    const nodes = groupMetrics(
      scopedLines.filter((line) => (
        line.area === selectedArea
        && line.responsable === selectedResponsable
        && line.subresponsable === selectedSubresponsable
      )),
      (line) => extraLevelValue(line, extraKind),
    );
    if (extraKind === 'zona') {
      return [...nodes].sort((a, b) => {
        const orderA = ZONA_ORDER.indexOf(a.label);
        const orderB = ZONA_ORDER.indexOf(b.label);
        if (orderA >= 0 || orderB >= 0) return (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB);
        return a.label.localeCompare(b.label, 'es');
      });
    }
    return nodes;
  }, [extraKind, scopedLines, selectedArea, selectedResponsable, selectedSubresponsable]);

  const detailLines = useMemo(() => {
    const source = viewMode === 'ytd' ? ytdLines : monthlyLines;
    return source.filter((line) => {
      if (viewMode === 'monthly' && selectedMonth !== null && line.monthIndex !== selectedMonth) return false;
      if (selectedArea && line.area !== selectedArea) return false;
      if (selectedResponsable && line.responsable !== selectedResponsable) return false;
      if (selectedSubresponsable && line.subresponsable !== selectedSubresponsable) return false;
      if (extraKind && selectedExtra && extraLevelValue(line, extraKind) !== selectedExtra) return false;
      return true;
    });
  }, [extraKind, monthlyLines, selectedArea, selectedExtra, selectedMonth, selectedResponsable, selectedSubresponsable, viewMode, ytdLines]);

  const sortedDetailLines = useMemo(() => {
    return [...detailLines].sort((a, b) => {
      const left = lineSortValue(a, sort.key);
      const right = lineSortValue(b, sort.key);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const result = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'es');
      return sort.direction === 'asc' ? result : -result;
    });
  }, [detailLines, sort]);

  const updateSort = (key: TableSortKey) => {
    setSort((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'month' || key === 'vertical' || key === 'medio' || key === 'region' || key === 'zona' ? 'asc' : 'desc' }
    ));
  };

  const downloadTable = () => {
    const header = viewMode === 'monthly'
      ? ['Mes', 'Área', 'Responsable', 'Subresponsable', 'Vertical', 'Medio', 'Región', 'Zona', 'Facturación', 'Budget', 'Dif. fact.', 'vs Budget %', 'GM', 'GM Budget', 'Dif. GM', '% mg', '% mg Bg', 'Δ mg pp', 'vs LY %']
      : ['Área', 'Responsable', 'Subresponsable', 'Vertical', 'Medio', 'Región', 'Zona', 'Facturación', 'Budget', 'Dif. fact.', 'vs Budget %', 'GM', 'GM Budget', 'Dif. GM', '% mg', '% mg Bg', 'Δ mg pp', 'vs LY %'];
    const rows = sortedDetailLines.map((line) => {
      const sales = vsPct(line.facturacion, line.budget);
      const mg = ratioPct(line.gm, line.facturacion);
      const mgBg = ratioPct(line.gmBudget, line.budget);
      const mgDelta = mg !== null && mgBg !== null ? mg - mgBg : null;
      const ly = vsPct(line.facturacion, line.facturacionLy);
      return [
        ...(viewMode === 'monthly' ? [line.monthLabel || 'Sin mes'] : []),
        line.area,
        line.responsable,
        line.subresponsable,
        line.vertical,
        line.medio,
        line.region,
        line.zona,
        line.facturacion,
        line.budget,
        line.facturacion - line.budget,
        sales,
        line.gm,
        line.gmBudget,
        line.gm - line.gmBudget,
        mg,
        mgBg,
        mgDelta,
        ly,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `seguimiento_${(pathLabel || 'tabla').replace(/[^\w]+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedMonthLabel = selectedMonth ? FISCAL_MONTHS.find((month) => month.index === selectedMonth)?.label : null;
  const pathLabel = ['Teamsports', selectedMonthLabel, selectedArea, selectedResponsable, selectedSubresponsable, selectedExtra].filter(Boolean).join(' › ');

  const switchView = (mode: TrackingViewMode) => {
    setViewMode(mode);
    setSelectedMonth(null);
    setSelectedArea(null);
    setSelectedResponsable(null);
    setSelectedSubresponsable(null);
    setSelectedExtra(null);
    setSort({ key: mode === 'monthly' ? 'month' : 'diffFact', direction: mode === 'monthly' ? 'asc' : 'desc' });
  };

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Seguimiento facturación</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              El ejercicio es abril 2026 → marzo 2027. Facturación, budget y vs LY se comparan en los meses que ya tienen dato, no contra el año entero. El 25/26 del CSV solo sirve para el LY.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Ejercicio
                <select
                  value={fyStart}
                  onChange={(event) => setFyStart(Number(event.target.value))}
                  className="mt-1 block rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value={2025}>25/26</option>
                  <option value={2026}>26/27</option>
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Desde
                <select
                  value={fromMonth}
                  onChange={(event) => setFromMonth(Number(event.target.value))}
                  className="mt-1 block rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  {FISCAL_MONTHS.map((month) => (
                    <option key={`from-${month.index}`} value={month.index}>{month.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Hasta
                <select
                  value={toMonth}
                  onChange={(event) => setToMonth(Number(event.target.value))}
                  className="mt-1 block rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  {FISCAL_MONTHS.map((month) => (
                    <option key={`to-${month.index}`} value={month.index}>{month.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setFyStart(DEFAULT_FY);
                  setFromMonth(DEFAULT_FROM_MONTH);
                  setToMonth(DEFAULT_TO_MONTH);
                }}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
              >
                Abr ’26 → Mar ’27
              </button>
            </div>
          </div>
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-1">
            <button
              type="button"
              onClick={() => switchView('ytd')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'ytd' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
              }`}
            >
              YTD
            </button>
            <button
              type="button"
              onClick={() => switchView('monthly')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'monthly' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
              }`}
            >
              Por meses
            </button>
            <button
              type="button"
              onClick={() => switchView('frees')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'frees' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
              }`}
            >
              Frees
            </button>
            <button
              type="button"
              onClick={() => switchView('generados')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'generados' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
              }`}
            >
              Generados
            </button>
            <button
              type="button"
              onClick={() => switchView('deuda')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'deuda' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
              }`}
            >
              Deuda
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="tracking-operation-input"
            label="1. Operación (data.csv)"
            hint="Year-Month, Vertical, Medio, Zona, Importe, Gm, Free, Gen. Web"
            onFileLoaded={handleOperationLoaded}
            keepDropzone
          />
          {operationName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {operationName} · {filterByRange(operation, dateRange).length.toLocaleString('de-DE')} líneas FY {fyLabel(fyStart)} · {ytdLines.length.toLocaleString('de-DE')} agrupadas
            </p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="tracking-budget-input"
            label="2. Budget (data2.csv)"
            hint="Año Mes, Vertical, Medio, Zona, Budget, GM Bg"
            onFileLoaded={handleBudgetLoaded}
            keepDropzone
          />
          {budgetName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {budgetName} · {budgetRows.length.toLocaleString('de-DE')} líneas
            </p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="tracking-debt-input"
            label="3. Deuda (Excel)"
            hint="Zona, Cliente, Deuda total, Vencida, No vencida"
            onFileLoaded={() => undefined}
            onWorkbookLoaded={handleDebtLoaded}
            keepDropzone
          />
          {debtName && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {debtName} · {debtClients.length.toLocaleString('de-DE')} clientes
            </p>
          )}
        </div>
      </section>

      {(operationError || budgetError || debtError) && (
        <div className="space-y-2">
          {operationError && (
            <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{operationError}</div>
          )}
          {budgetError && (
            <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{budgetError}</div>
          )}
          {debtError && (
            <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{debtError}</div>
          )}
        </div>
      )}

      {viewMode === 'frees' ? (
        <FreesTrackingView
          hideUploads
          preloadedLines={freeLines}
          preloadedName={operationName}
          preloadedBudget={grassrootsBudget}
        />
      ) : viewMode === 'generados' ? (
        <GeneradosWebTrackingView
          hideUploads
          zonaSales={zonaSales}
          preloadedLines={genLines}
          preloadedName={operationName}
          preloadedBudget={webB2cBudget}
        />
      ) : viewMode === 'deuda' ? (
        <DeudaTrackingView
          hideUpload
          salesLines={debtSales}
          preloadedClients={debtClients}
          preloadedSnapshot={debtSnapshot}
          preloadedName={debtName}
        />
      ) : (
        <>

      {!activeHasData && !error && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">
            {viewMode === 'monthly' && operation.length > 0 && !hasMonths
              ? 'Este archivo no trae Year-Month. Añade esa columna (Abr. ’26, Jul. ’26…) para ver los meses.'
              : 'Sube el CSV de operación. El 1 es abril. El budget y la deuda cruzan después.'}
          </p>
        </section>
      )}

      {activeHasData && (
        <>
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="mb-4 text-xs text-[var(--text-secondary)]">{pathLabel} · {periodLabel}. Facturación, budget y vs LY van por los mismos meses con dato. Pincha una caja para seguir bajando.</p>
            <div ref={treeScrollRef} className="flex items-start gap-2 overflow-x-auto pb-2">
              <TreeColumn title="Compañía">
                <TreeCard
                  block={company}
                  eyebrow={periodLabel}
                  selected={viewMode === 'monthly' ? selectedMonth === null && !selectedArea : !selectedArea}
                  onClick={() => {
                    setSelectedMonth(null);
                    setSelectedArea(null);
                    setSelectedResponsable(null);
                    setSelectedSubresponsable(null);
                    setSelectedExtra(null);
                  }}
                />
              </TreeColumn>

              {viewMode === 'monthly' && hasMonths && (
                <>
                  <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                  <div data-tree-end={!selectedMonth ? 'true' : undefined}>
                    <TreeColumn title="Mes" hint="1 = Abril">
                      {monthNodes.map((node) => {
                        const monthIndex = FISCAL_MONTHS.find((month) => month.label === node.label)?.index ?? null;
                        return (
                          <TreeCard
                            key={node.key}
                            block={node}
                            selected={selectedMonth === monthIndex}
                            onClick={() => {
                              setSelectedMonth(monthIndex);
                              setSelectedArea(null);
                              setSelectedResponsable(null);
                              setSelectedSubresponsable(null);
                              setSelectedExtra(null);
                            }}
                          />
                        );
                      })}
                    </TreeColumn>
                  </div>
                </>
              )}

              {(viewMode === 'ytd' || selectedMonth !== null) && (
                <>
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
                          setSelectedExtra(null);
                        }}
                      />
                    ))}
                  </TreeColumn>
                </>
              )}

              {selectedArea && (viewMode === 'ytd' || selectedMonth !== null) && (
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
                            setSelectedExtra(null);
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
                  <div data-tree-end={!selectedSubresponsable || !extraKind ? 'true' : undefined}>
                    <TreeColumn title="Subresponsable" hint={selectedResponsable}>
                      {(subresponsableNodes.length > 0
                        ? subresponsableNodes
                        : responsableNodes.filter((node) => node.key === selectedResponsable)
                      ).map((node) => (
                        <TreeCard
                          key={node.key}
                          block={node}
                          selected={selectedSubresponsable === node.key}
                          onClick={() => {
                            setSelectedSubresponsable(node.key);
                            setSelectedExtra(null);
                          }}
                        />
                      ))}
                    </TreeColumn>
                  </div>
                </>
              )}

              {extraKind && selectedSubresponsable && extraNodes.length > 0 && (
                <>
                  <ChevronRight className="mt-14 h-5 w-5 shrink-0 text-[var(--border-strong)]" />
                  <div data-tree-end="true">
                    <TreeColumn title={extraLevelLabel(extraKind)} hint={selectedSubresponsable}>
                      {extraNodes.map((node) => (
                        <TreeCard
                          key={node.key}
                          block={node}
                          selected={selectedExtra === node.key}
                          onClick={() => setSelectedExtra(selectedExtra === node.key ? null : node.key)}
                        />
                      ))}
                    </TreeColumn>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Líneas · {pathLabel}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Pincha una columna para ordenar. El export baja exactamente esta vista, con el orden actual.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadTable}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar tabla
              </button>
            </div>
            <div className="mt-3 max-h-[420px] overflow-auto">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead className="sticky top-0 bg-[var(--bg-soft)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    {viewMode === 'monthly' && (
                      <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><SortButton label="Mes" sortKey="month" sort={sort} onSort={updateSort} /></th>
                    )}
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><SortButton label="Vertical" sortKey="vertical" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><SortButton label="Medio" sortKey="medio" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><SortButton label="Región" sortKey="region" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><SortButton label="Zona" sortKey="zona" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="Facturación" sortKey="facturacion" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="Budget" sortKey="budget" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="Dif. fact." sortKey="diffFact" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="vs Budget" sortKey="vsBudget" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="GM" sortKey="gm" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="GM Bg" sortKey="gmBudget" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="Dif. GM" sortKey="diffGm" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="% mg" sortKey="mg" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="% mg Bg" sortKey="mgBg" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="Δ mg" sortKey="mgDelta" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><SortButton label="vs LY" sortKey="vsLy" sort={sort} onSort={updateSort} align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDetailLines.map((line) => {
                    const sales = vsPct(line.facturacion, line.budget);
                    const mg = ratioPct(line.gm, line.facturacion);
                    const mgBg = ratioPct(line.gmBudget, line.budget);
                    const mgDelta = mg !== null && mgBg !== null ? mg - mgBg : null;
                    const ly = vsPct(line.facturacion, line.facturacionLy);
                    return (
                      <tr key={line.key} className="border-b border-[var(--border)]">
                        {viewMode === 'monthly' && <td className="px-3 py-2">{line.monthLabel || '—'}</td>}
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
                        <td className={`px-3 py-2 text-right font-mono ${toneClass(ly)}`}>{formatPercent(ly)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
}
