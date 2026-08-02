'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

interface WorkbookUpload {
  fileName: string;
  sheets: Record<string, any[][]>;
}

interface WideLine {
  key: string;
  idVertical: string;
  nombre: string;
  zona: string;
  codMercado: string;
  values: Map<string, any>;
}

interface CogsIssue {
  key: string;
  type: string;
  line: string;
  date?: string;
  facturacion?: number | null;
  cogs?: number | null;
  expected?: number | null;
  diff?: number | null;
  ratio?: number | null;
}

interface CogsLineSummary {
  key: string;
  line: string;
  cogsRate: number | null;
  facturacion: number;
  cogs: number;
  checks: number;
  issues: number;
}

interface CogsValidation {
  ok: boolean;
  sheetFacturacion: string | null;
  sheetCogs: string | null;
  checkedCells: number;
  issueCount: number;
  totalFacturacion: number;
  totalCogs: number;
  lines: CogsLineSummary[];
  issues: CogsIssue[];
}

interface BudgetFileValidatorToolProps {
  onBack: () => void;
}

type ValidatorStep = 1 | 2 | 3;

interface BudgetDiffIssue {
  key: string;
  line: string;
  date?: string;
  leftValue: number;
  rightValue: number;
  diff: number;
}

interface BudgetDiffLine {
  key: string;
  line: string;
  leftTotal: number;
  rightTotal: number;
  diff: number;
  absDiff: number;
}

interface BudgetDiffSummary {
  ok: boolean;
  sheetLeft: string | null;
  sheetRight: string | null;
  label: string;
  totalLeft: number;
  totalRight: number;
  diff: number;
  checkedCells: number;
  issueCount: number;
  lines: BudgetDiffLine[];
  issues: BudgetDiffIssue[];
}

interface CombinedBudgetDiffSummary {
  ok: boolean;
  summaries: BudgetDiffSummary[];
}

const MONEY_TOLERANCE = 0.05;
const RATE_TOLERANCE = 0.001;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${year}-${month}-${day}`;
  }

  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (spanish) return `${spanish[3]}-${spanish[2].padStart(2, '0')}-${spanish[1].padStart(2, '0')}`;

  return null;
}

function displayDate(dateKey?: string): string {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/€/g, '').replace(/\s/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findWideHeaderIndex(rows: any[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return (
      normalized.includes('id_vertical') &&
      normalized.includes('nombre') &&
      normalized.includes('zona_equipaciones') &&
      normalized.includes('cod_mercado')
    );
  });
}

function findFacturacionSheet(workbook: WorkbookUpload): { name: string; rows: any[][] } | null {
  for (const [name, rows] of Object.entries(workbook.sheets)) {
    if (normalizeText(name).includes('cogs')) continue;
    if (findWideHeaderIndex(rows) >= 0) return { name, rows };
  }
  return null;
}

function findCogsSheet(workbook: WorkbookUpload): { name: string; rows: any[][] } | null {
  for (const [name, rows] of Object.entries(workbook.sheets)) {
    if (normalizeText(name).includes('cogs') && findWideHeaderIndex(rows) >= 0) return { name, rows };
  }
  return null;
}

function lineKey(parts: Array<unknown>): string {
  return parts.map((part) => normalizeText(part)).join('|');
}

function parseWideSheet(rows: any[][], fyStartYear: number): Map<string, WideLine> {
  const headerIndex = findWideHeaderIndex(rows);
  if (headerIndex < 0) return new Map();

  const header = rows[headerIndex];
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const dateColumns = header
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => (
      !!item.date && item.date >= fyStart && item.date <= fyEnd
    ));
  const lines = new Map<string, WideLine>();

  rows.slice(headerIndex + 1).forEach((row) => {
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const key = lineKey([idVertical, nombre, zona, codMercado]);
    if (!key.replace(/\|/g, '')) return;

    const values = new Map<string, any>();
    dateColumns.forEach(({ index, date }) => values.set(date, row[index] ?? null));
    lines.set(key, { key, idVertical, nombre, zona, codMercado, values });
  });

  return lines;
}

function getWideSheetDates(rows: any[][]): string[] {
  const headerIndex = findWideHeaderIndex(rows);
  if (headerIndex < 0) return [];

  return Array.from(new Set(
    rows[headerIndex]
      .map(formatDateKey)
      .filter((date): date is string => !!date)
  )).sort();
}

function parseWideSheetForDates(rows: any[][], dates: string[]): Map<string, WideLine> {
  const headerIndex = findWideHeaderIndex(rows);
  if (headerIndex < 0) return new Map();

  const header = rows[headerIndex];
  const wantedDates = new Set(dates);
  const dateColumns = header
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => !!item.date && wantedDates.has(item.date));
  const lines = new Map<string, WideLine>();

  rows.slice(headerIndex + 1).forEach((row) => {
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const key = lineKey([idVertical, nombre, zona, codMercado]);
    if (!key.replace(/\|/g, '')) return;

    const values = new Map<string, any>();
    dateColumns.forEach(({ index, date }) => values.set(date, row[index] ?? null));
    lines.set(key, { key, idVertical, nombre, zona, codMercado, values });
  });

  return lines;
}

function getFiscalYearsInWorkbook(workbook: WorkbookUpload | null): number[] {
  if (!workbook) return [];
  const dates = new Set<string>();
  const fact = findFacturacionSheet(workbook);
  const cogs = findCogsSheet(workbook);
  if (fact) getWideSheetDates(fact.rows).forEach((date) => dates.add(date));
  if (cogs) getWideSheetDates(cogs.rows).forEach((date) => dates.add(date));

  return Array.from(new Set(Array.from(dates).map((date) => {
    const year = parseInt(date.slice(0, 4), 10);
    const month = parseInt(date.slice(5, 7), 10);
    return month >= 4 ? year : year - 1;
  }))).sort((a, b) => a - b);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function validateCogs(workbook: WorkbookUpload | null, fyStartYear: number): CogsValidation | null {
  if (!workbook) return null;

  const factSheet = findFacturacionSheet(workbook);
  const cogsSheet = findCogsSheet(workbook);
  if (!factSheet || !cogsSheet) {
    return {
      ok: false,
      sheetFacturacion: factSheet?.name || null,
      sheetCogs: cogsSheet?.name || null,
      checkedCells: 0,
      issueCount: 1,
      totalFacturacion: 0,
      totalCogs: 0,
      lines: [],
      issues: [{ key: 'missing-sheet', type: 'No encuentro Hoja1 o COGS con formato ancho', line: workbook.fileName }],
    };
  }

  const factLines = parseWideSheet(factSheet.rows, fyStartYear);
  const cogsLines = parseWideSheet(cogsSheet.rows, fyStartYear);
  const issues: CogsIssue[] = [];
  const lines: CogsLineSummary[] = [];
  let checkedCells = 0;
  let totalFacturacion = 0;
  let totalCogs = 0;

  cogsLines.forEach((cogsLine, key) => {
    const factLine = factLines.get(key);
    const lineLabel = [cogsLine.idVertical, cogsLine.nombre, cogsLine.zona, cogsLine.codMercado].filter(Boolean).join(' · ');
    if (!factLine) {
      issues.push({ key: `${key}|missing-fact`, type: 'Línea COGS sin línea de facturación', line: lineLabel });
      return;
    }

    const ratios: number[] = [];
    let lineFacturacion = 0;
    let lineCogs = 0;
    let lineChecks = 0;
    let lineIssues = 0;

    cogsLine.values.forEach((rawCogs, date) => {
      const rawFact = factLine.values.get(date);
      const fact = numericValue(rawFact);
      const cogs = numericValue(rawCogs);
      const factBlank = fact === null;
      const cogsBlank = cogs === null;

      if (factBlank && cogsBlank) return;
      checkedCells += 1;
      lineChecks += 1;
      lineFacturacion += fact || 0;
      lineCogs += cogs || 0;
      totalFacturacion += fact || 0;
      totalCogs += cogs || 0;

      if (factBlank && !cogsBlank) {
        lineIssues += 1;
        issues.push({ key: `${key}|${date}|blank-fact`, type: 'COGS con facturación vacía', line: lineLabel, date, facturacion: null, cogs });
        return;
      }

      if (!factBlank && cogsBlank) {
        lineIssues += 1;
        issues.push({ key: `${key}|${date}|blank-cogs`, type: 'Facturación con COGS vacío', line: lineLabel, date, facturacion: fact, cogs: null });
        return;
      }

      if (!fact || fact === 0) {
        if (Math.abs(cogs || 0) > MONEY_TOLERANCE) {
          lineIssues += 1;
          issues.push({ key: `${key}|${date}|zero-fact`, type: 'Facturación 0 con COGS distinto de 0', line: lineLabel, date, facturacion: fact, cogs });
        }
        return;
      }

      if (cogs !== null) ratios.push(cogs / fact);
    });

    const cogsRate = median(ratios);

    if (cogsRate !== null) {
      cogsLine.values.forEach((rawCogs, date) => {
        const fact = numericValue(factLine.values.get(date));
        const cogs = numericValue(rawCogs);
        if (fact === null || cogs === null || fact === 0) return;

        const expected = fact * cogsRate;
        const diff = cogs - expected;
        const ratio = cogs / fact;
        if (Math.abs(diff) > MONEY_TOLERANCE && Math.abs(ratio - cogsRate) > RATE_TOLERANCE) {
          lineIssues += 1;
          if (issues.length < 250) {
            issues.push({ key: `${key}|${date}|rate`, type: 'COGS no mantiene el porcentaje de la línea', line: lineLabel, date, facturacion: fact, cogs, expected, diff, ratio });
          }
        }
      });
    }

    lines.push({
      key,
      line: lineLabel,
      cogsRate,
      facturacion: lineFacturacion,
      cogs: lineCogs,
      checks: lineChecks,
      issues: lineIssues,
    });
  });

  factLines.forEach((factLine, key) => {
    if (cogsLines.has(key)) return;
    const hasValues = Array.from(factLine.values.values()).some((value) => numericValue(value) !== null);
    if (!hasValues) return;
    const lineLabel = [factLine.idVertical, factLine.nombre, factLine.zona, factLine.codMercado].filter(Boolean).join(' · ');
    issues.push({ key: `${key}|missing-cogs`, type: 'Línea facturación sin línea COGS', line: lineLabel });
  });

  return {
    ok: issues.length === 0,
    sheetFacturacion: factSheet.name,
    sheetCogs: cogsSheet.name,
    checkedCells,
    issueCount: issues.length,
    totalFacturacion,
    totalCogs,
    lines: lines.sort((a, b) => b.issues - a.issues || Math.abs(b.cogs) - Math.abs(a.cogs)).slice(0, 20),
    issues: issues.slice(0, 80),
  };
}

function validateCogsAllFiscalYears(workbook: WorkbookUpload | null): CogsValidation | null {
  if (!workbook) return null;
  const years = getFiscalYearsInWorkbook(workbook);
  if (years.length === 0) return validateCogs(workbook, new Date().getFullYear());

  const validations = years
    .map((year) => ({ year, validation: validateCogs(workbook, year) }))
    .filter((item): item is { year: number; validation: CogsValidation } => !!item.validation);

  if (validations.length === 0) return null;

  return {
    ok: validations.every((item) => item.validation.ok),
    sheetFacturacion: validations[0].validation.sheetFacturacion,
    sheetCogs: validations[0].validation.sheetCogs,
    checkedCells: validations.reduce((sum, item) => sum + item.validation.checkedCells, 0),
    issueCount: validations.reduce((sum, item) => sum + item.validation.issueCount, 0),
    totalFacturacion: validations.reduce((sum, item) => sum + item.validation.totalFacturacion, 0),
    totalCogs: validations.reduce((sum, item) => sum + item.validation.totalCogs, 0),
    lines: validations
      .flatMap((item) => item.validation.lines.map((line) => ({ ...line, key: `${item.year}|${line.key}`, line: `FY ${item.year}/${String(item.year + 1).slice(-2)} · ${line.line}` })))
      .sort((a, b) => b.issues - a.issues || Math.abs(b.cogs) - Math.abs(a.cogs))
      .slice(0, 30),
    issues: validations
      .flatMap((item) => item.validation.issues.map((issue) => ({ ...issue, key: `${item.year}|${issue.key}`, line: `FY ${item.year}/${String(item.year + 1).slice(-2)} · ${issue.line}` })))
      .slice(0, 120),
  };
}

function compareWideValues(
  label: string,
  leftSheet: { name: string; rows: any[][] } | null,
  rightSheet: { name: string; rows: any[][] } | null,
  dates: string[]
): BudgetDiffSummary {
  if (!leftSheet || !rightSheet) {
    return {
      ok: false,
      sheetLeft: leftSheet?.name || null,
      sheetRight: rightSheet?.name || null,
      label,
      totalLeft: 0,
      totalRight: 0,
      diff: 0,
      checkedCells: 0,
      issueCount: 1,
      lines: [],
      issues: [{ key: `${label}|missing-sheet`, line: `No encuentro hoja ${label} con formato ancho`, leftValue: 0, rightValue: 0, diff: 0 }],
    };
  }

  const leftLines = parseWideSheetForDates(leftSheet.rows, dates);
  const rightLines = parseWideSheetForDates(rightSheet.rows, dates);
  const keys = Array.from(new Set([...Array.from(leftLines.keys()), ...Array.from(rightLines.keys())]));
  const lineDiffs: BudgetDiffLine[] = [];
  const issues: BudgetDiffIssue[] = [];
  let totalLeft = 0;
  let totalRight = 0;
  let checkedCells = 0;

  keys.forEach((key) => {
    const leftLine = leftLines.get(key);
    const rightLine = rightLines.get(key);
    const line = leftLine || rightLine;
    if (!line) return;

    const lineLabel = [line.idVertical, line.nombre, line.zona, line.codMercado].filter(Boolean).join(' · ');
    let leftTotal = 0;
    let rightTotal = 0;
    let absDiff = 0;

    dates.forEach((date) => {
      const leftValue = numericValue(leftLine?.values.get(date)) || 0;
      const rightValue = numericValue(rightLine?.values.get(date)) || 0;
      const diff = rightValue - leftValue;
      if (Math.abs(leftValue) > MONEY_TOLERANCE || Math.abs(rightValue) > MONEY_TOLERANCE) checkedCells += 1;
      leftTotal += leftValue;
      rightTotal += rightValue;
      absDiff += Math.abs(diff);
      if (Math.abs(diff) > MONEY_TOLERANCE && issues.length < 250) {
        issues.push({ key: `${label}|${key}|${date}`, line: lineLabel, date, leftValue, rightValue, diff });
      }
    });

    const diff = rightTotal - leftTotal;
    totalLeft += leftTotal;
    totalRight += rightTotal;
    if (Math.abs(diff) > MONEY_TOLERANCE || absDiff > MONEY_TOLERANCE) {
      lineDiffs.push({ key: `${label}|${key}`, line: lineLabel, leftTotal, rightTotal, diff, absDiff });
    }
  });

  return {
    ok: lineDiffs.length === 0,
    sheetLeft: leftSheet.name,
    sheetRight: rightSheet.name,
    label,
    totalLeft,
    totalRight,
    diff: totalRight - totalLeft,
    checkedCells,
    issueCount: issues.length,
    lines: lineDiffs.sort((a, b) => b.absDiff - a.absDiff).slice(0, 30),
    issues: issues.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 100),
  };
}

function compareLoadedVsPlanned(left: WorkbookUpload | null, right: WorkbookUpload | null): CombinedBudgetDiffSummary | null {
  if (!left || !right) return null;

  const factRight = findFacturacionSheet(right);
  const cogsRight = findCogsSheet(right);
  const factDates = factRight ? getWideSheetDates(factRight.rows) : [];
  const cogsDates = cogsRight ? getWideSheetDates(cogsRight.rows) : [];
  const summaries = [
    compareWideValues('Facturación', findFacturacionSheet(left), factRight, factDates),
    compareWideValues('COGS', findCogsSheet(left), cogsRight, cogsDates),
  ];

  return { ok: summaries.every((summary) => summary.ok), summaries };
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${ok ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {ok ? 'OK' : 'Revisar'}
    </span>
  );
}

export default function BudgetFileValidatorTool({ onBack }: BudgetFileValidatorToolProps) {
  const [leftWorkbook, setLeftWorkbook] = useState<WorkbookUpload | null>(null);
  const [rightWorkbook, setRightWorkbook] = useState<WorkbookUpload | null>(null);
  const [activeStep, setActiveStep] = useState<ValidatorStep>(1);

  const combinedDiff = useMemo(() => compareLoadedVsPlanned(leftWorkbook, rightWorkbook), [leftWorkbook, rightWorkbook]);
  const leftCogs = useMemo(() => validateCogsAllFiscalYears(leftWorkbook), [leftWorkbook]);

  const handleLoad = (side: 'left' | 'right') => (sheets: Record<string, any[][]>, fileName: string) => {
    const workbook = { sheets, fileName };
    if (side === 'left') setLeftWorkbook(workbook);
    else setRightWorkbook(workbook);
  };

  const renderCogsValidation = (title: string, workbook: WorkbookUpload | null, validation: CogsValidation | null) => (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">COGS</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{workbook?.fileName || 'Archivo no cargado'}</p>
        </div>
        {validation && <StatusPill ok={validation.ok} />}
      </div>

      {!validation ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text-secondary)]">Carga el archivo para validar COGS.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Celdas revisadas</p>
              <p className="mt-1 text-lg font-semibold">{validation.checkedCells.toLocaleString('de-DE')}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Incidencias</p>
              <p className={`mt-1 text-lg font-semibold ${validation.issueCount === 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{validation.issueCount.toLocaleString('de-DE')}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Facturación FY</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(validation.totalFacturacion)}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">COGS FY</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(validation.totalCogs)}</p>
            </div>
          </div>

          {validation.issues.length > 0 && (
            <div className="rounded-md border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">Primeras incidencias</div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead className="bg-white text-left text-[var(--text-secondary)]">
                    <tr>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Tipo</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Fecha</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturación</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Esperado</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.issues.map((issue) => (
                      <tr key={issue.key} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 text-[var(--danger)]">{issue.type}</td>
                        <td className="px-3 py-2 font-medium">{issue.line}</td>
                        <td className="px-3 py-2">{displayDate(issue.date)}</td>
                        <td className="px-3 py-2 text-right font-mono">{issue.facturacion === undefined || issue.facturacion === null ? '-' : formatCurrency(issue.facturacion)}</td>
                        <td className="px-3 py-2 text-right font-mono">{issue.cogs === undefined || issue.cogs === null ? '-' : formatCurrency(issue.cogs)}</td>
                        <td className="px-3 py-2 text-right font-mono">{issue.expected === undefined || issue.expected === null ? '-' : formatCurrency(issue.expected)}</td>
                        <td className="px-3 py-2 text-right font-mono">{issue.diff === undefined || issue.diff === null ? '-' : formatCurrency(issue.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-md border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">Líneas con más incidencias</div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[820px] border-collapse text-xs">
                <thead className="bg-white text-left text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS %</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturación</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Checks</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Incidencias</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.lines.map((line) => (
                    <tr key={line.key} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{line.line}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatPercent(line.cogsRate)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.facturacion)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.cogs)}</td>
                      <td className="px-3 py-2 text-right font-mono">{line.checks.toLocaleString('de-DE')}</td>
                      <td className={`px-3 py-2 text-right font-mono ${line.issues > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{line.issues.toLocaleString('de-DE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const renderBudgetDiff = (title: string, summary: BudgetDiffSummary | null) => (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Diferencias cuantitativas</p>
          <h3 className="mt-1 text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Compara importes FY de la hoja de facturación, línea a línea y día a día.</p>
        </div>
        {summary && <StatusPill ok={summary.ok} />}
      </div>

      {!summary ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text-secondary)]">Carga los dos archivos para ver diferencias cuantitativas.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Archivo 1</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(summary.totalLeft)}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Archivo 2</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(summary.totalRight)}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Diferencia</p>
              <p className={`mt-1 text-lg font-semibold ${Math.abs(summary.diff) <= MONEY_TOLERANCE ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(summary.diff)}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Celdas con diferencia</p>
              <p className="mt-1 text-lg font-semibold">{summary.issueCount.toLocaleString('de-DE')}</p>
            </div>
          </div>

          {summary.lines.length > 0 && (
            <div className="rounded-md border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">Principales diferencias por línea</div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[860px] border-collapse text-xs">
                  <thead className="bg-white text-left text-[var(--text-secondary)]">
                    <tr>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo 1</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo 2</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Diferencia</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif. absoluta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((line) => (
                      <tr key={line.key} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">{line.line}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.leftTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.rightTotal)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${Math.abs(line.diff) > MONEY_TOLERANCE ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{formatCurrency(line.diff)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.absDiff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {summary.issues.length > 0 && (
            <div className="rounded-md border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">Mayores diferencias por fecha</div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[880px] border-collapse text-xs">
                  <thead className="bg-white text-left text-[var(--text-secondary)]">
                    <tr>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Fecha</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo 1</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo 2</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.issues.map((issue) => (
                      <tr key={issue.key} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">{issue.line}</td>
                        <td className="px-3 py-2">{displayDate(issue.date)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(issue.leftValue)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(issue.rightValue)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--danger)]">{formatCurrency(issue.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderCombinedBudgetDiff = (title: string, summary: CombinedBudgetDiffSummary | null) => (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Comparación</p>
            <h3 className="mt-1 text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Compara Facturación y COGS usando únicamente las fechas existentes en el segundo archivo.
            </p>
          </div>
          {summary && <StatusPill ok={summary.ok} />}
        </div>
      </section>

      {!summary ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--text-secondary)]">Carga los dos archivos para comparar Facturación y COGS.</p>
      ) : (
        summary.summaries.map((item) => renderBudgetDiff(item.label, item))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Herramientas
      </button>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Validador budget</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Flujo de revisión: igualdad de archivos, validación COGS y comparación cargado vs previsto.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex rounded-md border border-[var(--border)] bg-white p-1">
              {[
                [1, '1 · Archivos'],
                [2, '2 · COGS'],
                [3, '3 · Cargado vs previsto'],
              ].map(([step, label]) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(step as ValidatorStep)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeStep === step ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="validator-left-file"
            label={activeStep === 2 ? 'Archivo a validar' : activeStep === 3 ? 'Budget cargado' : 'Archivo 1'}
            onFileLoaded={() => {}}
            onWorkbookLoaded={handleLoad('left')}
          />
          {leftWorkbook && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {leftWorkbook.fileName}</p>}
        </div>
        {activeStep !== 2 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <FileUpload
              inputId="validator-right-file"
              label={activeStep === 3 ? 'Budget previsto' : 'Archivo 2'}
              onFileLoaded={() => {}}
              onWorkbookLoaded={handleLoad('right')}
            />
            {rightWorkbook && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {rightWorkbook.fileName}</p>}
          </div>
        )}
      </section>

      {activeStep === 1 && renderCombinedBudgetDiff('Archivo 1 vs archivo 2', combinedDiff)}

      {activeStep === 2 && renderCogsValidation('Archivo a validar', leftWorkbook, leftCogs)}

      {activeStep === 3 && renderCombinedBudgetDiff('Budget cargado vs budget previsto', combinedDiff)}
    </div>
  );
}
