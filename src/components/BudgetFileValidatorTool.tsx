'use client';

import { useEffect, useMemo, useState } from 'react';
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

interface PlanMonthLine {
  key: string;
  line: string;
  verticalId: string;
  medio: string;
  zona: string;
  country: string;
  monthStart: string;
  facturacion: number;
  margen: number;
  cogs: number;
  cogsRate: number | null;
}

interface DailyMonthLine {
  key: string;
  line: string;
  facturacion: number;
  cogs: number;
  daysWithFact: number;
  daysWithCogs: number;
  daysFactWithoutCogs: number;
  daysCogsWithoutFact: number;
}

interface FactMismatch {
  key: string;
  line: string;
  monthStart: string;
  monthLabel: string;
  budget: number;
  diario: number;
  diff: number;
  instruction: string;
  status: 'ok' | 'mismatch' | 'solo-budget' | 'solo-diario';
  fixable: boolean;
}

interface FactCorrectionSummary {
  rows: any[][];
  sheetName: string;
  appliedCount: number;
  skipped: string[];
}

interface CogsMonthMismatch {
  key: string;
  line: string;
  monthStart: string;
  monthLabel: string;
  budget: number;
  diario: number;
  diff: number;
  instruction: string;
  status: 'ok' | 'mismatch' | 'solo-budget' | 'solo-diario';
  fixable: boolean;
}

interface CogsDayIssue {
  key: string;
  line: string;
  date: string;
  type: 'Facturación sin COGS' | 'COGS sin facturación';
  facturacion: number | null;
  cogs: number | null;
  cellFact?: string;
  cellCogs?: string;
}

interface CogsCorrectionSummary {
  rows: any[][];
  sheetName: string;
  changeCount: number;
  skippedLines: string[];
}

interface BudgetFileValidatorToolProps {
  onBack: () => void;
}

type ValidatorStep = 1 | 2;
type SortDirection = 'asc' | 'desc';
type FactSortKey = 'line' | 'month' | 'budget' | 'diario' | 'diff';

const CENTIMO = 0.01;

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
  'ekinsports.com': '7',
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

function displayMonth(dateKey?: string): string {
  if (!dateKey) return '';
  const [year, month] = dateKey.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function lineKey(parts: Array<unknown>): string {
  return parts.map((part) => normalizeText(part)).join('|');
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
    if (normalizeText(name).includes('cogs') && findWideHeaderIndex(rows) >= 0) {
      return { name, rows };
    }
  }
  return null;
}

function findMonthlyPlanSheet(workbook: WorkbookUpload): { name: string; rows: any[][]; headerIndex: number } | null {
  for (const [name, rows] of Object.entries(workbook.sheets)) {
    for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
      const headers = (rows[index] || []).map((cell) => normalizeHeader(cell));
      if (
        headers.some((header) => header.includes('mes')) &&
        headers.some((header) => header.includes('vertical')) &&
        headers.some((header) => header.includes('importe') || header.includes('budget')) &&
        headers.some((header) => header.includes('margen bruto'))
      ) {
        return { name, rows, headerIndex: index };
      }
    }
  }
  return null;
}

function plannedColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

function buildPlanLines(workbook: WorkbookUpload): { fyStartYear: number; lines: Map<string, PlanMonthLine> } | null {
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

  const lines = new Map<string, PlanMonthLine>();

  sheet.rows.slice(sheet.headerIndex + 1).forEach((row) => {
    const monthStart = monthStartFromLabel(row[colMap.month], fyStartYear);
    if (!monthStart) return;

    const amount = numericValue(row[colMap.amount]);
    if (amount === null) return;

    const margen = numericValue(row[colMap.margin]) || 0;
    const verticalId = normalizeVerticalId(row[colMap.vertical]);
    const medio = String(row[colMap.medio] ?? '').trim();
    const zona = normalizeZoneForCompare(row[colMap.zone]);
    const country = normalizeCountryCode(row[colMap.country]);
    const key = lineKey([verticalId, medio, zona, country, monthStart]);
    const line = [row[colMap.vertical], medio, row[colMap.zone], country, displayMonth(monthStart)]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' · ');

    const existing = lines.get(key);
    const facturacion = (existing?.facturacion || 0) + amount;
    const margenTotal = (existing?.margen || 0) + margen;
    const cogs = facturacion - margenTotal;

    lines.set(key, {
      key,
      line: existing?.line || line,
      verticalId,
      medio,
      zona,
      country,
      monthStart,
      facturacion,
      margen: margenTotal,
      cogs,
      cogsRate: facturacion !== 0 ? 1 - margenTotal / facturacion : null,
    });
  });

  return { fyStartYear, lines };
}

function buildDailyMonthTotals(
  workbook: WorkbookUpload,
  fyStartYear: number
): {
  factSheetName: string | null;
  cogsSheetName: string | null;
  months: Map<string, DailyMonthLine>;
  dayIssues: CogsDayIssue[];
} {
  const factSheet = findFacturacionSheet(workbook);
  const cogsSheet = findCogsSheet(workbook);
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const months = new Map<string, DailyMonthLine>();
  const dayIssues: CogsDayIssue[] = [];

  const ensureMonth = (key: string, line: string, monthStart: string) => {
    const existing = months.get(key);
    if (existing) return existing;
    const created: DailyMonthLine = {
      key,
      line: `${line} · ${displayMonth(monthStart)}`,
      facturacion: 0,
      cogs: 0,
      daysWithFact: 0,
      daysWithCogs: 0,
      daysFactWithoutCogs: 0,
      daysCogsWithoutFact: 0,
    };
    months.set(key, created);
    return created;
  };

  const factByLineDate = new Map<string, { value: number | null; cell?: string; label: string }>();
  const cogsByLineDate = new Map<string, { value: number | null; cell?: string; label: string }>();

  if (factSheet) {
    const headerIndex = findWideHeaderIndex(factSheet.rows);
    if (headerIndex >= 0) {
      const header = factSheet.rows[headerIndex];
      const dateColumns = header
        .map((cell, index) => ({ index, date: formatDateKey(cell) }))
        .filter((item): item is { index: number; date: string } => (
          !!item.date && item.date >= fyStart && item.date <= fyEnd
        ));

      factSheet.rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
        const idVertical = String(row[0] ?? '').trim();
        const nombre = String(row[1] ?? '').trim();
        const zona = String(row[2] ?? '').trim();
        const codMercado = String(row[3] ?? '').trim();
        const baseKey = lineKey([idVertical, nombre, normalizeZoneForCompare(zona), normalizeCountryCode(codMercado)]);
        if (!baseKey.replace(/\|/g, '')) return;
        const label = [idVertical, nombre, zona, codMercado].filter(Boolean).join(' · ');

        dateColumns.forEach(({ index, date }) => {
          const value = numericValue(row[index]);
          factByLineDate.set(`${baseKey}|${date}`, {
            value,
            cell: `${excelColumnName(index)}${headerIndex + 2 + rowOffset}`,
            label,
          });
          if (value === null) return;

          const monthStart = `${date.slice(0, 7)}-01`;
          const key = `${baseKey}|${monthStart}`;
          const month = ensureMonth(key, label, monthStart);
          month.facturacion += value;
          month.daysWithFact += 1;
        });
      });
    }
  }

  if (cogsSheet) {
    const headerIndex = findWideHeaderIndex(cogsSheet.rows);
    if (headerIndex >= 0) {
      const header = cogsSheet.rows[headerIndex];
      const dateColumns = header
        .map((cell, index) => ({ index, date: formatDateKey(cell) }))
        .filter((item): item is { index: number; date: string } => (
          !!item.date && item.date >= fyStart && item.date <= fyEnd
        ));

      cogsSheet.rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
        const idVertical = String(row[0] ?? '').trim();
        const nombre = String(row[1] ?? '').trim();
        const zona = String(row[2] ?? '').trim();
        const codMercado = String(row[3] ?? '').trim();
        const baseKey = lineKey([idVertical, nombre, normalizeZoneForCompare(zona), normalizeCountryCode(codMercado)]);
        if (!baseKey.replace(/\|/g, '')) return;
        const label = [idVertical, nombre, zona, codMercado].filter(Boolean).join(' · ');

        dateColumns.forEach(({ index, date }) => {
          const value = numericValue(row[index]);
          cogsByLineDate.set(`${baseKey}|${date}`, {
            value,
            cell: `${excelColumnName(index)}${headerIndex + 2 + rowOffset}`,
            label,
          });
          if (value === null) return;

          const monthStart = `${date.slice(0, 7)}-01`;
          const key = `${baseKey}|${monthStart}`;
          const month = ensureMonth(key, label, monthStart);
          month.cogs += value;
          month.daysWithCogs += 1;
        });
      });
    }
  }

  const allDayKeys = new Set([...Array.from(factByLineDate.keys()), ...Array.from(cogsByLineDate.keys())]);
  allDayKeys.forEach((dayKey) => {
    const fact = factByLineDate.get(dayKey);
    const cogs = cogsByLineDate.get(dayKey);
    const factValue = fact?.value ?? null;
    const cogsValue = cogs?.value ?? null;
    const hasFact = factValue !== null;
    const hasCogs = cogsValue !== null;
    if (hasFact === hasCogs) return;

    const [baseKey, date] = [dayKey.slice(0, dayKey.lastIndexOf('|')), dayKey.slice(dayKey.lastIndexOf('|') + 1)];
    const monthStart = `${date.slice(0, 7)}-01`;
    const month = months.get(`${baseKey}|${monthStart}`);
    if (month) {
      if (hasFact && !hasCogs) month.daysFactWithoutCogs += 1;
      if (!hasFact && hasCogs) month.daysCogsWithoutFact += 1;
    }

    dayIssues.push({
      key: dayKey,
      line: fact?.label || cogs?.label || baseKey,
      date,
      type: hasFact && !hasCogs ? 'Facturación sin COGS' : 'COGS sin facturación',
      facturacion: factValue,
      cogs: cogsValue,
      cellFact: fact?.cell,
      cellCogs: cogs?.cell,
    });
  });

  months.forEach((month) => {
    month.facturacion = roundMoney(month.facturacion);
    month.cogs = roundMoney(month.cogs);
  });

  return {
    factSheetName: factSheet?.name || null,
    cogsSheetName: cogsSheet?.name || null,
    months,
    dayIssues: dayIssues.sort((a, b) => a.date.localeCompare(b.date) || a.line.localeCompare(b.line, 'es')),
  };
}

function desfaseInstruction(diff: number): string {
  const abs = Math.abs(diff);
  if (abs <= CENTIMO) return 'Cuadra al céntimo';
  if (diff > 0) return `En el diario faltan ${formatCurrency(abs)} respecto al budget`;
  return `En el diario sobran ${formatCurrency(abs)} respecto al budget`;
}

function buildFactMismatches(
  plan: Map<string, PlanMonthLine>,
  daily: Map<string, DailyMonthLine>
): FactMismatch[] {
  const keys = Array.from(new Set([...Array.from(plan.keys()), ...Array.from(daily.keys())]));

  return keys.map((key) => {
    const planLine = plan.get(key);
    const dailyLine = daily.get(key);
    const budget = planLine?.facturacion || 0;
    const diario = dailyLine?.facturacion || 0;
    const diff = roundMoney(budget - diario);
    const monthStart = planLine?.monthStart || key.split('|').slice(-1)[0];
    let status: FactMismatch['status'] = 'ok';
    if (!planLine && dailyLine) status = 'solo-diario';
    else if (planLine && !dailyLine) status = 'solo-budget';
    else if (Math.abs(diff) > CENTIMO) status = 'mismatch';

    const fixable = status === 'mismatch'
      ? Math.abs(diario) > CENTIMO
      : status === 'solo-diario';

    let instruction = desfaseInstruction(diff);
    if (status === 'solo-budget') {
      instruction = 'Sin datos en el diario para este mes: no se puede autoajustar (falta la línea o no hay días rellenos)';
    } else if (status === 'solo-diario') {
      instruction = 'Está en el diario y no en el budget general: si lo marcas, se vacía ese mes en el diario';
    } else if (status === 'mismatch' && Math.abs(diario) <= CENTIMO) {
      instruction = `Budget ${formatCurrency(budget)} y diario 0: no se puede escalar; hay que repartir a mano`;
    } else if (status === 'mismatch') {
      instruction = `${desfaseInstruction(diff)}. Si lo marcas, se escala el mes en el diario al céntimo`;
    }

    return {
      key,
      line: planLine?.line || dailyLine?.line || key,
      monthStart,
      monthLabel: displayMonth(monthStart),
      budget,
      diario,
      diff,
      instruction,
      status,
      fixable,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.line.localeCompare(b.line, 'es'));
}

function buildSelectedFacturacionCorrection(
  dailyWorkbook: WorkbookUpload,
  plan: Map<string, PlanMonthLine>,
  selectedKeys: Set<string>,
  fyStartYear: number
): FactCorrectionSummary | null {
  const factSheet = findFacturacionSheet(dailyWorkbook);
  if (!factSheet || selectedKeys.size === 0) return null;

  const headerIndex = findWideHeaderIndex(factSheet.rows);
  if (headerIndex < 0) return null;

  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const header = factSheet.rows[headerIndex];
  const dateColumns = header
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => (
      !!item.date && item.date >= fyStart && item.date <= fyEnd
    ));

  const columnsByMonth = new Map<string, Array<{ index: number; date: string }>>();
  dateColumns.forEach((column) => {
    const monthStart = `${column.date.slice(0, 7)}-01`;
    const existing = columnsByMonth.get(monthStart) || [];
    existing.push(column);
    columnsByMonth.set(monthStart, existing);
  });

  const correctedRows = factSheet.rows.map((row) => [...row]);
  const skipped: string[] = [];
  let appliedCount = 0;

  factSheet.rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const rowIndex = headerIndex + 1 + rowOffset;
    const idVertical = String(row[0] ?? '').trim();
    const nombre = String(row[1] ?? '').trim();
    const zona = String(row[2] ?? '').trim();
    const codMercado = String(row[3] ?? '').trim();
    const baseKey = lineKey([idVertical, nombre, normalizeZoneForCompare(zona), normalizeCountryCode(codMercado)]);
    if (!baseKey.replace(/\|/g, '')) return;

    columnsByMonth.forEach((columns, monthStart) => {
      const key = `${baseKey}|${monthStart}`;
      if (!selectedKeys.has(key)) return;

      const target = plan.get(key)?.facturacion ?? 0;
      const numericColumns = columns
        .map((column) => ({ ...column, value: numericValue(row[column.index]) }))
        .filter((column): column is { index: number; date: string; value: number } => column.value !== null);
      const current = roundMoney(numericColumns.reduce((sum, column) => sum + column.value, 0));
      const label = [idVertical, nombre, zona, codMercado, displayMonth(monthStart)].filter(Boolean).join(' · ');

      if (Math.abs(target) <= CENTIMO) {
        numericColumns.forEach((column) => {
          correctedRows[rowIndex][column.index] = null;
        });
        appliedCount += 1;
        return;
      }

      if (numericColumns.length === 0 || Math.abs(current) <= CENTIMO) {
        skipped.push(`${label}: sin reparto diario para escalar`);
        return;
      }

      const factor = target / current;
      let roundedTotal = 0;
      numericColumns.forEach((column) => {
        const nextValue = roundMoney(column.value * factor);
        correctedRows[rowIndex][column.index] = nextValue;
        roundedTotal += nextValue;
      });

      const adjustment = roundMoney(target - roundedTotal);
      if (Math.abs(adjustment) > 0) {
        const lastColumn = numericColumns[numericColumns.length - 1];
        correctedRows[rowIndex][lastColumn.index] = roundMoney(
          (numericValue(correctedRows[rowIndex][lastColumn.index]) || 0) + adjustment
        );
      }

      appliedCount += 1;
    });
  });

  selectedKeys.forEach((key) => {
    const planLine = plan.get(key);
    if (!planLine) return;
    const baseKey = key.slice(0, key.lastIndexOf('|'));
    const existsInDaily = factSheet.rows.slice(headerIndex + 1).some((row) => (
      lineKey([row[0], row[1], normalizeZoneForCompare(row[2]), normalizeCountryCode(row[3])]) === baseKey
    ));
    if (!existsInDaily && Math.abs(planLine.facturacion) > CENTIMO) {
      skipped.push(`${planLine.line}: no existe en el diario`);
    }
  });

  return {
    rows: correctedRows,
    sheetName: factSheet.name,
    appliedCount,
    skipped: Array.from(new Set(skipped)).slice(0, 80),
  };
}

function buildCogsMonthMismatches(
  plan: Map<string, PlanMonthLine>,
  daily: Map<string, DailyMonthLine>
): CogsMonthMismatch[] {
  const keys = Array.from(new Set([...Array.from(plan.keys()), ...Array.from(daily.keys())]));

  return keys.map((key) => {
    const planLine = plan.get(key);
    const dailyLine = daily.get(key);
    const budget = planLine?.cogs || 0;
    const diario = dailyLine?.cogs || 0;
    const diff = roundMoney(budget - diario);
    const monthStart = planLine?.monthStart || key.split('|').slice(-1)[0];
    let status: CogsMonthMismatch['status'] = 'ok';
    if (!planLine && dailyLine) status = 'solo-diario';
    else if (planLine && !dailyLine) status = 'solo-budget';
    else if (Math.abs(diff) > CENTIMO) status = 'mismatch';

    const hasFactDays = (dailyLine?.daysWithFact || 0) > 0 || Math.abs(dailyLine?.facturacion || 0) > CENTIMO;
    const fixable = status !== 'ok'
      && !!planLine
      && planLine.cogsRate !== null
      && hasFactDays;

    let instruction = desfaseInstruction(diff);
    if (status === 'solo-budget') {
      instruction = 'Sin datos diarios de facturación/COGS para este mes: no se puede autoajustar';
    } else if (status === 'solo-diario') {
      instruction = 'Está en el diario y no en el budget general: no autoajusto sin % del budget';
    } else if (status !== 'ok' && !fixable) {
      instruction = 'Sin días de facturación en el diario para recalcular COGS';
    } else if (status !== 'ok') {
      instruction = `${desfaseInstruction(diff)}. Si lo marcas, recalculo COGS del mes con el % del budget (mismo día que facturación)`;
    }

    return {
      key,
      line: planLine?.line || dailyLine?.line || key,
      monthStart,
      monthLabel: displayMonth(monthStart),
      budget,
      diario,
      diff,
      instruction,
      status,
      fixable,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.line.localeCompare(b.line, 'es'));
}

function buildSelectedCogsCorrection(
  dailyWorkbook: WorkbookUpload,
  plan: Map<string, PlanMonthLine>,
  selectedKeys: Set<string>,
  fyStartYear: number
): CogsCorrectionSummary | null {
  const factSheet = findFacturacionSheet(dailyWorkbook);
  const cogsSheet = findCogsSheet(dailyWorkbook);
  if (!factSheet || !cogsSheet || selectedKeys.size === 0) return null;

  const factHeaderIndex = findWideHeaderIndex(factSheet.rows);
  const cogsHeaderIndex = findWideHeaderIndex(cogsSheet.rows);
  if (factHeaderIndex < 0 || cogsHeaderIndex < 0) return null;

  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const factHeader = factSheet.rows[factHeaderIndex];
  const cogsHeader = cogsSheet.rows[cogsHeaderIndex];
  const factDateColumns = new Map<string, number>();
  factHeader.forEach((cell, index) => {
    const date = formatDateKey(cell);
    if (date && date >= fyStart && date <= fyEnd) factDateColumns.set(date, index);
  });

  const cogsDateColumns = cogsHeader
    .map((cell, index) => ({ index, date: formatDateKey(cell) }))
    .filter((item): item is { index: number; date: string } => (
      !!item.date && item.date >= fyStart && item.date <= fyEnd && factDateColumns.has(item.date)
    ));

  const factRows = new Map<string, any[]>();
  factSheet.rows.slice(factHeaderIndex + 1).forEach((row) => {
    const key = lineKey([row[0], row[1], normalizeZoneForCompare(row[2]), normalizeCountryCode(row[3])]);
    if (key.replace(/\|/g, '')) factRows.set(key, row);
  });

  const planByLineMonth = new Map<string, PlanMonthLine>();
  plan.forEach((line) => {
    const baseKey = lineKey([line.verticalId, line.medio, line.zona, line.country]);
    planByLineMonth.set(`${baseKey}|${line.monthStart}`, line);
  });

  const correctedRows = cogsSheet.rows.map((row) => [...row]);
  const skippedLines: string[] = [];
  let changeCount = 0;
  const selectedMonthsByLine = new Map<string, Set<string>>();
  selectedKeys.forEach((key) => {
    const monthStart = key.slice(key.lastIndexOf('|') + 1);
    const baseKey = key.slice(0, key.lastIndexOf('|'));
    const months = selectedMonthsByLine.get(baseKey) || new Set<string>();
    months.add(monthStart);
    selectedMonthsByLine.set(baseKey, months);
  });

  cogsSheet.rows.slice(cogsHeaderIndex + 1).forEach((cogsRow, rowOffset) => {
    const rowIndex = cogsHeaderIndex + 1 + rowOffset;
    const baseKey = lineKey([cogsRow[0], cogsRow[1], normalizeZoneForCompare(cogsRow[2]), normalizeCountryCode(cogsRow[3])]);
    if (!baseKey.replace(/\|/g, '')) return;

    const selectedMonths = selectedMonthsByLine.get(baseKey);
    if (!selectedMonths || selectedMonths.size === 0) return;

    const factRow = factRows.get(baseKey);
    const label = [cogsRow[0], cogsRow[1], cogsRow[2], cogsRow[3]].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');

    if (!factRow) {
      skippedLines.push(`${label}: sin línea de facturación`);
      return;
    }

    const monthBuckets = new Map<string, Array<{ index: number; date: string; expected: number | null }>>();

    cogsDateColumns.forEach(({ index, date }) => {
      const monthStart = `${date.slice(0, 7)}-01`;
      if (!selectedMonths.has(monthStart)) return;

      const factIndex = factDateColumns.get(date);
      if (factIndex === undefined) return;
      const planLine = planByLineMonth.get(`${baseKey}|${monthStart}`);
      if (!planLine || planLine.cogsRate === null) return;

      const fact = numericValue(factRow[factIndex]);
      const expected = fact === null ? null : roundMoney(fact * planLine.cogsRate);
      const bucket = monthBuckets.get(monthStart) || [];
      bucket.push({ index, date, expected });
      monthBuckets.set(monthStart, bucket);
    });

    selectedMonths.forEach((monthStart) => {
      if (!monthBuckets.has(monthStart)) {
        const planLine = planByLineMonth.get(`${baseKey}|${monthStart}`);
        skippedLines.push(`${label} · ${displayMonth(monthStart)}: ${planLine ? 'sin días de facturación' : 'sin % en budget'}`);
      }
    });

    monthBuckets.forEach((bucket, monthStart) => {
      const planLine = planByLineMonth.get(`${baseKey}|${monthStart}`);
      const filled = bucket.filter((item) => item.expected !== null) as Array<{ index: number; date: string; expected: number }>;
      if (planLine && filled.length > 0) {
        const currentSum = filled.reduce((sum, item) => sum + item.expected, 0);
        const adjustment = roundMoney(planLine.cogs - currentSum);
        if (Math.abs(adjustment) > 0) {
          const last = filled[filled.length - 1];
          last.expected = roundMoney(last.expected + adjustment);
        }
      }

      bucket.forEach((item) => {
        const current = numericValue(correctedRows[rowIndex][item.index]);
        const next = item.expected;
        const changed = next === null ? current !== null : current === null || Math.abs(current - next) > CENTIMO;
        if (!changed) return;
        correctedRows[rowIndex][item.index] = next === null ? '' : next;
        changeCount += 1;
      });
    });
  });

  return {
    rows: correctedRows,
    sheetName: cogsSheet.name,
    changeCount,
    skippedLines: Array.from(new Set(skippedLines)).slice(0, 80),
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

export default function BudgetFileValidatorTool({ onBack }: BudgetFileValidatorToolProps) {
  const [dailyWorkbook, setDailyWorkbook] = useState<WorkbookUpload | null>(null);
  const [planWorkbook, setPlanWorkbook] = useState<WorkbookUpload | null>(null);
  const [activeStep, setActiveStep] = useState<ValidatorStep>(1);
  const [query, setQuery] = useState('');
  const [onlyMismatches, setOnlyMismatches] = useState(true);
  const [onlyFixable, setOnlyFixable] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedCogsKeys, setSelectedCogsKeys] = useState<Set<string>>(new Set());
  const [ignoredRest, setIgnoredRest] = useState(false);
  const [sort, setSort] = useState<{ key: FactSortKey; direction: SortDirection }>({ key: 'diff', direction: 'desc' });

  const plan = useMemo(() => (planWorkbook ? buildPlanLines(planWorkbook) : null), [planWorkbook]);
  const daily = useMemo(() => {
    if (!dailyWorkbook || !plan) return null;
    return buildDailyMonthTotals(dailyWorkbook, plan.fyStartYear);
  }, [dailyWorkbook, plan]);

  const factRows = useMemo(() => {
    if (!plan || !daily) return [];
    return buildFactMismatches(plan.lines, daily.months);
  }, [plan, daily]);

  const cogsMonthRows = useMemo(() => {
    if (!plan || !daily) return [];
    return buildCogsMonthMismatches(plan.lines, daily.months);
  }, [plan, daily]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectedCogsKeys(new Set());
    setIgnoredRest(false);
  }, [dailyWorkbook?.fileName, planWorkbook?.fileName]);

  const mismatchRows = useMemo(() => factRows.filter((row) => row.status !== 'ok'), [factRows]);
  const factBadCount = mismatchRows.length;
  const factFixableCount = factRows.filter((row) => row.fixable).length;
  const factUnfixableCount = mismatchRows.filter((row) => !row.fixable).length;
  const factTotalDiff = roundMoney(mismatchRows.reduce((sum, row) => sum + row.diff, 0));
  const selectedDiff = roundMoney(
    mismatchRows.filter((row) => selectedKeys.has(row.key)).reduce((sum, row) => sum + row.diff, 0)
  );
  const remainingDiff = roundMoney(factTotalDiff - selectedDiff);
  const factSquared = factRows.length > 0 && factBadCount === 0;
  const selectedCount = selectedKeys.size;
  const canGoToCogs = !plan || !daily || factSquared || ignoredRest;

  const cogsMismatchRows = useMemo(() => cogsMonthRows.filter((row) => row.status !== 'ok'), [cogsMonthRows]);
  const cogsFixableCount = cogsMismatchRows.filter((row) => row.fixable).length;
  const selectedCogsCount = selectedCogsKeys.size;
  const dayIssues = daily?.dayIssues || [];
  const cogsOk = cogsMismatchRows.length === 0 && dayIssues.length === 0;

  const filteredFactRows = useMemo(() => {
    const needle = normalizeText(query);
    let rows = factRows;
    if (onlyMismatches) rows = rows.filter((row) => row.status !== 'ok');
    if (onlyFixable) rows = rows.filter((row) => row.fixable);
    if (needle) rows = rows.filter((row) => normalizeText(row.line).includes(needle) || normalizeText(row.monthLabel).includes(needle));

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'line') return a.line.localeCompare(b.line, 'es') * direction;
      if (sort.key === 'month') return a.monthStart.localeCompare(b.monthStart) * direction;
      if (sort.key === 'budget') return (a.budget - b.budget) * direction;
      if (sort.key === 'diario') return (a.diario - b.diario) * direction;
      return (Math.abs(a.diff) - Math.abs(b.diff)) * direction;
    });
  }, [factRows, onlyMismatches, onlyFixable, query, sort]);

  const visibleFixableKeys = useMemo(
    () => filteredFactRows.filter((row) => row.fixable).map((row) => row.key),
    [filteredFactRows]
  );

  const allVisibleSelected = visibleFixableKeys.length > 0 && visibleFixableKeys.every((key) => selectedKeys.has(key));

  const filteredCogsMonthRows = useMemo(() => {
    const needle = normalizeText(query);
    let rows = cogsMonthRows;
    if (onlyMismatches) rows = rows.filter((row) => row.status !== 'ok');
    if (onlyFixable) rows = rows.filter((row) => row.fixable);
    if (needle) rows = rows.filter((row) => normalizeText(row.line).includes(needle) || normalizeText(row.monthLabel).includes(needle));
    return rows;
  }, [cogsMonthRows, onlyMismatches, onlyFixable, query]);

  const visibleCogsFixableKeys = useMemo(
    () => filteredCogsMonthRows.filter((row) => row.fixable).map((row) => row.key),
    [filteredCogsMonthRows]
  );

  const allVisibleCogsSelected = visibleCogsFixableKeys.length > 0
    && visibleCogsFixableKeys.every((key) => selectedCogsKeys.has(key));

  const toggleSelected = (key: string, fixable: boolean) => {
    if (!fixable) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleFixableKeys.forEach((key) => next.delete(key));
      } else {
        visibleFixableKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const toggleCogsSelected = (key: string, fixable: boolean) => {
    if (!fixable) return;
    setSelectedCogsKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectVisibleCogs = () => {
    setSelectedCogsKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleCogsSelected) {
        visibleCogsFixableKeys.forEach((key) => next.delete(key));
      } else {
        visibleCogsFixableKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const filteredDayIssues = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return dayIssues;
    return dayIssues.filter((issue) => normalizeText(issue.line).includes(needle) || issue.date.includes(needle));
  }, [dayIssues, query]);

  const toggleSort = (key: FactSortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const downloadFactListado = async () => {
    if (filteredFactRows.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = [
      ['Seleccionado', 'Autoajustable', 'Línea', 'Mes', 'Mes (YYYY-MM)', 'Budget €', 'Diario €', 'Desfase €', 'Estado', 'Qué hacer'],
      ...filteredFactRows.map((row) => [
        selectedKeys.has(row.key) ? 'Sí' : 'No',
        row.fixable ? 'Sí' : 'No',
        row.line.replace(` · ${row.monthLabel}`, ''),
        row.monthLabel,
        row.monthStart.slice(0, 7),
        roundMoney(row.budget),
        roundMoney(row.diario),
        roundMoney(row.diff),
        row.status,
        row.instruction,
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Facturacion');
    const baseName = (dailyWorkbook?.fileName || planWorkbook?.fileName || 'validador')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_desfases_facturacion_FY_${plan?.fyStartYear || ''}.xlsx`);
  };

  const downloadCogsListado = async () => {
    if (filteredCogsMonthRows.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = [
      ['Seleccionado', 'Autoajustable', 'Línea', 'Mes', 'Mes (YYYY-MM)', 'Budget €', 'Diario €', 'Desfase €', 'Estado', 'Qué hacer'],
      ...filteredCogsMonthRows.map((row) => [
        selectedCogsKeys.has(row.key) ? 'Sí' : 'No',
        row.fixable ? 'Sí' : 'No',
        row.line.replace(` · ${row.monthLabel}`, ''),
        row.monthLabel,
        row.monthStart.slice(0, 7),
        roundMoney(row.budget),
        roundMoney(row.diario),
        roundMoney(row.diff),
        row.status,
        row.instruction,
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'COGS');
    const baseName = (dailyWorkbook?.fileName || planWorkbook?.fileName || 'validador')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_desfases_cogs_FY_${plan?.fyStartYear || ''}.xlsx`);
  };

  const applyFactSelection = () => {
    if (!dailyWorkbook || !plan || selectedKeys.size === 0) return;
    const correction = buildSelectedFacturacionCorrection(
      dailyWorkbook,
      plan.lines,
      selectedKeys,
      plan.fyStartYear
    );
    if (!correction) return;

    const factSheetName = correction.sheetName || findFacturacionSheet(dailyWorkbook)?.name || 'Hoja1';
    setDailyWorkbook({
      ...dailyWorkbook,
      sheets: {
        ...dailyWorkbook.sheets,
        [factSheetName]: correction.rows,
      },
    });
    setSelectedKeys(new Set());

    if (correction.skipped.length > 0) {
      window.alert(
        `Aplicadas ${correction.appliedCount} corrección(es) en pantalla.\nNo pude autoajustar ${correction.skipped.length}:\n- ${correction.skipped.slice(0, 8).join('\n- ')}`
      );
    }
  };

  const applyCogsSelection = () => {
    if (!dailyWorkbook || !plan || selectedCogsKeys.size === 0) return;
    const correction = buildSelectedCogsCorrection(
      dailyWorkbook,
      plan.lines,
      selectedCogsKeys,
      plan.fyStartYear
    );
    if (!correction) return;

    const cogsSheetName = correction.sheetName || findCogsSheet(dailyWorkbook)?.name || 'COGS';
    setDailyWorkbook({
      ...dailyWorkbook,
      sheets: {
        ...dailyWorkbook.sheets,
        [cogsSheetName]: correction.rows,
      },
    });
    setSelectedCogsKeys(new Set());

    if (correction.skippedLines.length > 0) {
      window.alert(
        `Aplicadas ${correction.changeCount} celda(s) COGS en pantalla.\nNo pude autoajustar ${correction.skippedLines.length}:\n- ${correction.skippedLines.slice(0, 8).join('\n- ')}`
      );
    }
  };

  const downloadCurrentWorkbook = async () => {
    if (!dailyWorkbook) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    Object.entries(dailyWorkbook.sheets).forEach(([name, rows]) => {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    });
    const baseName = dailyWorkbook.fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_ajustado.xlsx`);
  };

  const fyLabel = plan
    ? `FY ${plan.fyStartYear}/${String(plan.fyStartYear + 1).slice(-2)} (abr ${plan.fyStartYear} – mar ${plan.fyStartYear + 1})`
    : null;

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
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Validador budget</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Marca filas → Aplicar (se reajusta en pantalla) → Descargar el mismo archivo diario ya corregido.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-1">
            {([
              [1, '1 · Facturación'],
              [2, '2 · COGS'],
            ] as const).map(([step, label]) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  if (step === 2 && !canGoToCogs && plan && daily) return;
                  setActiveStep(step);
                }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  activeStep === step
                    ? 'bg-[var(--text-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-white'
                } ${step === 2 && plan && daily && !canGoToCogs ? 'opacity-45' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Budget general</p>
              <p className="text-xs text-[var(--text-secondary)]">Departamento · mensual · Importe + Margen</p>
            </div>
          </div>
          <FileUpload
            inputId="validator-plan-file"
            label="Sube Budget TS FY…"
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets, fileName) => setPlanWorkbook({ sheets, fileName })}
          />
          {planWorkbook && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {planWorkbook.fileName}{fyLabel ? ` · ${fyLabel}` : ''}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-soft)] text-[var(--text-secondary)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Budget diario</p>
              <p className="text-xs text-[var(--text-secondary)]">Hoja1 (facturación) + COGS · se ignora fuera del FY</p>
            </div>
          </div>
          <FileUpload
            inputId="validator-daily-file"
            label="Sube budget diario…"
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets, fileName) => setDailyWorkbook({ sheets, fileName })}
          />
          {dailyWorkbook && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{dailyWorkbook.fileName}</p>
          )}
        </div>
      </section>

      {!plan || !daily ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-soft)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          Sube los dos archivos para empezar la validación.
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">FY analizado</p>
              <p className="mt-1 text-sm font-semibold">{fyLabel}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Facturación</p>
              <div className="mt-2">
                <StatusBadge ok={factSquared} label={factSquared ? 'Cuadra al céntimo' : `${factBadCount} desfases`} />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">COGS</p>
              <div className="mt-2">
                <StatusBadge ok={cogsOk} label={cogsOk ? 'Cuadra y mismo día' : `${cogsMismatchRows.length + dayIssues.length} incidencias`} />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Desfase facturación neto</p>
              <p className={`mt-1 text-lg font-semibold ${Math.abs(factTotalDiff) <= CENTIMO ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {formatCurrency(factTotalDiff)}
              </p>
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar por línea o mes…"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--text-primary)]"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={onlyMismatches}
                onChange={(event) => setOnlyMismatches(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              Solo lo que no cuadra
            </label>
            {(activeStep === 1 || activeStep === 2) && (
              <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={onlyFixable}
                  onChange={(event) => setOnlyFixable(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                Solo autoajustables
              </label>
            )}
          </section>

          {activeStep === 1 && (
            <section className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <h3 className="text-lg font-semibold">Paso 1 · Facturación</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Marca las filas, pulsa Aplicar para reajustar lo de pantalla, y luego descarga el archivo diario.
                      Lo no marcado no se toca. Si el resto lo harás a mano, ignora y pasa a COGS.
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Desfases: {factBadCount} · Autoajustables: {factFixableCount} · Sin diario: {factUnfixableCount} · Marcadas: {selectedCount}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      ok={factSquared}
                      label={factSquared ? 'Cuadra al céntimo' : `${factBadCount} sin match`}
                    />
                    <button
                      type="button"
                      onClick={downloadFactListado}
                      disabled={filteredFactRows.length === 0}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download className="h-4 w-4" />
                      Exportar listado
                    </button>
                    <button
                      type="button"
                      onClick={applyFactSelection}
                      disabled={selectedCount === 0}
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={downloadCurrentWorkbook}
                      disabled={!dailyWorkbook}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download className="h-4 w-4" />
                      Descargar archivo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIgnoredRest(true);
                        setActiveStep(2);
                      }}
                      disabled={factSquared}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Ignorar el resto → COGS
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
                  Filas sin match
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[1080px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectVisible}
                            disabled={visibleFixableKeys.length === 0}
                            className="h-4 w-4 rounded border-[var(--border)]"
                            title="Seleccionar visibles autoajustables"
                          />
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <button type="button" onClick={() => toggleSort('line')}>Línea</button>
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <button type="button" onClick={() => toggleSort('month')}>Mes</button>
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">
                          <button type="button" onClick={() => toggleSort('budget')}>Budget</button>
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">
                          <button type="button" onClick={() => toggleSort('diario')}>Diario</button>
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">
                          <button type="button" onClick={() => toggleSort('diff')}>Desfase</button>
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Qué hacer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFactRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                            {factSquared ? 'Todo cuadra al céntimo.' : 'No hay filas con ese filtro.'}
                          </td>
                        </tr>
                      ) : filteredFactRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`border-b border-[var(--border)] align-top ${row.fixable ? '' : 'bg-[var(--bg-soft)]/70'}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(row.key)}
                              disabled={!row.fixable}
                              onChange={() => toggleSelected(row.key, row.fixable)}
                              className="h-4 w-4 rounded border-[var(--border)] disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{row.line.replace(` · ${row.monthLabel}`, '')}</td>
                          <td className="px-3 py-2 capitalize">{row.monthLabel}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(row.budget)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(row.diario)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${Math.abs(row.diff) > CENTIMO ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                            {formatCurrency(row.diff)}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{row.instruction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {factUnfixableCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {factUnfixableCount} filas no tienen diario usable (gris, sin checkbox). Esas las dejas para ti o las revisas aparte.
                </div>
              )}

              {factSquared && (
                <div className="rounded-lg border border-green-200 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
                  Facturación cuadrada. Pasa al paso 2 para COGS.
                </div>
              )}
            </section>
          )}

          {activeStep === 2 && (
            <section className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <h3 className="text-lg font-semibold">Paso 2 · COGS</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Marca filas/meses, pulsa Aplicar para recalcular COGS en pantalla (mismo día + % del budget),
                      y descarga el archivo diario. Lo no marcado no se toca.
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Desfases: {cogsMismatchRows.length} · Autoajustables: {cogsFixableCount} · Marcadas: {selectedCogsCount}
                      {dayIssues.length > 0 ? ` · Días desalineados: ${dayIssues.length}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge ok={cogsOk} label={cogsOk ? 'OK' : 'Hay incidencias'} />
                    <button
                      type="button"
                      onClick={downloadCogsListado}
                      disabled={filteredCogsMonthRows.length === 0}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download className="h-4 w-4" />
                      Exportar listado
                    </button>
                    <button
                      type="button"
                      onClick={applyCogsSelection}
                      disabled={selectedCogsCount === 0}
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={downloadCurrentWorkbook}
                      disabled={!dailyWorkbook}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download className="h-4 w-4" />
                      Descargar archivo
                    </button>
                  </div>
                </div>
                {!factSquared && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {ignoredRest
                      ? `Has ignorado el resto de facturación (${formatCurrency(remainingDiff)} pendientes). COGS usará el diario tal cual esté ahora.`
                      : 'La facturación aún no cuadra al céntimo. Conviene cerrar o ignorar el resto en el paso 1.'}
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
                  Totales mensuales COGS
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[1080px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">
                          <input
                            type="checkbox"
                            checked={allVisibleCogsSelected}
                            onChange={toggleSelectVisibleCogs}
                            disabled={visibleCogsFixableKeys.length === 0}
                            className="h-4 w-4 rounded border-[var(--border)]"
                            title="Seleccionar visibles autoajustables"
                          />
                        </th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Mes</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Budget</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Diario</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Desfase</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Qué hacer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCogsMonthRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                            Totales mensuales de COGS cuadrados.
                          </td>
                        </tr>
                      ) : filteredCogsMonthRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`border-b border-[var(--border)] align-top ${row.fixable ? '' : 'bg-[var(--bg-soft)]/70'}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedCogsKeys.has(row.key)}
                              disabled={!row.fixable}
                              onChange={() => toggleCogsSelected(row.key, row.fixable)}
                              className="h-4 w-4 rounded border-[var(--border)] disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{row.line.replace(` · ${row.monthLabel}`, '')}</td>
                          <td className="px-3 py-2 capitalize">{row.monthLabel}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(row.budget)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(row.diario)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${Math.abs(row.diff) > CENTIMO ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                            {formatCurrency(row.diff)}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{row.instruction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
                  Mismo día · facturación vs COGS ({filteredDayIssues.length})
                </div>
                <div className="max-h-[280px] overflow-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Tipo</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Línea</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Fecha</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Celdas</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">Facturación</th>
                        <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium">COGS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDayIssues.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                            No hay días con facturación y COGS desalineados en el FY.
                          </td>
                        </tr>
                      ) : filteredDayIssues.slice(0, 200).map((issue) => (
                        <tr key={issue.key} className="border-b border-[var(--border)]">
                          <td className="px-3 py-2 text-xs font-medium text-[var(--danger)]">{issue.type}</td>
                          <td className="px-3 py-2 text-xs font-medium">{issue.line}</td>
                          <td className="px-3 py-2 text-xs">{displayDate(issue.date)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {[issue.cellFact, issue.cellCogs].filter(Boolean).join(' / ') || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {issue.facturacion === null ? 'Vacío' : formatCurrency(issue.facturacion)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {issue.cogs === null ? 'Vacío' : formatCurrency(issue.cogs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
