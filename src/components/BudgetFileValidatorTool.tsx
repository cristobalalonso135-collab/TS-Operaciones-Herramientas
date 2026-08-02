'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { ArrowLeft, CheckCircle2, Download, XCircle } from 'lucide-react';

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
  cells: Map<string, string>;
}

interface CogsIssue {
  key: string;
  type: string;
  line: string;
  date?: string;
  cell?: string;
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

interface CogsCorrectionChange {
  key: string;
  line: string;
  date: string;
  cell: string;
  current: number | null;
  expected: number | null;
  facturacion: number | null;
  cogsRate: number | null;
}

interface CogsCorrectionSummary {
  ok: boolean;
  sheetName: string | null;
  rows: any[][];
  changeCount: number;
  changes: CogsCorrectionChange[];
  skippedLines: string[];
}

interface BudgetFileValidatorToolProps {
  onBack: () => void;
}

type ValidatorStep = 1 | 2 | 3;

interface BudgetDiffIssue {
  key: string;
  line: string;
  date?: string;
  leftCell?: string;
  rightCell?: string;
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
  mode?: 'daily' | 'monthly-plan';
}

interface ValueEntry {
  line: string;
  value: number;
  cell?: string;
}

const DEFAULT_MONEY_TOLERANCE = 0.2;
const RATE_TOLERANCE = 0.001;
const MONTHS_ES = [
  ['abril', 4],
  ['mayo', 5],
  ['junio', 6],
  ['julio', 7],
  ['agosto', 8],
  ['septiembre', 9],
  ['setiembre', 9],
  ['octubre', 10],
  ['noviembre', 11],
  ['diciembre', 12],
  ['enero', 1],
  ['febrero', 2],
  ['marzo', 3],
] as const;

const VERTICAL_ID_BY_NAME: Record<string, string> = {
  'futbol emotion': '1',
  'football emotion': '1',
  'basketball emotion': '2',
  'the pitch': '6',
  'running emotion': '7',
  'rcd mallorca': '101',
  'sd huesca': '102',
  'nastic de tarragona': '103',
  'real zaragoza': '104',
  'real federacion andaluza de futbol': '105',
  'real club deportivo a coruna': '106',
  'kings league espana': '1001',
  'kings league italia': '1002',
  'kings league francia': '1003',
  'kings league alemania': '1004',
};

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

function normalizeCountryCode(value: unknown): string {
  const text = normalizeText(value).replace(/\./g, '');
  if (!text) return '';
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

function normalizeVerticalId(value: unknown): string {
  const raw = String(value ?? '').trim();
  const normalized = normalizeText(raw);
  return VERTICAL_ID_BY_NAME[normalized] || raw;
}

function monthStartFromLabel(value: unknown, fyStartYear: number): string | null {
  const text = normalizeText(value);
  const found = MONTHS_ES.find(([name]) => text.includes(name));
  if (!found) return null;
  const month = found[1];
  const year = month >= 4 ? fyStartYear : fyStartYear + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function detectFiscalStartYear(workbook: WorkbookUpload, fallback = 2026): number {
  for (const rows of Object.values(workbook.sheets)) {
    for (const row of rows.slice(0, 12)) {
      for (const cell of row) {
        const text = String(cell ?? '');
        const match = text.match(/(20\d{2})\s*\/\s*(?:20)?\d{2}/);
        if (match) return Number(match[1]);
      }
    }
  }
  return fallback;
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

  rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const key = lineKey([idVertical, nombre, zona, codMercado]);
    if (!key.replace(/\|/g, '')) return;

    const values = new Map<string, any>();
    const cells = new Map<string, string>();
    const rowNumber = headerIndex + 2 + rowOffset;
    dateColumns.forEach(({ index, date }) => {
      values.set(date, row[index] ?? null);
      cells.set(date, `${excelColumnName(index)}${rowNumber}`);
    });
    lines.set(key, { key, idVertical, nombre, zona, codMercado, values, cells });
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

  rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const key = lineKey([idVertical, nombre, zona, codMercado]);
    if (!key.replace(/\|/g, '')) return;

    const values = new Map<string, any>();
    const cells = new Map<string, string>();
    const rowNumber = headerIndex + 2 + rowOffset;
    dateColumns.forEach(({ index, date }) => {
      values.set(date, row[index] ?? null);
      cells.set(date, `${excelColumnName(index)}${rowNumber}`);
    });
    lines.set(key, { key, idVertical, nombre, zona, codMercado, values, cells });
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

function findMonthlyPlanSheet(workbook: WorkbookUpload): { name: string; rows: any[][]; headerIndex: number } | null {
  for (const [name, rows] of Object.entries(workbook.sheets)) {
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return (
        headers.some((header) => header.includes('mes')) &&
        headers.includes('vertical') &&
        headers.some((header) => header.includes('medio')) &&
        headers.includes('importe') &&
        headers.some((header) => header.includes('margen bruto'))
      );
    });
    if (headerIndex >= 0) return { name, rows, headerIndex };
  }
  return null;
}

function plannedColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))));
}

function plannedMonthlyValues(workbook: WorkbookUpload): { facturacion: Map<string, ValueEntry>; cogs: Map<string, ValueEntry>; sheetName: string; fyStartYear: number } | null {
  const sheet = findMonthlyPlanSheet(workbook);
  if (!sheet) return null;

  const fyStartYear = detectFiscalStartYear(workbook);
  const headers = sheet.rows[sheet.headerIndex].map(normalizeHeader);
  const colMap = {
    month: plannedColumn(headers, ['# mes', 'mes']),
    vertical: plannedColumn(headers, ['vertical']),
    medio: plannedColumn(headers, ['medio de venta', 'medio']),
    country: plannedColumn(headers, ['pais', 'país']),
    zone: plannedColumn(headers, ['zona']),
    amount: plannedColumn(headers, ['importe', 'budget']),
    margin: plannedColumn(headers, ['margen bruto']),
  };

  if (Object.values(colMap).some((index) => index < 0)) return null;

  const facturacion = new Map<string, ValueEntry>();
  const cogs = new Map<string, ValueEntry>();

  sheet.rows.slice(sheet.headerIndex + 1).forEach((row, rowOffset) => {
    const monthStart = monthStartFromLabel(row[colMap.month], fyStartYear);
    if (!monthStart) return;

    const amount = numericValue(row[colMap.amount]);
    if (amount === null) return;

    const margin = numericValue(row[colMap.margin]) || 0;
    const verticalId = normalizeVerticalId(row[colMap.vertical]);
    const medio = String(row[colMap.medio] ?? '').trim();
    const zone = normalizeZoneForCompare(row[colMap.zone]);
    const country = normalizeCountryCode(row[colMap.country]);
    const key = lineKey([verticalId, medio, zone, country, monthStart]);
    const line = [row[colMap.vertical], medio, row[colMap.zone], country, displayDate(monthStart)].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');
    const amountCell = `${excelColumnName(colMap.amount)}${sheet.headerIndex + 2 + rowOffset}`;
    const marginCell = `${excelColumnName(colMap.margin)}${sheet.headerIndex + 2 + rowOffset}`;

    const currentFact = facturacion.get(key);
    facturacion.set(key, {
      line,
      value: (currentFact?.value || 0) + amount,
      cell: currentFact?.cell ? `${currentFact.cell}, ${amountCell}` : amountCell,
    });

    const cogsValue = amount - margin;
    const currentCogs = cogs.get(key);
    cogs.set(key, {
      line,
      value: (currentCogs?.value || 0) + cogsValue,
      cell: currentCogs?.cell ? `${currentCogs.cell}, ${amountCell}/${marginCell}` : `${amountCell}/${marginCell}`,
    });
  });

  return { facturacion, cogs, sheetName: sheet.name, fyStartYear };
}

function loadedMonthlyValues(sheet: { name: string; rows: any[][] } | null, fyStartYear: number): Map<string, ValueEntry> {
  if (!sheet) return new Map();
  const lines = parseWideSheet(sheet.rows, fyStartYear);
  const values = new Map<string, ValueEntry>();

  lines.forEach((line) => {
    line.values.forEach((rawValue, date) => {
      const value = numericValue(rawValue);
      if (value === null) return;
      const monthStart = `${date.slice(0, 7)}-01`;
      const key = lineKey([line.idVertical, line.nombre, normalizeZoneForCompare(line.zona), normalizeCountryCode(line.codMercado), monthStart]);
      const label = [line.idVertical, line.nombre, line.zona, line.codMercado, displayDate(monthStart)].filter(Boolean).join(' · ');
      const existing = values.get(key);
      values.set(key, {
        line: existing?.line || label,
        value: (existing?.value || 0) + value,
        cell: existing?.cell || line.cells.get(date),
      });
    });
  });

  return values;
}

function compareValueMaps(
  label: string,
  leftValues: Map<string, ValueEntry>,
  rightValues: Map<string, ValueEntry>,
  sheetLeft: string | null,
  sheetRight: string | null,
  tolerance: number
): BudgetDiffSummary {
  const keys = Array.from(new Set([...Array.from(leftValues.keys()), ...Array.from(rightValues.keys())]));
  const lineDiffs: BudgetDiffLine[] = [];
  const issues: BudgetDiffIssue[] = [];
  let totalLeft = 0;
  let totalRight = 0;
  let checkedCells = 0;
  let issueCount = 0;

  keys.forEach((key) => {
    const left = leftValues.get(key);
    const right = rightValues.get(key);
    const leftValue = left?.value || 0;
    const rightValue = right?.value || 0;
    const diff = rightValue - leftValue;
    const line = right?.line || left?.line || key;
    const keyParts = key.split('|');
    const date = keyParts[keyParts.length - 1];

    totalLeft += leftValue;
    totalRight += rightValue;
    if (Math.abs(leftValue) > tolerance || Math.abs(rightValue) > tolerance) checkedCells += 1;
    if (Math.abs(diff) <= tolerance) return;

    issueCount += 1;
    lineDiffs.push({ key: `${label}|${key}`, line, leftTotal: leftValue, rightTotal: rightValue, diff, absDiff: Math.abs(diff) });
    if (issues.length < 250) {
      issues.push({ key: `${label}|${key}`, line, date, leftCell: left?.cell, rightCell: right?.cell, leftValue, rightValue, diff });
    }
  });

  return {
    ok: issueCount === 0,
    sheetLeft,
    sheetRight,
    label,
    totalLeft,
    totalRight,
    diff: totalRight - totalLeft,
    checkedCells,
    issueCount,
    lines: lineDiffs.sort((a, b) => b.absDiff - a.absDiff).slice(0, 30),
    issues: issues.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 100),
  };
}

function compareLoadedToMonthlyPlan(left: WorkbookUpload, right: WorkbookUpload, tolerance: number): CombinedBudgetDiffSummary | null {
  const plan = plannedMonthlyValues(right);
  if (!plan) return null;

  const factSheet = findFacturacionSheet(left);
  const cogsSheet = findCogsSheet(left);
  const summaries = [
    compareValueMaps('Facturación mensual', loadedMonthlyValues(factSheet, plan.fyStartYear), plan.facturacion, factSheet?.name || null, plan.sheetName, tolerance),
    compareValueMaps('COGS mensual', loadedMonthlyValues(cogsSheet, plan.fyStartYear), plan.cogs, cogsSheet?.name || null, plan.sheetName, tolerance),
  ];

  return { ok: summaries.every((summary) => summary.ok), summaries, mode: 'monthly-plan' };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildCogsCorrection(workbook: WorkbookUpload | null, tolerance: number): CogsCorrectionSummary | null {
  if (!workbook) return null;

  const factSheet = findFacturacionSheet(workbook);
  const cogsSheet = findCogsSheet(workbook);
  if (!factSheet || !cogsSheet) {
    return { ok: false, sheetName: cogsSheet?.name || null, rows: [], changeCount: 0, changes: [], skippedLines: ['No encuentro Hoja1 o COGS con formato ancho.'] };
  }

  const factHeaderIndex = findWideHeaderIndex(factSheet.rows);
  const cogsHeaderIndex = findWideHeaderIndex(cogsSheet.rows);
  if (factHeaderIndex < 0 || cogsHeaderIndex < 0) {
    return { ok: false, sheetName: cogsSheet.name, rows: [], changeCount: 0, changes: [], skippedLines: ['No encuentro cabeceras válidas.'] };
  }

  const factHeader = factSheet.rows[factHeaderIndex];
  const cogsHeader = cogsSheet.rows[cogsHeaderIndex];
  const factDateColumns = new Map<string, number>();
  factHeader.forEach((cell, index) => {
    const date = formatDateKey(cell);
    if (date) factDateColumns.set(date, index);
  });

  const cogsDateColumns = cogsHeader
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => !!item.date && factDateColumns.has(item.date));

  const factRows = new Map<string, any[]>();
  factSheet.rows.slice(factHeaderIndex + 1).forEach((row) => {
    const key = lineKey([row[0], row[1], row[2], row[3]]);
    if (key.replace(/\|/g, '')) factRows.set(key, row);
  });

  const correctedRows = cogsSheet.rows.map((row) => [...row]);
  const changes: CogsCorrectionChange[] = [];
  const skippedLines: string[] = [];
  let changeCount = 0;

  cogsSheet.rows.slice(cogsHeaderIndex + 1).forEach((cogsRow, rowOffset) => {
    const rowIndex = cogsHeaderIndex + 1 + rowOffset;
    const key = lineKey([cogsRow[0], cogsRow[1], cogsRow[2], cogsRow[3]]);
    if (!key.replace(/\|/g, '')) return;

    const factRow = factRows.get(key);
    const lineLabel = [cogsRow[0], cogsRow[1], cogsRow[2], cogsRow[3]].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');
    if (!factRow) {
      skippedLines.push(`${lineLabel}: sin línea de facturación`);
      return;
    }

    const ratios: number[] = [];
    cogsDateColumns.forEach(({ index, date }) => {
      const factIndex = factDateColumns.get(date);
      if (factIndex === undefined) return;
      const fact = numericValue(factRow[factIndex]);
      const cogs = numericValue(cogsRow[index]);
      if (fact !== null && fact !== 0 && cogs !== null) ratios.push(cogs / fact);
    });

    const cogsRate = median(ratios);
    let skippedByRate = false;

    cogsDateColumns.forEach(({ index, date }) => {
      const factIndex = factDateColumns.get(date);
      if (factIndex === undefined) return;
      const fact = numericValue(factRow[factIndex]);
      const current = numericValue(cogsRow[index]);
      let expected: number | null = null;
      let shouldEvaluate = true;

      if (fact === null) {
        expected = null;
      } else if (fact === 0) {
        expected = 0;
      } else if (cogsRate !== null) {
        expected = roundCurrency(fact * cogsRate);
      } else {
        shouldEvaluate = false;
        skippedByRate = true;
      }

      if (!shouldEvaluate) return;

      const changed = expected === null
        ? current !== null
        : current === null || Math.abs(current - expected) > tolerance;
      if (!changed) return;

      correctedRows[rowIndex][index] = expected === null ? '' : expected;
      changeCount += 1;
      if (changes.length < 150) {
        changes.push({
          key: `${key}|${date}`,
          line: lineLabel,
          date,
          cell: `${excelColumnName(index)}${rowIndex + 1}`,
          current,
          expected,
          facturacion: fact,
          cogsRate,
        });
      }
    });

    if (skippedByRate) skippedLines.push(`${lineLabel}: sin porcentaje COGS inferible`);
  });

  return {
    ok: skippedLines.length === 0,
    sheetName: cogsSheet.name,
    rows: correctedRows,
    changeCount,
    changes,
    skippedLines: Array.from(new Set(skippedLines)).slice(0, 80),
  };
}

function validateCogs(workbook: WorkbookUpload | null, fyStartYear: number, tolerance: number): CogsValidation | null {
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
        issues.push({ key: `${key}|${date}|blank-fact`, type: 'COGS con facturación vacía', line: lineLabel, date, cell: cogsLine.cells.get(date), facturacion: null, cogs });
        return;
      }

      if (!factBlank && cogsBlank) {
        lineIssues += 1;
        issues.push({ key: `${key}|${date}|blank-cogs`, type: 'Facturación con COGS vacío', line: lineLabel, date, cell: cogsLine.cells.get(date), facturacion: fact, cogs: null });
        return;
      }

      if (!fact || fact === 0) {
        if (Math.abs(cogs || 0) > tolerance) {
          lineIssues += 1;
          issues.push({ key: `${key}|${date}|zero-fact`, type: 'Facturación 0 con COGS distinto de 0', line: lineLabel, date, cell: cogsLine.cells.get(date), facturacion: fact, cogs });
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
        if (Math.abs(diff) > tolerance && Math.abs(ratio - cogsRate) > RATE_TOLERANCE) {
          lineIssues += 1;
          if (issues.length < 250) {
            issues.push({ key: `${key}|${date}|rate`, type: 'COGS no mantiene el porcentaje de la línea', line: lineLabel, date, cell: cogsLine.cells.get(date), facturacion: fact, cogs, expected, diff, ratio });
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

function validateCogsAllFiscalYears(workbook: WorkbookUpload | null, tolerance: number): CogsValidation | null {
  if (!workbook) return null;
  const years = getFiscalYearsInWorkbook(workbook);
  if (years.length === 0) return validateCogs(workbook, new Date().getFullYear(), tolerance);

  const validations = years
    .map((year) => ({ year, validation: validateCogs(workbook, year, tolerance) }))
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
  dates: string[],
  tolerance: number
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
  let issueCount = 0;

  keys.forEach((key) => {
    const leftLine = leftLines.get(key);
    const rightLine = rightLines.get(key);
    const line = leftLine || rightLine;
    if (!line) return;

    const lineLabel = [line.idVertical, line.nombre, line.zona, line.codMercado].filter(Boolean).join(' · ');
    let leftTotal = 0;
    let rightTotal = 0;
    let significantDiff = 0;
    let absDiff = 0;

    dates.forEach((date) => {
      const leftValue = numericValue(leftLine?.values.get(date)) || 0;
      const rightValue = numericValue(rightLine?.values.get(date)) || 0;
      const diff = rightValue - leftValue;
      if (Math.abs(leftValue) > tolerance || Math.abs(rightValue) > tolerance) checkedCells += 1;
      leftTotal += leftValue;
      rightTotal += rightValue;

      if (Math.abs(diff) > tolerance) {
        issueCount += 1;
        significantDiff += diff;
        absDiff += Math.abs(diff);
        if (issues.length < 250) {
          issues.push({
            key: `${label}|${key}|${date}`,
            line: lineLabel,
            date,
            leftCell: leftLine?.cells.get(date),
            rightCell: rightLine?.cells.get(date),
            leftValue,
            rightValue,
            diff,
          });
        }
      }
    });

    totalLeft += leftTotal;
    totalRight += rightTotal;
    if (absDiff > tolerance) {
      lineDiffs.push({ key: `${label}|${key}`, line: lineLabel, leftTotal, rightTotal, diff: significantDiff, absDiff });
    }
  });

  return {
    ok: issueCount === 0,
    sheetLeft: leftSheet.name,
    sheetRight: rightSheet.name,
    label,
    totalLeft,
    totalRight,
    diff: totalRight - totalLeft,
    checkedCells,
    issueCount,
    lines: lineDiffs.sort((a, b) => b.absDiff - a.absDiff).slice(0, 30),
    issues: issues.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 100),
  };
}
function compareLoadedVsPlanned(left: WorkbookUpload | null, right: WorkbookUpload | null, tolerance: number, allowMonthlyPlan = false): CombinedBudgetDiffSummary | null {
  if (!left || !right) return null;

  if (allowMonthlyPlan) {
    const monthlyPlanComparison = compareLoadedToMonthlyPlan(left, right, tolerance);
    if (monthlyPlanComparison) return monthlyPlanComparison;
  }

  const factRight = findFacturacionSheet(right);
  const cogsRight = findCogsSheet(right);
  const factDates = factRight ? getWideSheetDates(factRight.rows) : [];
  const cogsDates = cogsRight ? getWideSheetDates(cogsRight.rows) : [];
  const summaries = [
    compareWideValues('Facturación', findFacturacionSheet(left), factRight, factDates, tolerance),
    compareWideValues('COGS', findCogsSheet(left), cogsRight, cogsDates, tolerance),
  ];

  return { ok: summaries.every((summary) => summary.ok), summaries, mode: 'daily' };
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
  const [moneyTolerance, setMoneyTolerance] = useState(DEFAULT_MONEY_TOLERANCE);

  const combinedDiff = useMemo(() => compareLoadedVsPlanned(leftWorkbook, rightWorkbook, moneyTolerance), [leftWorkbook, rightWorkbook, moneyTolerance]);
  const loadedVsPlannedDiff = useMemo(() => compareLoadedVsPlanned(leftWorkbook, rightWorkbook, moneyTolerance, true), [leftWorkbook, rightWorkbook, moneyTolerance]);
  const leftCogs = useMemo(() => validateCogsAllFiscalYears(leftWorkbook, moneyTolerance), [leftWorkbook, moneyTolerance]);
  const cogsCorrection = useMemo(() => buildCogsCorrection(leftWorkbook, moneyTolerance), [leftWorkbook, moneyTolerance]);

  const handleLoad = (side: 'left' | 'right') => (sheets: Record<string, any[][]>, fileName: string) => {
    const workbook = { sheets, fileName };
    if (side === 'left') setLeftWorkbook(workbook);
    else setRightWorkbook(workbook);
  };

  const downloadCorrectedCogs = async () => {
    if (!leftWorkbook || !cogsCorrection || cogsCorrection.rows.length === 0) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cogsCorrection.rows), 'COGS');
    const baseName = leftWorkbook.fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_COGS_corregido.xlsx`);
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

          {cogsCorrection && (
            <div className="rounded-md border border-[var(--border)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-3">
                <div>
                  <p className="text-sm font-semibold">COGS corregido</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Facturación vacía deja COGS vacío, facturación 0 deja COGS 0 y el resto recalcula con el porcentaje de cada línea.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadCorrectedCogs}
                  disabled={!cogsCorrection.rows.length}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Descargar COGS bueno
                </button>
              </div>
              <div className="grid gap-3 border-b border-[var(--border)] p-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Cambios propuestos</p>
                  <p className="mt-1 text-lg font-semibold">{cogsCorrection.changeCount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Hoja origen</p>
                  <p className="mt-1 text-sm font-medium">{cogsCorrection.sheetName || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Líneas sin corregir</p>
                  <p className={`mt-1 text-lg font-semibold ${cogsCorrection.skippedLines.length ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {cogsCorrection.skippedLines.length.toLocaleString('de-DE')}
                  </p>
                </div>
              </div>

              {cogsCorrection.changes.length > 0 ? (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[1040px] border-collapse text-xs">
                    <thead className="bg-white text-left text-[var(--text-secondary)]">
                      <tr>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Fecha</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Celda</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturación</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS actual</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS bueno</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cogsCorrection.changes.map((change) => (
                        <tr key={change.key} className="border-b border-[var(--border)]">
                          <td className="px-3 py-2 font-medium">{change.line}</td>
                          <td className="px-3 py-2">{displayDate(change.date)}</td>
                          <td className="px-3 py-2 font-mono">{change.cell}</td>
                          <td className="px-3 py-2 text-right font-mono">{change.facturacion === null ? '-' : formatCurrency(change.facturacion)}</td>
                          <td className="px-3 py-2 text-right font-mono">{change.current === null ? '-' : formatCurrency(change.current)}</td>
                          <td className="px-3 py-2 text-right font-mono text-[var(--success)]">{change.expected === null ? 'Vacío' : formatCurrency(change.expected)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatPercent(change.cogsRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-3 text-sm text-[var(--text-secondary)]">No hay cambios por encima del umbral.</p>
              )}

              {cogsCorrection.skippedLines.length > 0 && (
                <div className="border-t border-[var(--border)] p-3">
                  <p className="text-xs font-semibold text-[var(--danger)]">Líneas que no puedo corregir automáticamente</p>
                  <div className="mt-2 grid gap-1 text-xs text-[var(--text-secondary)] md:grid-cols-2">
                    {cogsCorrection.skippedLines.slice(0, 20).map((line) => (
                      <p key={line} className="rounded bg-[var(--bg-soft)] px-2 py-1">{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Celda</th>
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
                        <td className="px-3 py-2 font-mono">{issue.cell || '-'}</td>
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
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Compara importes línea a línea y día a día. Solo marca incidencias cuando la diferencia por celda supera el umbral.</p>
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
              <p className="text-xs text-[var(--text-secondary)]">Diferencia total</p>
              <p className={`mt-1 text-lg font-semibold ${Math.abs(summary.diff) <= moneyTolerance ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(summary.diff)}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Celdas &gt; umbral</p>
              <p className="mt-1 text-lg font-semibold">{summary.issueCount.toLocaleString('de-DE')}</p>
            </div>
          </div>

          {summary.issueCount === 0 && Math.abs(summary.diff) > 0 && (
            <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text-secondary)]">
              No hay celdas por encima del umbral. La diferencia total viene de redondeos pequeños acumulados.
            </p>
          )}

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
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Dif. neta &gt; umbral</th>
                      <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Suma dif. &gt; umbral</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((line) => (
                      <tr key={line.key} className="border-b border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">{line.line}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.leftTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(line.rightTotal)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${Math.abs(line.diff) > moneyTolerance ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{formatCurrency(line.diff)}</td>
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
                      <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Celdas</th>
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
                        <td className="px-3 py-2 font-mono">{[issue.leftCell, issue.rightCell].filter(Boolean).join(' / ') || '-'}</td>
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
              {summary?.mode === 'monthly-plan'
                ? 'Compara el cargado diario contra el previsto mensual. Facturación usa Importe y COGS usa Importe menos Margen Bruto.'
                : 'Compara Facturación y COGS usando únicamente las fechas existentes en el segundo archivo.'}
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
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">Umbral €</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={moneyTolerance}
                onChange={(event) => setMoneyTolerance(Math.max(0, Number(event.target.value) || 0))}
                className="h-9 w-28 rounded-md border border-[var(--border)] bg-white px-3 text-right text-sm outline-none focus:border-[var(--text-primary)]"
              />
            </label>
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

      {activeStep === 3 && renderCombinedBudgetDiff('Budget cargado vs budget previsto', loadedVsPlannedDiff)}
    </div>
  );
}
