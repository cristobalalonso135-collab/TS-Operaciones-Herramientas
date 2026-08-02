'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, XCircle } from 'lucide-react';

interface WorkbookUpload {
  fileName: string;
  sheets: Record<string, any[][]>;
}

interface ExactSheetResult {
  sheetName: string;
  status: 'ok' | 'missing-left' | 'missing-right' | 'different';
  leftRows: number;
  rightRows: number;
  leftCols: number;
  rightCols: number;
  differentCells: number;
  samples: string[];
}

interface ExactCompareSummary {
  same: boolean;
  totalDifferentCells: number;
  sheets: ExactSheetResult[];
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

const FIXED_COLUMNS = 4;
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

function comparableCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const dateKey = formatDateKey(value);
  if (dateKey) return `date:${dateKey}`;
  if (typeof value === 'number') return `num:${Math.round(value * 1000000) / 1000000}`;
  return `text:${String(value).replace(/\u00a0/g, ' ').trim()}`;
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

function compareWorkbooks(left: WorkbookUpload | null, right: WorkbookUpload | null): ExactCompareSummary | null {
  if (!left || !right) return null;

  const sheetNames = Array.from(new Set([...Object.keys(left.sheets), ...Object.keys(right.sheets)]));
  const sheets = sheetNames.map((sheetName): ExactSheetResult => {
    const leftRows = left.sheets[sheetName];
    const rightRows = right.sheets[sheetName];
    if (!leftRows) return { sheetName, status: 'missing-left', leftRows: 0, rightRows: rightRows?.length || 0, leftCols: 0, rightCols: Math.max(0, ...(rightRows || []).map((row) => row.length)), differentCells: 0, samples: [] };
    if (!rightRows) return { sheetName, status: 'missing-right', leftRows: leftRows.length, rightRows: 0, leftCols: Math.max(0, ...leftRows.map((row) => row.length)), rightCols: 0, differentCells: 0, samples: [] };

    const rowCount = Math.max(leftRows.length, rightRows.length);
    const colCount = Math.max(0, ...leftRows.map((row) => row.length), ...rightRows.map((row) => row.length));
    const samples: string[] = [];
    let differentCells = 0;

    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < colCount; col += 1) {
        const leftValue = comparableCell(leftRows[row]?.[col]);
        const rightValue = comparableCell(rightRows[row]?.[col]);
        if (leftValue === rightValue) continue;
        differentCells += 1;
        if (samples.length < 6) samples.push(`${sheetName}!${row + 1}:${col + 1}`);
      }
    }

    return {
      sheetName,
      status: differentCells === 0 ? 'ok' : 'different',
      leftRows: leftRows.length,
      rightRows: rightRows.length,
      leftCols: Math.max(0, ...leftRows.map((row) => row.length)),
      rightCols: Math.max(0, ...rightRows.map((row) => row.length)),
      differentCells,
      samples,
    };
  });

  const totalDifferentCells = sheets.reduce((sum, sheet) => sum + sheet.differentCells + (sheet.status === 'ok' ? 0 : sheet.status === 'different' ? 0 : 1), 0);
  return {
    same: sheets.every((sheet) => sheet.status === 'ok'),
    totalDifferentCells,
    sheets,
  };
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
  const [fyStartYear, setFyStartYear] = useState(2025);

  const exactSummary = useMemo(() => compareWorkbooks(leftWorkbook, rightWorkbook), [leftWorkbook, rightWorkbook]);
  const leftCogs = useMemo(() => validateCogs(leftWorkbook, fyStartYear), [leftWorkbook, fyStartYear]);
  const rightCogs = useMemo(() => validateCogs(rightWorkbook, fyStartYear), [rightWorkbook, fyStartYear]);

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
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Compara dos libros y revisa que COGS mantenga el mismo porcentaje por línea dentro del FY.</p>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">FY desde abril</span>
            <input
              type="number"
              value={fyStartYear}
              onChange={(event) => setFyStartYear(parseInt(event.target.value, 10) || 2025)}
              className="h-10 w-32 rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="validator-left-file"
            label="Archivo 1"
            onFileLoaded={() => {}}
            onWorkbookLoaded={handleLoad('left')}
          />
          {leftWorkbook && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {leftWorkbook.fileName}</p>}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <FileUpload
            inputId="validator-right-file"
            label="Archivo 2"
            onFileLoaded={() => {}}
            onWorkbookLoaded={handleLoad('right')}
          />
          {rightWorkbook && <p className="mt-2 text-xs text-[var(--text-secondary)]">Cargado: {rightWorkbook.fileName}</p>}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Comparación exacta</p>
            <h3 className="mt-1 text-lg font-semibold">Archivo 1 vs archivo 2</h3>
          </div>
          {exactSummary && <StatusPill ok={exactSummary.same} />}
        </div>

        {!exactSummary ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text-secondary)]">Carga los dos archivos para compararlos.</p>
        ) : exactSummary.same ? (
          <p className="rounded-md border border-green-200 bg-[var(--success-soft)] p-3 text-sm font-medium text-[var(--success)]">
            Los dos libros son exactamente iguales con la normalización de fechas y valores de la app.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Hay diferencias entre los libros. Revisa hojas, dimensiones y primeras celdas distintas.
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[780px] border-collapse text-sm">
                <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Hoja</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Estado</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Filas 1</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Filas 2</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Cols 1</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Cols 2</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Celdas distintas</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Ejemplos</th>
                  </tr>
                </thead>
                <tbody>
                  {exactSummary.sheets.map((sheet) => (
                    <tr key={sheet.sheetName} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{sheet.sheetName}</td>
                      <td className="px-3 py-2">{sheet.status}</td>
                      <td className="px-3 py-2 text-right font-mono">{sheet.leftRows}</td>
                      <td className="px-3 py-2 text-right font-mono">{sheet.rightRows}</td>
                      <td className="px-3 py-2 text-right font-mono">{sheet.leftCols}</td>
                      <td className="px-3 py-2 text-right font-mono">{sheet.rightCols}</td>
                      <td className="px-3 py-2 text-right font-mono">{sheet.differentCells.toLocaleString('de-DE')}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{sheet.samples.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {renderCogsValidation('Archivo 1', leftWorkbook, leftCogs)}
        {renderCogsValidation('Archivo 2', rightWorkbook, rightCogs)}
      </section>
    </div>
  );
}
