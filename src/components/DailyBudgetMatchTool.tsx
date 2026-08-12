'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Search,
  XCircle,
} from 'lucide-react';

interface WorkbookUpload {
  fileName: string;
  sheets: Record<string, any[][]>;
}

interface DailyBudgetMatchToolProps {
  onBack: () => void;
}

type SheetKind = 'Facturación' | 'COGS';

interface CellMismatch {
  key: string;
  kind: SheetKind;
  line: string;
  date: string;
  valueA: number | null;
  valueB: number | null;
  diff: number | null;
  cellA?: string;
  cellB?: string;
  status: 'mismatch' | 'solo-a' | 'solo-b';
}

const CENTIMO = 0.01;
const DEFAULT_CUTOFF = '2026-03-31';

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

function normalizeCountryCode(value: unknown): string {
  const text = normalizeText(value).replace(/\./g, '');
  if (['es', 'esp', 'espana', 'spain'].includes(text)) return 'ES';
  if (['fr', 'fra', 'francia', 'france'].includes(text)) return 'FR';
  if (['it', 'ita', 'italia', 'italy'].includes(text)) return 'IT';
  if (['pt', 'prt', 'portugal'].includes(text)) return 'PT';
  if (['de', 'deu', 'ale', 'alemania', 'germany'].includes(text)) return 'DE';
  return String(value ?? '').trim().toUpperCase();
}

function normalizeZoneForCompare(value: unknown): string {
  return normalizeText(value)
    .replace(/^zona\s+/, '')
    .replace(/\s+/g, ' ');
}

function lineKey(parts: Array<unknown>): string {
  return parts.map((part) => normalizeText(part)).join('|');
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyEquals(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b);
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

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
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

function excelColumnName(index: number): string {
  let current = index + 1;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function findWideHeaderIndex(rows: any[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return (
      normalized.includes('id_vertical')
      && normalized.includes('nombre')
      && normalized.includes('zona_equipaciones')
      && normalized.includes('cod_mercado')
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
    if (normalizeText(name).includes('cogs') && findWideHeaderIndex(rows) >= 0) {
      return { name, rows };
    }
  }
  return null;
}

function extractSheetCells(
  workbook: WorkbookUpload,
  kind: SheetKind,
  cutoff: string
): {
  sheetName: string | null;
  cells: Map<string, { value: number | null; cell?: string; label: string }>;
  dateCount: number;
  lineCount: number;
} {
  const sheet = kind === 'COGS' ? findCogsSheet(workbook) : findFacturacionSheet(workbook);
  const cells = new Map<string, { value: number | null; cell?: string; label: string }>();
  if (!sheet) return { sheetName: null, cells, dateCount: 0, lineCount: 0 };

  const headerIndex = findWideHeaderIndex(sheet.rows);
  if (headerIndex < 0) return { sheetName: sheet.name, cells, dateCount: 0, lineCount: 0 };

  const header = sheet.rows[headerIndex];
  const dateColumns = header
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => (
      !!item.date && item.date <= cutoff
    ));

  const lines = new Set<string>();
  sheet.rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const baseKey = lineKey([idVertical, nombre, normalizeZoneForCompare(zona), normalizeCountryCode(codMercado)]);
    if (!baseKey.replace(/\|/g, '')) return;
    lines.add(baseKey);
    const label = [idVertical, nombre, zona, codMercado].filter(Boolean).join(' · ');

    dateColumns.forEach(({ index, date }) => {
      cells.set(`${baseKey}|${date}`, {
        value: numericValue(row[index]),
        cell: `${excelColumnName(index)}${headerIndex + 2 + rowOffset}`,
        label,
      });
    });
  });

  return {
    sheetName: sheet.name,
    cells,
    dateCount: dateColumns.length,
    lineCount: lines.size,
  };
}

function compareSheets(
  workbookA: WorkbookUpload,
  workbookB: WorkbookUpload,
  kind: SheetKind,
  cutoff: string
): {
  mismatches: CellMismatch[];
  compared: number;
  matched: number;
  dateCountA: number;
  dateCountB: number;
  sheetNameA: string | null;
  sheetNameB: string | null;
} {
  const left = extractSheetCells(workbookA, kind, cutoff);
  const right = extractSheetCells(workbookB, kind, cutoff);
  const keys = new Set([...Array.from(left.cells.keys()), ...Array.from(right.cells.keys())]);
  const mismatches: CellMismatch[] = [];
  let compared = 0;
  let matched = 0;

  keys.forEach((key) => {
    const cellA = left.cells.get(key);
    const cellB = right.cells.get(key);
    const valueA = cellA?.value ?? null;
    const valueB = cellB?.value ?? null;
    if (valueA === null && valueB === null) return;

    compared += 1;
    const date = key.slice(key.lastIndexOf('|') + 1);
    const line = cellA?.label || cellB?.label || key.slice(0, key.lastIndexOf('|'));

    if (valueA === null || valueB === null) {
      mismatches.push({
        key: `${kind}|${key}`,
        kind,
        line,
        date,
        valueA,
        valueB,
        diff: null,
        cellA: cellA?.cell,
        cellB: cellB?.cell,
        status: valueA === null ? 'solo-b' : 'solo-a',
      });
      return;
    }

    if (moneyEquals(valueA, valueB)) {
      matched += 1;
      return;
    }

    mismatches.push({
      key: `${kind}|${key}`,
      kind,
      line,
      date,
      valueA: roundMoney(valueA),
      valueB: roundMoney(valueB),
      diff: roundMoney(valueA - valueB),
      cellA: cellA?.cell,
      cellB: cellB?.cell,
      status: 'mismatch',
    });
  });

  mismatches.sort((a, b) => (
    a.kind.localeCompare(b.kind)
    || a.date.localeCompare(b.date)
    || a.line.localeCompare(b.line, 'es')
  ));

  return {
    mismatches,
    compared,
    matched,
    dateCountA: left.dateCount,
    dateCountB: right.dateCount,
    sheetNameA: left.sheetName,
    sheetNameB: right.sheetName,
  };
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
      ok ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'
    }`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export default function DailyBudgetMatchTool({ onBack }: DailyBudgetMatchToolProps) {
  const [fileA, setFileA] = useState<WorkbookUpload | null>(null);
  const [fileB, setFileB] = useState<WorkbookUpload | null>(null);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const [query, setQuery] = useState('');
  const [onlyKind, setOnlyKind] = useState<'all' | SheetKind>('all');

  const factCompare = useMemo(() => {
    if (!fileA || !fileB) return null;
    return compareSheets(fileA, fileB, 'Facturación', cutoff);
  }, [fileA, fileB, cutoff]);

  const cogsCompare = useMemo(() => {
    if (!fileA || !fileB) return null;
    return compareSheets(fileA, fileB, 'COGS', cutoff);
  }, [fileA, fileB, cutoff]);

  const allMismatches = useMemo(() => ([
    ...(factCompare?.mismatches || []),
    ...(cogsCompare?.mismatches || []),
  ]), [factCompare, cogsCompare]);

  const filteredMismatches = useMemo(() => {
    const needle = normalizeText(query);
    return allMismatches.filter((row) => {
      if (onlyKind !== 'all' && row.kind !== onlyKind) return false;
      if (!needle) return true;
      return (
        normalizeText(row.line).includes(needle)
        || row.date.includes(needle)
        || normalizeText(row.kind).includes(needle)
      );
    });
  }, [allMismatches, onlyKind, query]);

  const factOk = !!factCompare && factCompare.mismatches.length === 0;
  const cogsOk = !!cogsCompare && cogsCompare.mismatches.length === 0;
  const allOk = factOk && cogsOk && !!factCompare && !!cogsCompare;

  const downloadListado = async () => {
    if (filteredMismatches.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = [
      ['Hoja', 'Línea', 'Fecha', 'Celda A', 'Celda B', 'Archivo A €', 'Archivo B €', 'Dif. €', 'Estado'],
      ...filteredMismatches.map((row) => [
        row.kind,
        row.line,
        row.date,
        row.cellA || '',
        row.cellB || '',
        row.valueA,
        row.valueB,
        row.diff,
        row.status === 'mismatch' ? 'Desfase' : row.status === 'solo-a' ? 'Solo archivo A' : 'Solo archivo B',
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Desfases');
    const baseName = `${(fileA?.fileName || 'A').replace(/\.[^.]+$/, '')}_vs_${(fileB?.fileName || 'B').replace(/\.[^.]+$/, '')}`
      .replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_hasta_${cutoff}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Herramientas
      </button>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Cuadre diario vs diario</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Compara dos budgets diarios (Hoja1 facturación + COGS) celda a celda hasta la fecha que indiques.
              Debe cuadrar al céntimo.
            </p>
          </div>
          <label className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm">
            <span className="mr-2 text-[var(--text-secondary)]">Hasta el día</span>
            <input
              type="date"
              value={cutoff}
              onChange={(event) => setCutoff(event.target.value || DEFAULT_CUTOFF)}
              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--text-primary)]"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Archivo A</p>
              <p className="text-xs text-[var(--text-secondary)]">Referencia / original</p>
            </div>
          </div>
          <FileUpload
            inputId="daily-match-file-a"
            label="Sube el diario A…"
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets, fileName) => setFileA({ sheets, fileName })}
          />
          {fileA && <p className="mt-2 text-xs text-[var(--text-secondary)]">{fileA.fileName}</p>}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Archivo B</p>
              <p className="text-xs text-[var(--text-secondary)]">Ajustado / a comprobar</p>
            </div>
          </div>
          <FileUpload
            inputId="daily-match-file-b"
            label="Sube el diario B…"
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets, fileName) => setFileB({ sheets, fileName })}
          />
          {fileB && <p className="mt-2 text-xs text-[var(--text-secondary)]">{fileB.fileName}</p>}
        </div>
      </section>

      {!fileA || !fileB ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          Sube los dos diarios para comparar hasta el {displayDate(cutoff)}.
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Corte</p>
              <p className="mt-1 text-sm font-semibold">≤ {displayDate(cutoff)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Facturación</p>
              <div className="mt-2">
                <StatusBadge
                  ok={factOk}
                  label={factOk ? 'Cuadra al céntimo' : `${factCompare?.mismatches.length || 0} desfases`}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Comparadas: {factCompare?.compared || 0} · OK: {factCompare?.matched || 0}
                {' · '}Días A/B: {factCompare?.dateCountA || 0}/{factCompare?.dateCountB || 0}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">COGS</p>
              <div className="mt-2">
                <StatusBadge
                  ok={cogsOk}
                  label={cogsOk ? 'Cuadra al céntimo' : `${cogsCompare?.mismatches.length || 0} desfases`}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Comparadas: {cogsCompare?.compared || 0} · OK: {cogsCompare?.matched || 0}
                {' · '}Días A/B: {cogsCompare?.dateCountA || 0}/{cogsCompare?.dateCountB || 0}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Resultado</p>
              <div className="mt-2">
                <StatusBadge ok={allOk} label={allOk ? 'Todo cuadra' : `${allMismatches.length} incidencias`} />
              </div>
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar por línea, fecha u hoja…"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--text-primary)]"
              />
            </div>
            <select
              value={onlyKind}
              onChange={(event) => setOnlyKind(event.target.value as 'all' | SheetKind)}
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--text-primary)]"
            >
              <option value="all">Facturación + COGS</option>
              <option value="Facturación">Solo facturación</option>
              <option value="COGS">Solo COGS</option>
            </select>
            <button
              type="button"
              onClick={downloadListado}
              disabled={filteredMismatches.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" />
              Exportar listado
            </button>
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
              Desfases hasta {displayDate(cutoff)} ({filteredMismatches.length})
              {filteredMismatches.length > 300 ? ' · mostrando 300' : ''}
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Hoja</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Fecha</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Celdas A / B</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo A</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Archivo B</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif.</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMismatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                        {allOk
                          ? `Facturación y COGS cuadran al céntimo hasta el ${displayDate(cutoff)}.`
                          : 'No hay desfases con el filtro actual.'}
                      </td>
                    </tr>
                  ) : filteredMismatches.slice(0, 300).map((row) => (
                    <tr key={row.key} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2 text-xs font-medium">{row.kind}</td>
                      <td className="px-3 py-2 text-xs font-medium">{row.line}</td>
                      <td className="px-3 py-2 text-xs">{displayDate(row.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {[row.cellA, row.cellB].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {row.valueA === null ? 'Vacío' : formatCurrency(row.valueA)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {row.valueB === null ? 'Vacío' : formatCurrency(row.valueB)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${
                        row.diff !== null && Math.abs(row.diff) >= CENTIMO ? 'text-[var(--danger)]' : ''
                      }`}>
                        {row.diff === null ? '—' : formatCurrency(row.diff)}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--danger)]">
                        {row.status === 'mismatch' ? 'Desfase' : row.status === 'solo-a' ? 'Solo A' : 'Solo B'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
