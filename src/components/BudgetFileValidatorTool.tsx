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
          const monthStart = `${date.slice(0, 7)}-01`;
          const key = `${baseKey}|${monthStart}`;
          const month = ensureMonth(key, label, monthStart);
          if (value !== null) {
            month.facturacion += value;
            month.daysWithFact += 1;
          }
          factByLineDate.set(`${baseKey}|${date}`, {
            value,
            cell: `${excelColumnName(index)}${headerIndex + 2 + rowOffset}`,
            label,
          });
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
          const monthStart = `${date.slice(0, 7)}-01`;
          const key = `${baseKey}|${monthStart}`;
          const month = ensureMonth(key, label, monthStart);
          if (value !== null) {
            month.cogs += value;
            month.daysWithCogs += 1;
          }
          cogsByLineDate.set(`${baseKey}|${date}`, {
            value,
            cell: `${excelColumnName(index)}${headerIndex + 2 + rowOffset}`,
            label,
          });
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

    return {
      key,
      line: planLine?.line || dailyLine?.line || key,
      monthStart,
      monthLabel: displayMonth(monthStart),
      budget,
      diario,
      diff,
      instruction: status === 'solo-budget'
        ? 'Existe en budget general y no en diario'
        : status === 'solo-diario'
          ? 'Existe en diario (FY) y no en budget general'
          : desfaseInstruction(diff),
      status,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.line.localeCompare(b.line, 'es'));
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

    return {
      key,
      line: planLine?.line || dailyLine?.line || key,
      monthStart,
      monthLabel: displayMonth(monthStart),
      budget,
      diario,
      diff,
      instruction: status === 'solo-budget'
        ? 'Existe en budget general y no en diario'
        : status === 'solo-diario'
          ? 'Existe en diario (FY) y no en budget general'
          : desfaseInstruction(diff),
      status,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.line.localeCompare(b.line, 'es'));
}

function buildCogsCorrectionFromPlan(
  dailyWorkbook: WorkbookUpload,
  plan: Map<string, PlanMonthLine>,
  fyStartYear: number
): CogsCorrectionSummary | null {
  const factSheet = findFacturacionSheet(dailyWorkbook);
  const cogsSheet = findCogsSheet(dailyWorkbook);
  if (!factSheet || !cogsSheet) return null;

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

  cogsSheet.rows.slice(cogsHeaderIndex + 1).forEach((cogsRow, rowOffset) => {
    const rowIndex = cogsHeaderIndex + 1 + rowOffset;
    const baseKey = lineKey([cogsRow[0], cogsRow[1], normalizeZoneForCompare(cogsRow[2]), normalizeCountryCode(cogsRow[3])]);
    if (!baseKey.replace(/\|/g, '')) return;

    const factRow = factRows.get(baseKey);
    const label = [cogsRow[0], cogsRow[1], cogsRow[2], cogsRow[3]].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');

    if (!factRow) {
      skippedLines.push(`${label}: sin línea de facturación`);
      return;
    }

    const monthBuckets = new Map<string, Array<{ index: number; date: string; expected: number | null }>>();
    let sawPlan = false;

    cogsDateColumns.forEach(({ index, date }) => {
      const factIndex = factDateColumns.get(date);
      if (factIndex === undefined) return;
      const monthStart = `${date.slice(0, 7)}-01`;
      const planLine = planByLineMonth.get(`${baseKey}|${monthStart}`);
      if (!planLine || planLine.cogsRate === null) return;

      sawPlan = true;
      const fact = numericValue(factRow[factIndex]);
      const expected = fact === null ? null : roundMoney(fact * planLine.cogsRate);
      const bucket = monthBuckets.get(monthStart) || [];
      bucket.push({ index, date, expected });
      monthBuckets.set(monthStart, bucket);
    });

    if (!sawPlan) {
      skippedLines.push(`${label}: sin % COGS en budget general para el FY`);
      return;
    }

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
        if (!planByLineMonth.has(`${baseKey}|${monthStart}`)) return;
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

  const factOkCount = factRows.filter((row) => row.status === 'ok').length;
  const factBadCount = factRows.length - factOkCount;
  const factTotalDiff = roundMoney(factRows.reduce((sum, row) => sum + row.diff, 0));
  const factSquared = factRows.length > 0 && factBadCount === 0;

  const cogsMonthBad = cogsMonthRows.filter((row) => row.status !== 'ok');
  const dayIssues = daily?.dayIssues || [];
  const cogsOk = cogsMonthBad.length === 0 && dayIssues.length === 0;

  const cogsCorrection = useMemo(() => {
    if (!dailyWorkbook || !plan) return null;
    return buildCogsCorrectionFromPlan(dailyWorkbook, plan.lines, plan.fyStartYear);
  }, [dailyWorkbook, plan]);

  const filteredFactRows = useMemo(() => {
    const needle = normalizeText(query);
    let rows = factRows;
    if (onlyMismatches) rows = rows.filter((row) => row.status !== 'ok');
    if (needle) rows = rows.filter((row) => normalizeText(row.line).includes(needle) || normalizeText(row.monthLabel).includes(needle));

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'line') return a.line.localeCompare(b.line, 'es') * direction;
      if (sort.key === 'month') return a.monthStart.localeCompare(b.monthStart) * direction;
      if (sort.key === 'budget') return (a.budget - b.budget) * direction;
      if (sort.key === 'diario') return (a.diario - b.diario) * direction;
      return (Math.abs(a.diff) - Math.abs(b.diff)) * direction;
    });
  }, [factRows, onlyMismatches, query, sort]);

  const filteredCogsMonthRows = useMemo(() => {
    const needle = normalizeText(query);
    let rows = cogsMonthRows;
    if (onlyMismatches) rows = rows.filter((row) => row.status !== 'ok');
    if (needle) rows = rows.filter((row) => normalizeText(row.line).includes(needle) || normalizeText(row.monthLabel).includes(needle));
    return rows;
  }, [cogsMonthRows, onlyMismatches, query]);

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

  const downloadCorrectedCogs = async () => {
    if (!dailyWorkbook || !cogsCorrection || cogsCorrection.rows.length === 0) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cogsCorrection.rows), 'COGS');
    const baseName = dailyWorkbook.fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(workbook, `${baseName}_COGS_FY_${plan?.fyStartYear || ''}.xlsx`);
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
              1) Cuadra facturación del diario con el budget general al céntimo (solo el FY del budget).
              Tú decides qué celdas tocar. 2) Cuadra COGS con el mismo budget y el mismo día que la facturación.
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
                onClick={() => setActiveStep(step)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  activeStep === step
                    ? 'bg-[var(--text-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-white'
                }`}
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
                <StatusBadge ok={cogsOk} label={cogsOk ? 'Cuadra y mismo día' : `${cogsMonthBad.length + dayIssues.length} incidencias`} />
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
          </section>

          {activeStep === 1 && (
            <section className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Paso 1 · Facturación</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Compara Importe del budget general con la suma diaria de Hoja1, solo en {fyLabel}.
                      No reescribimos celdas: te digo el desfase del mes y tú eliges dónde meterlo.
                    </p>
                  </div>
                  <StatusBadge
                    ok={factSquared}
                    label={`${factOkCount} OK · ${factBadCount} a corregir`}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                      <tr>
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
                          <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                            {factSquared ? 'Todo cuadra al céntimo.' : 'No hay filas con ese filtro.'}
                          </td>
                        </tr>
                      ) : filteredFactRows.map((row) => (
                        <tr key={row.key} className="border-b border-[var(--border)] align-top">
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
                  <div>
                    <h3 className="text-lg font-semibold">Paso 2 · COGS</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      El COGS mensual debe ser exactamente Importe − Margen del budget general.
                      Además, cada día con facturación debe tener COGS el mismo día.
                    </p>
                  </div>
                  <StatusBadge ok={cogsOk} label={cogsOk ? 'OK' : 'Hay incidencias'} />
                </div>
                {!factSquared && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    La facturación aún no cuadra al céntimo. Conviene cerrar el paso 1 antes de corregir COGS.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">COGS corregido (opcional)</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Genera la hoja COGS del FY usando el % del budget general sobre la facturación diaria,
                      con el mismo día y total mensual exacto. No toca años fuera del FY.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadCorrectedCogs}
                    disabled={!cogsCorrection || cogsCorrection.changeCount === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Download className="h-4 w-4" />
                    Descargar COGS FY
                  </button>
                </div>
                {cogsCorrection && (
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    Cambios propuestos: {cogsCorrection.changeCount.toLocaleString('de-DE')}
                    {cogsCorrection.skippedLines.length > 0
                      ? ` · ${cogsCorrection.skippedLines.length} líneas sin corregir`
                      : ''}
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
                  Totales mensuales COGS
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-white text-left text-xs text-[var(--text-secondary)]">
                      <tr>
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
                          <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                            Totales mensuales de COGS cuadrados.
                          </td>
                        </tr>
                      ) : filteredCogsMonthRows.map((row) => (
                        <tr key={row.key} className="border-b border-[var(--border)] align-top">
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
                <div className="max-h-[360px] overflow-auto">
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
