'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Download, FileSpreadsheet } from 'lucide-react';

type SourceKind = 'budget' | 'facturacion';
type StatusFilter = 'Todos' | CompareStatus;
type CompareStatus = 'OK' | 'Revisar' | 'Variación alta' | 'Base cero' | 'Solo budget' | 'Solo facturación';
type SortDirection = 'asc' | 'desc';
type SortKey = 'month' | 'vertical' | 'medio' | 'region' | 'zona' | 'facturacion' | 'budget' | 'diff' | 'pct' | 'status';

interface ParsedLine {
  monthKey: string;
  monthLabel: string;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  value: number;
}

interface CompareRow {
  key: string;
  monthKey: string;
  monthLabel: string;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  facturacion: number;
  budget: number;
  hasFacturacion: boolean;
  hasBudget: boolean;
  diff: number;
  pct: number | null;
  status: CompareStatus;
}

interface BudgetCompareToolProps {
  onBack: () => void;
}

const MONTHS = [
  ['abr', '01 · Abril'],
  ['may', '02 · Mayo'],
  ['jun', '03 · Junio'],
  ['jul', '04 · Julio'],
  ['ago', '05 · Agosto'],
  ['sep', '06 · Septiembre'],
  ['oct', '07 · Octubre'],
  ['nov', '08 · Noviembre'],
  ['dic', '09 · Diciembre'],
  ['ene', '10 · Enero'],
  ['feb', '11 · Febrero'],
  ['mar', '12 · Marzo'],
] as const;

const MONTH_ORDER: Map<string, number> = new Map(MONTHS.map(([, label], index) => [label, index]));

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;

  const raw = String(value).replace(/€/g, '').replace(/\s/g, '').trim();
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');

  return Number(normalized) || 0;
}

function normalizeMonth(value: unknown): { key: string; label: string } {
  const normalized = normalizeText(value).replace('.', '');
  const found = MONTHS.find(([short]) => normalized.startsWith(short));
  if (!found) return { key: normalized || 'sin mes', label: String(value || 'Sin mes') };

  return { key: found[1], label: found[1] };
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))));
}

function parseComparisonData(rows: any[][], kind: SourceKind): ParsedLine[] {
  if (!rows.length) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes('month')));
  const headers = (rows[headerIndex >= 0 ? headerIndex : 0] || []).map(normalizeHeader);
  const colMap = {
    month: findColumn(headers, ['month name', 'mes']),
    vertical: findColumn(headers, ['vertical']),
    medio: findColumn(headers, ['medio de venta', 'medio']),
    region: findColumn(headers, ['region', 'región']),
    zona: findColumn(headers, ['zona']),
    value: kind === 'budget' ? findColumn(headers, ['budget']) : findColumn(headers, ['importe', 'facturacion', 'facturación']),
  };

  const missing = Object.entries(colMap).filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Faltan columnas en ${kind}: ${missing.join(', ')}`);
  }

  return rows.slice((headerIndex >= 0 ? headerIndex : 0) + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''))
    .map((row) => {
      const month = normalizeMonth(row[colMap.month]);
      return {
        monthKey: month.key,
        monthLabel: month.label,
        vertical: String(row[colMap.vertical] ?? '').trim(),
        medio: String(row[colMap.medio] ?? '').trim(),
        region: String(row[colMap.region] ?? '').trim(),
        zona: String(row[colMap.zona] ?? '').trim(),
        value: parseAmount(row[colMap.value]),
      };
    });
}

function rowKey(line: Pick<ParsedLine, 'monthKey' | 'vertical' | 'medio' | 'region' | 'zona'>): string {
  return [
    line.monthKey,
    line.vertical,
    line.medio,
    line.region,
    line.zona,
  ].map(normalizeText).join('|');
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function uniqueOptions(rows: CompareRow[], getter: (row: CompareRow) => string): string[] {
  return Array.from(new Set(rows.map(getter).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
      >
        <option value="Todos">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
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
  sortKey: SortKey;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
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

export default function BudgetCompareTool({ onBack }: BudgetCompareToolProps) {
  const [budgetLines, setBudgetLines] = useState<ParsedLine[]>([]);
  const [facturacionLines, setFacturacionLines] = useState<ParsedLine[]>([]);
  const [budgetFile, setBudgetFile] = useState<string | null>(null);
  const [facturacionFile, setFacturacionFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [absThreshold, setAbsThreshold] = useState(10000);
  const [pctThreshold, setPctThreshold] = useState(30);
  const [filters, setFilters] = useState({
    month: 'Todos',
    vertical: 'Todos',
    medio: 'Todos',
    region: 'Todos',
    zona: 'Todos',
    status: 'Todos' as StatusFilter,
  });
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'diff', direction: 'desc' });

  const handleLoad = (kind: SourceKind) => (rows: any[][], fileName: string) => {
    try {
      const parsed = parseComparisonData(rows, kind);
      if (kind === 'budget') {
        setBudgetLines(parsed);
        setBudgetFile(fileName);
      } else {
        setFacturacionLines(parsed);
        setFacturacionFile(fileName);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido leer el CSV.');
    }
  };

  const comparisonRows = useMemo<CompareRow[]>(() => {
    const grouped = new Map<string, CompareRow>();

    const ensureRow = (line: ParsedLine): CompareRow => {
      const key = rowKey(line);
      const existing = grouped.get(key);
      if (existing) return existing;

      const row: CompareRow = {
        key,
        monthKey: line.monthKey,
        monthLabel: line.monthLabel,
        vertical: line.vertical,
        medio: line.medio,
        region: line.region,
        zona: line.zona,
        facturacion: 0,
        budget: 0,
        hasFacturacion: false,
        hasBudget: false,
        diff: 0,
        pct: null,
        status: 'OK',
      };
      grouped.set(key, row);
      return row;
    };

    facturacionLines.forEach((line) => {
      const row = ensureRow(line);
      row.facturacion += line.value;
      row.hasFacturacion = true;
    });

    budgetLines.forEach((line) => {
      const row = ensureRow(line);
      row.budget += line.value;
      row.hasBudget = true;
    });

    return Array.from(grouped.values()).map((row) => {
      const diff = row.budget - row.facturacion;
      const pct = row.facturacion !== 0 ? (diff / Math.abs(row.facturacion)) * 100 : null;
      const absDiff = Math.abs(diff);
      const absPct = Math.abs(pct ?? 0);
      let status: CompareStatus = 'OK';

      if (!row.hasFacturacion && row.hasBudget) status = 'Solo budget';
      else if (row.hasFacturacion && !row.hasBudget) status = 'Solo facturación';
      else if (row.facturacion === 0 && row.budget !== 0) status = 'Base cero';
      else if (absDiff >= absThreshold && absPct >= pctThreshold) status = 'Revisar';
      else if (absPct >= pctThreshold) status = 'Variación alta';

      return { ...row, diff, pct, status };
    });
  }, [absThreshold, budgetLines, facturacionLines, pctThreshold]);

  const filteredRows = useMemo(() => {
    const filtered = comparisonRows.filter((row) => (
      (filters.month === 'Todos' || row.monthLabel === filters.month) &&
      (filters.vertical === 'Todos' || row.vertical === filters.vertical) &&
      (filters.medio === 'Todos' || row.medio === filters.medio) &&
      (filters.region === 'Todos' || row.region === filters.region) &&
      (filters.zona === 'Todos' || row.zona === filters.zona) &&
      (filters.status === 'Todos' || row.status === filters.status)
    ));

    const getValue = (row: CompareRow): string | number => {
      if (sort.key === 'month') return MONTH_ORDER.get(row.monthLabel) ?? 99;
      if (sort.key === 'vertical') return row.vertical;
      if (sort.key === 'medio') return row.medio;
      if (sort.key === 'region') return row.region;
      if (sort.key === 'zona') return row.zona;
      if (sort.key === 'facturacion') return row.facturacion;
      if (sort.key === 'budget') return row.budget;
      if (sort.key === 'pct') return row.pct ?? Number.POSITIVE_INFINITY;
      if (sort.key === 'status') return row.status;
      return Math.abs(row.diff);
    };

    return [...filtered].sort((a, b) => {
      const aValue = getValue(a);
      const bValue = getValue(b);
      const direction = sort.direction === 'asc' ? 1 : -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue), 'es') * direction;
    });
  }, [comparisonRows, filters, sort]);

  const totals = useMemo(() => {
    const facturacion = filteredRows.reduce((sum, row) => sum + row.facturacion, 0);
    const budget = filteredRows.reduce((sum, row) => sum + row.budget, 0);
    const diff = budget - facturacion;
    const pct = facturacion !== 0 ? (diff / Math.abs(facturacion)) * 100 : null;
    const reviewCount = filteredRows.filter((row) => row.status !== 'OK').length;

    return { facturacion, budget, diff, pct, reviewCount };
  }, [filteredRows]);

  const options = useMemo(() => ({
    month: Array.from(new Set(comparisonRows.map((row) => row.monthLabel))).sort((a, b) => (MONTH_ORDER.get(a) ?? 99) - (MONTH_ORDER.get(b) ?? 99)),
    vertical: uniqueOptions(comparisonRows, (row) => row.vertical),
    medio: uniqueOptions(comparisonRows, (row) => row.medio),
    region: uniqueOptions(comparisonRows, (row) => row.region),
    zona: uniqueOptions(comparisonRows, (row) => row.zona),
    status: ['OK', 'Revisar', 'Variación alta', 'Base cero', 'Solo budget', 'Solo facturación'] as CompareStatus[],
  }), [comparisonRows]);

  const updateSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = () => {
    const header = ['Mes', 'Vertical', 'Medio de Venta', 'Región', 'Zona', 'Facturación FY 25/26', 'Budget FY 26/27', 'Diferencia', 'Variación %', 'Estado'];
    const rows = filteredRows.map((row) => [
      row.monthLabel,
      row.vertical,
      row.medio,
      row.region,
      row.zona,
      row.facturacion,
      row.budget,
      row.diff,
      row.pct ?? '',
      row.status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'comparativa_budget_vs_facturacion.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasBothFiles = budgetLines.length > 0 && facturacionLines.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Herramientas
        </button>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Comparador budget</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Compara facturación FY 25/26 contra budget FY 26/27 por mes, vertical, medio de venta, región y zona.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="facturacion-compare-input"
            label="Facturación FY 25/26"
            onFileLoaded={handleLoad('facturacion')}
          />
          {facturacionFile && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {facturacionFile}</p>}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="budget-compare-input"
            label="Budget FY 26/27"
            onFileLoaded={handleLoad('budget')}
          />
          {budgetFile && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {budgetFile}</p>}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}

      {hasBothFiles && (
        <>
          <section className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Facturación FY 25/26</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(totals.facturacion)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Budget FY 26/27</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(totals.budget)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Diferencia</p>
              <p className={`mt-1 text-xl font-semibold ${totals.diff >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(totals.diff)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Variación</p>
              <p className={`mt-1 text-xl font-semibold ${(totals.pct ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatPercent(totals.pct)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Puntos a revisar</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
                <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
                {totals.reviewCount.toLocaleString('de-DE')}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-4 grid gap-3 md:grid-cols-6">
              <FilterSelect label="Mes" value={filters.month} options={options.month} onChange={(value) => updateFilter('month', value)} />
              <FilterSelect label="Vertical" value={filters.vertical} options={options.vertical} onChange={(value) => updateFilter('vertical', value)} />
              <FilterSelect label="Medio" value={filters.medio} options={options.medio} onChange={(value) => updateFilter('medio', value)} />
              <FilterSelect label="Región" value={filters.region} options={options.region} onChange={(value) => updateFilter('region', value)} />
              <FilterSelect label="Zona" value={filters.zona} options={options.zona} onChange={(value) => updateFilter('zona', value)} />
              <FilterSelect label="Estado" value={filters.status} options={options.status} onChange={(value) => updateFilter('status', value as StatusFilter)} />
            </div>

            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Umbral diferencia €</span>
                  <input
                    type="number"
                    value={absThreshold}
                    onChange={(event) => setAbsThreshold(parseFloat(event.target.value) || 0)}
                    className="h-10 w-40 rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Umbral variación %</span>
                  <input
                    type="number"
                    value={pctThreshold}
                    onChange={(event) => setPctThreshold(parseFloat(event.target.value) || 0)}
                    className="h-10 w-40 rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
              >
                <Download className="h-4 w-4" />
                Exportar vista
              </button>
            </div>

            <div className="max-h-[620px] overflow-auto rounded-md border border-[var(--border)]">
              <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Mes" sortKey="month" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Vertical" sortKey="vertical" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Medio" sortKey="medio" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Región" sortKey="region" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Zona" sortKey="zona" sort={sort} onSort={updateSort} /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><SortButton label="Facturación" sortKey="facturacion" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><SortButton label="Budget" sortKey="budget" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><SortButton label="Diferencia" sortKey="diff" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><SortButton label="Variación" sortKey="pct" sort={sort} onSort={updateSort} align="right" /></th>
                    <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Estado" sortKey="status" sort={sort} onSort={updateSort} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.key} className="hover:bg-[var(--bg-primary)]">
                      <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.monthLabel}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap font-medium">{row.vertical}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.medio}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.region}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.zona}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{row.hasFacturacion ? formatCurrency(row.facturacion) : '-'}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{row.hasBudget ? formatCurrency(row.budget) : '-'}</td>
                      <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${row.diff >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(row.diff)}</td>
                      <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${(row.pct ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatPercent(row.pct)}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                          row.status === 'OK'
                            ? 'bg-[var(--success-soft)] text-[var(--success)]'
                            : row.status === 'Revisar' || row.status === 'Base cero'
                              ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                              : 'bg-amber-50 text-[var(--warning)]'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!hasBothFiles && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Carga los dos CSV para ver la comparativa.</p>
        </section>
      )}
    </div>
  );
}
