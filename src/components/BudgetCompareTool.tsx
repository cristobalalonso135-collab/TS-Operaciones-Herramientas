'use client';

import { useMemo, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, BarChart3, Download, FileSpreadsheet } from 'lucide-react';

type SourceKind = 'budget' | 'facturacion';
type CompareStatus = 'OK' | 'Revisar' | 'Variación alta' | 'Base cero' | 'Solo budget' | 'Solo facturación' | 'Sin área';
type SortDirection = 'asc' | 'desc';
type SortKey = 'month' | 'area' | 'responsable' | 'subresponsable' | 'vertical' | 'medio' | 'region' | 'zona' | 'facturacion' | 'budget' | 'diff' | 'pct' | 'status';
type GenericSortKey = string;
type CompareView = 'tabla' | 'resumen' | 'barras' | 'lineas' | 'alertas' | 'operaciones' | 'pendientes';
type ChartGroupKey = 'total' | 'month' | 'area' | 'responsable' | 'subresponsable' | 'vertical' | 'medio' | 'region' | 'zona';
type SummaryGroupKey = Exclude<ChartGroupKey, 'total'> | 'none';
type ComparatorTab = 'analisis' | 'reglas';
type FilterKey = 'month' | 'area' | 'responsable' | 'subresponsable' | 'vertical' | 'medio' | 'region' | 'zona' | 'status';

interface MultiFilterState {
  values: string[];
}

type CompareFilters = Record<FilterKey, MultiFilterState>;

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
  area: string;
  responsable: string;
  subresponsable: string;
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

interface ChartRow {
  label: string;
  order: number;
  facturacion: number;
  budget: number;
  diff: number;
  pct: number | null;
}

interface SummaryRow {
  key: string;
  levels: string[];
  label: string;
  facturacion: number;
  budget: number;
  diff: number;
  pct: number | null;
  rows: number;
}

interface MonthlyAnomaly {
  key: string;
  monthLabel: string;
  groupLabel: string;
  groupPct: number | null;
  monthPct: number | null;
  deviation: number;
  facturacion: number;
  budget: number;
}

interface QualitySuggestion {
  key: string;
  monthLabel: string;
  groupLabel: string;
  groupPct: number | null;
  monthPct: number | null;
  suggestedAdjustment: number;
  impact: number;
}

interface QualityOperation {
  key: string;
  groupLabel: string;
  fromMonth: string;
  toMonth: string;
  amount: number;
  impact: number;
  estimatedGain: number;
  resultingScore: number;
  fromPct: number | null;
  toPct: number | null;
  fromPctAfter: number | null;
  toPctAfter: number | null;
  targetPct: number | null;
}

interface QualitySummary {
  score: number;
  averageDeviation: number;
  totalWeight: number;
  editableRows: number;
  suggestions: QualitySuggestion[];
  operations: QualityOperation[];
}

interface StructuralAlert {
  key: string;
  type: string;
  severity: 'Alta' | 'Media';
  title: string;
  groupLabel: string;
  reason: string;
  action: string;
  facturacion: number;
  budget: number;
  diff: number;
  pct: number | null;
  selectionPct: number | null;
  months: string[];
  weight: number;
}

interface ClassificationIssue {
  key: string;
  issues: string[];
  area: string;
  responsable: string;
  subresponsable: string;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  facturacion: number;
  budget: number;
  months: string[];
  rows: number;
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
const CORE_VERTICALS = new Set([
  'futbol emotion',
  'football emotion',
  'basketball emotion',
  'running emotion',
  'brandstorming',
]);
const GRASSROOTS_VERTICALS = new Set([
  'real federacion andaluza de futbol',
  'the pitch',
]);
const GRASSROOTS_MEDIOS = new Set([
  'equipaciones',
  'equipaciones feds',
  'equipaciones web b2b',
  'equipaciones web b2c',
]);
const B2B_MEDIOS = new Set([
  'academy',
  'b2b',
  'b2b clearance',
  'b2b reps',
]);
const PRO_CLUBS_CORE_MEDIOS = new Set([
  'equipaciones pro',
]);

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

function normalizeCountry(value: unknown, zonaFallback?: unknown): string {
  const normalized = normalizeText(value).replace(/ñ/g, 'n');
  const zona = normalizeText(zonaFallback).replace(/ñ/g, 'n');
  const aliases: Record<string, string> = {
    es: 'espana',
    esp: 'espana',
    espana: 'espana',
    fr: 'francia',
    fra: 'francia',
    francia: 'francia',
    it: 'italia',
    ita: 'italia',
    italia: 'italia',
    pt: 'portugal',
    por: 'portugal',
    portugal: 'portugal',
    de: 'alemania',
    ale: 'alemania',
    alemania: 'alemania',
    otros: 'otros',
    'sin pais': 'sin pais',
  };

  if (aliases[normalized]) return aliases[normalized];
  if (aliases[zona]) return aliases[zona];
  if (zona.includes('francia')) return 'francia';
  if (zona.includes('italia')) return 'italia';
  if (zona.includes('portugal')) return 'portugal';
  return normalized;
}

function regionCode(value: unknown, zonaFallback?: unknown): string {
  const country = normalizeCountry(value, zonaFallback);
  const aliases: Record<string, string> = {
    espana: 'ES',
    francia: 'FR',
    italia: 'IT',
    portugal: 'PT',
    alemania: 'OTROS',
    otros: 'OTROS',
    'sin pais': 'Sin país',
  };

  return aliases[country] || String(value ?? '').trim();
}

function normalizeLineForComparison(line: ParsedLine, area: string): ParsedLine {
  const normalizedArea = normalizeText(area);
  const normalizedRegion = regionCode(line.region, line.zona);

  if (normalizedArea === 'grassroots') {
    return { ...line, region: normalizedRegion, zona: line.zona.trim() };
  }

  if (normalizedArea === 'pro clubs') {
    return { ...line, region: normalizedRegion, zona: '' };
  }

  if (normalizedArea === 'b2b') {
    const isFrance = normalizeCountry(line.region, line.zona) === 'francia';
    return {
      ...line,
      region: isFrance ? 'FR' : 'Sin país',
      zona: isFrance ? 'Francia' : '',
    };
  }

  return { ...line, region: normalizedRegion, zona: line.zona.trim() };
}

function deriveBusinessArea(line: Pick<ParsedLine, 'vertical' | 'medio'>): string {
  const vertical = normalizeText(line.vertical);
  const medio = normalizeText(line.medio);

  if (GRASSROOTS_VERTICALS.has(vertical)) return 'Grassroots';
  if (!CORE_VERTICALS.has(vertical)) return 'Pro Clubs';
  if (GRASSROOTS_MEDIOS.has(medio)) return 'Grassroots';
  if (B2B_MEDIOS.has(medio)) return 'B2B';
  if (PRO_CLUBS_CORE_MEDIOS.has(medio)) return 'Pro Clubs';
  return 'Sin área';
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

function findArea(line: Pick<ParsedLine, 'vertical' | 'medio'>): string {
  return deriveBusinessArea(line);
}

function findResponsable(area: string, line: Pick<ParsedLine, 'region' | 'zona'>): string {
  const normalizedArea = normalizeText(area);
  const country = normalizeCountry(line.region, line.zona);
  const zona = normalizeText(line.zona);

  if (normalizedArea === 'pro clubs') return 'Pablo Domeque';

  if (normalizedArea === 'grassroots') {
    if (zona.includes('francia')) return 'Maxime';
    if (zona.includes('italia')) return 'Francesco Nunziato';
    if (
      zona === 'portugal' ||
      zona === 'norte' ||
      zona === 'levante' ||
      zona === 'centro-sur' ||
      zona === 'centro sur'
    ) return 'Santi Navarro';
    return 'Pendiente';
  }

  if (normalizedArea === 'b2b') {
    return country === 'francia' ? 'Maxime' : 'Santi Navarro';
  }

  return 'Pendiente';
}

function findSubresponsable(area: string, line: Pick<ParsedLine, 'vertical' | 'medio' | 'region' | 'zona'>): string {
  const normalizedArea = normalizeText(area);
  const vertical = normalizeText(line.vertical);
  const medio = normalizeText(line.medio);
  const zona = normalizeText(line.zona);
  const country = normalizeCountry(line.region, line.zona);

  if (normalizedArea === 'pro clubs') {
    if (vertical.includes('mallorca') || vertical.includes('deportivo')) return 'Arturo';
    if (vertical.includes('kings league') || vertical.includes('huesca') || vertical.includes('nastic')) return 'Carlos';
    if (vertical.includes('real zaragoza')) return 'Pablo';
    if (medio === 'equipaciones pro') return 'David';
    return 'Pablo';
  }

  if (normalizedArea === 'grassroots') {
    if (!zona) return 'Pendiente';
    if (zona.includes('francia')) return 'Maxime';
    if (vertical === 'the pitch') return 'Stefano';
    if (zona === 'portugal' || zona.includes('norte')) return 'Juanjo';
    if (zona.includes('levante')) return 'Samu';
    if (zona.includes('centro-sur') || zona.includes('centro sur')) return 'Tornos';
    if (zona.includes('italia')) return 'Francesco';
  }

  if (normalizedArea === 'b2b') {
    return country === 'francia' ? 'Maxime' : 'Marta';
  }

  return 'Pendiente';
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function barWidth(value: number, maxValue: number): number {
  if (value === 0 || maxValue <= 0) return 0;
  return Math.max(1, Math.min(100, (Math.abs(value) / maxValue) * 100));
}

function createFilter(values: string[] = []): MultiFilterState {
  return { values };
}

function filterMatches(filter: MultiFilterState, value: string): boolean {
  return filter.values.length === 0 || filter.values.includes(value);
}

function compareSortable(left: string | number | null, right: string | number | null, direction: SortDirection): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'es');
  return direction === 'asc' ? result : -result;
}

function getFilterValue(row: CompareRow, key: FilterKey): string {
  if (key === 'month') return row.monthLabel;
  if (key === 'area') return row.area;
  if (key === 'responsable') return row.responsable;
  if (key === 'subresponsable') return row.subresponsable;
  if (key === 'vertical') return row.vertical;
  if (key === 'medio') return row.medio;
  if (key === 'region') return row.region;
  if (key === 'zona') return row.zona;
  return row.status;
}

function optionsForFilter(rows: CompareRow[], filters: CompareFilters, key: FilterKey): string[] {
  const scopedRows = rows.filter((row) => (
    (Object.keys(filters) as FilterKey[]).every((filterKey) => (
      filterKey === key || filterMatches(filters[filterKey], getFilterValue(row, filterKey))
    ))
  ));
  const values = Array.from(new Set(scopedRows.map((row) => getFilterValue(row, key)).filter(Boolean)));

  if (key === 'month') {
    return values.sort((a, b) => (MONTH_ORDER.get(a) ?? 99) - (MONTH_ORDER.get(b) ?? 99));
  }

  if (key === 'status') {
    const statusOrder: CompareStatus[] = ['OK', 'Revisar', 'Variación alta', 'Base cero', 'Solo budget', 'Solo facturación', 'Sin área'];
    return statusOrder.filter((status) => values.includes(status));
  }

  return values.sort((a, b) => a.localeCompare(b, 'es'));
}

function getChartGroup(row: CompareRow, groupBy: ChartGroupKey): { label: string; order: number } {
  if (groupBy === 'total') return { label: 'Total selección', order: 0 };
  if (groupBy === 'month') return { label: row.monthLabel, order: MONTH_ORDER.get(row.monthLabel) ?? 99 };
  if (groupBy === 'area') return { label: row.area || 'Sin área', order: 0 };
  if (groupBy === 'responsable') return { label: row.responsable || 'Sin responsable', order: 0 };
  if (groupBy === 'subresponsable') return { label: row.subresponsable || 'Sin subresponsable', order: 0 };
  if (groupBy === 'vertical') return { label: row.vertical || 'Sin vertical', order: 0 };
  if (groupBy === 'medio') return { label: row.medio || 'Sin medio', order: 0 };
  if (groupBy === 'region') return { label: row.region || 'Sin región', order: 0 };
  return { label: row.zona || 'Sin zona', order: 0 };
}

function getSummaryGroupValue(row: CompareRow, groupBy: SummaryGroupKey): { label: string; order: number } {
  if (groupBy === 'none') return { label: '', order: 0 };
  return getChartGroup(row, groupBy);
}

function summaryGroupTitle(groupBy: SummaryGroupKey): string {
  if (groupBy === 'month') return 'Mes';
  if (groupBy === 'area') return 'Área';
  if (groupBy === 'responsable') return 'Responsable';
  if (groupBy === 'subresponsable') return 'Subresponsable';
  if (groupBy === 'vertical') return 'Vertical';
  if (groupBy === 'medio') return 'Medio';
  if (groupBy === 'region') return 'Región';
  if (groupBy === 'zona') return 'Zona';
  return 'Sin nivel';
}

function buildChartRows(rows: CompareRow[], groupBy: ChartGroupKey): ChartRow[] {
  const grouped = new Map<string, ChartRow>();

  rows.forEach((row) => {
    const group = getChartGroup(row, groupBy);
    const existing = grouped.get(group.label) || {
      label: group.label,
      order: group.order,
      facturacion: 0,
      budget: 0,
      diff: 0,
      pct: null,
    };

    existing.facturacion += row.facturacion;
    existing.budget += row.budget;
    grouped.set(group.label, existing);
  });

  return Array.from(grouped.values())
    .map((row) => {
      const diff = row.budget - row.facturacion;
      const pct = row.facturacion !== 0 ? (diff / Math.abs(row.facturacion)) * 100 : null;
      return { ...row, diff, pct };
    })
    .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, 'es'));
}

function buildSummaryRows(rows: CompareRow[], levels: SummaryGroupKey[]): SummaryRow[] {
  const activeLevels = levels.filter((level) => level !== 'none');
  const grouped = new Map<string, SummaryRow & { orderKey: string }>();

  rows.forEach((row) => {
    const groups = activeLevels.length > 0
      ? activeLevels.map((level) => getSummaryGroupValue(row, level))
      : [{ label: 'Total selección', order: 0 }];
    const key = groups.map((group) => group.label).join('||');
    const existing = grouped.get(key) || {
      key,
      levels: groups.map((group) => group.label),
      label: groups.map((group) => group.label).join(' > '),
      facturacion: 0,
      budget: 0,
      diff: 0,
      pct: null,
      rows: 0,
      orderKey: groups.map((group) => String(group.order).padStart(3, '0')).join('|'),
    };

    existing.facturacion += row.facturacion;
    existing.budget += row.budget;
    existing.rows += 1;
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .map((row) => {
      const diff = row.budget - row.facturacion;
      const pct = row.facturacion !== 0 ? (diff / Math.abs(row.facturacion)) * 100 : null;
      return { ...row, diff, pct };
    })
    .sort((a, b) => {
      const diffSort = Math.abs(b.diff) - Math.abs(a.diff);
      if (diffSort !== 0) return diffSort;
      return a.orderKey.localeCompare(b.orderKey, 'es') || a.label.localeCompare(b.label, 'es');
    });
}

function linePoints(rows: ChartRow[], getter: (row: ChartRow) => number, maxValue: number): string {
  if (rows.length === 0) return '';
  return rows.map((row, index) => {
    const x = rows.length === 1 ? 380 : 48 + (index * (664 / (rows.length - 1)));
    const y = 220 - ((Math.max(0, getter(row)) / Math.max(1, maxValue)) * 170);
    return `${x},${y}`;
  }).join(' ');
}

function linePoint(row: ChartRow, index: number, rows: ChartRow[], getter: (row: ChartRow) => number, maxValue: number): { x: number; y: number } {
  const x = rows.length === 1 ? 380 : 48 + (index * (664 / (rows.length - 1)));
  const y = 220 - ((Math.max(0, getter(row)) / Math.max(1, maxValue)) * 170);
  return { x, y };
}

function anomalyBaseKey(row: CompareRow): string {
  return [row.area, row.responsable, row.subresponsable, row.vertical, row.medio, row.region, row.zona].map(normalizeText).join('|');
}

function anomalyLabel(row: CompareRow): string {
  return [row.vertical, row.medio, row.region, row.zona].filter(Boolean).join(' · ');
}

function buildMonthlyAnomalies(rows: CompareRow[]): MonthlyAnomaly[] {
  const grouped = new Map<string, { label: string; facturacion: number; budget: number; rows: CompareRow[] }>();

  rows.forEach((row) => {
    const key = anomalyBaseKey(row);
    const current = grouped.get(key) || { label: anomalyLabel(row), facturacion: 0, budget: 0, rows: [] };
    current.facturacion += row.facturacion;
    current.budget += row.budget;
    current.rows.push(row);
    grouped.set(key, current);
  });

  const anomalies: MonthlyAnomaly[] = [];
  grouped.forEach((group, key) => {
    if (Math.abs(group.facturacion) < 1000) return;
    const groupPct = group.facturacion !== 0 ? ((group.budget - group.facturacion) / Math.abs(group.facturacion)) * 100 : null;
    if (groupPct === null) return;

    group.rows.forEach((row) => {
      let monthPct: number | null = null;
      let deviation = 0;

      if (row.facturacion !== 0) {
        monthPct = ((row.budget - row.facturacion) / Math.abs(row.facturacion)) * 100;
        deviation = Math.abs(monthPct - groupPct);
      } else if (row.budget !== 0) {
        deviation = Math.max(100, Math.abs(groupPct));
      }

      const threshold = Math.max(25, Math.abs(groupPct) * 0.35);
      if (deviation >= threshold && Math.abs(row.budget - row.facturacion) >= 1000) {
        anomalies.push({
          key: `${key}|${row.monthKey}`,
          monthLabel: row.monthLabel,
          groupLabel: group.label,
          groupPct,
          monthPct,
          deviation,
          facturacion: row.facturacion,
          budget: row.budget,
        });
      }
    });
  });

  return anomalies.sort((a, b) => b.deviation - a.deviation).slice(0, 10);
}

function isEditableMonth(monthLabel: string, lockedThroughIndex: number): boolean {
  const order = MONTH_ORDER.get(monthLabel) ?? 99;
  return order > lockedThroughIndex;
}

function buildQualitySummary(rows: CompareRow[], lockedThroughIndex: number): QualitySummary {
  const grouped = new Map<string, { label: string; facturacion: number; budget: number; rows: CompareRow[] }>();

  const deviationAfterBudget = (row: CompareRow, budget: number, targetPct: number): number => {
    if (row.facturacion !== 0) {
      const pct = ((budget - row.facturacion) / Math.abs(row.facturacion)) * 100;
      return Math.abs(pct - targetPct);
    }

    return budget !== 0 ? Math.max(100, Math.abs(targetPct)) : 0;
  };

  const pctAfterBudget = (row: CompareRow, budget: number): number | null => {
    if (row.facturacion === 0) return null;
    return ((budget - row.facturacion) / Math.abs(row.facturacion)) * 100;
  };

  rows.forEach((row) => {
    const key = anomalyBaseKey(row);
    const current = grouped.get(key) || { label: anomalyLabel(row), facturacion: 0, budget: 0, rows: [] };
    current.facturacion += row.facturacion;
    current.budget += row.budget;
    current.rows.push(row);
    grouped.set(key, current);
  });

  let weightedDeviation = 0;
  let totalWeight = 0;
  let editableRows = 0;
  const suggestions: QualitySuggestion[] = [];
  const operations: QualityOperation[] = [];

  grouped.forEach((group, key) => {
    if (Math.abs(group.facturacion) < 1000) return;
    const groupPct = group.facturacion !== 0 ? ((group.budget - group.facturacion) / Math.abs(group.facturacion)) * 100 : null;
    if (groupPct === null) return;
    const editableLineRows: Array<{
      row: CompareRow;
      monthPct: number | null;
      expectedBudget: number;
      suggestedAdjustment: number;
      deviation: number;
      weight: number;
    }> = [];

    group.rows
      .filter((row) => isEditableMonth(row.monthLabel, lockedThroughIndex))
      .forEach((row) => {
        const weight = Math.max(Math.abs(row.facturacion), Math.abs(row.budget));
        if (weight < 1000) return;

        let monthPct: number | null = null;
        let expectedBudget = 0;
        let deviation = 0;

        if (row.facturacion !== 0) {
          monthPct = ((row.budget - row.facturacion) / Math.abs(row.facturacion)) * 100;
          expectedBudget = row.facturacion * (1 + groupPct / 100);
          deviation = Math.abs(monthPct - groupPct);
        } else if (row.budget !== 0) {
          expectedBudget = 0;
          deviation = Math.max(100, Math.abs(groupPct));
        }

        const cappedDeviation = Math.min(120, deviation);
        weightedDeviation += cappedDeviation * weight;
        totalWeight += weight;
        editableRows += 1;

        const suggestedAdjustment = expectedBudget - row.budget;
        editableLineRows.push({ row, monthPct, expectedBudget, suggestedAdjustment, deviation, weight });

        if (Math.abs(suggestedAdjustment) >= 1000 && deviation >= Math.max(20, Math.abs(groupPct) * 0.25)) {
          suggestions.push({
            key: `${key}|${row.monthKey}`,
            monthLabel: row.monthLabel,
            groupLabel: group.label,
            groupPct,
            monthPct,
            suggestedAdjustment,
            impact: deviation * weight,
          });
        }
      });

    const donors = editableLineRows
      .filter((item) => item.suggestedAdjustment < -1000)
      .sort((a, b) => Math.abs(b.suggestedAdjustment) - Math.abs(a.suggestedAdjustment));
    const receivers = editableLineRows
      .filter((item) => item.suggestedAdjustment > 1000)
      .sort((a, b) => Math.abs(b.suggestedAdjustment) - Math.abs(a.suggestedAdjustment));

    const usedDonor = new Set<string>();
    const usedReceiver = new Set<string>();
    donors.forEach((donor) => {
      const receiver = receivers.find((candidate) => !usedReceiver.has(candidate.row.monthKey));
      if (!receiver || usedDonor.has(donor.row.monthKey)) return;
      const amount = Math.min(Math.abs(donor.suggestedAdjustment), Math.abs(receiver.suggestedAdjustment));
      if (amount < 1000) return;

      const donorAfterDeviation = deviationAfterBudget(donor.row, donor.row.budget - amount, groupPct);
      const receiverAfterDeviation = deviationAfterBudget(receiver.row, receiver.row.budget + amount, groupPct);
      const donorPctAfter = pctAfterBudget(donor.row, donor.row.budget - amount);
      const receiverPctAfter = pctAfterBudget(receiver.row, receiver.row.budget + amount);
      const beforeImpact = (Math.min(120, donor.deviation) * donor.weight) + (Math.min(120, receiver.deviation) * receiver.weight);
      const afterImpact = (Math.min(120, donorAfterDeviation) * donor.weight) + (Math.min(120, receiverAfterDeviation) * receiver.weight);
      const currentImpact = Math.max(0, beforeImpact - afterImpact);
      if (currentImpact <= 0) return;

      operations.push({
        key: `${key}|${donor.row.monthKey}|${receiver.row.monthKey}`,
        groupLabel: group.label,
        fromMonth: donor.row.monthLabel,
        toMonth: receiver.row.monthLabel,
        amount,
        impact: currentImpact,
        estimatedGain: 0,
        resultingScore: 0,
        fromPct: donor.monthPct,
        toPct: receiver.monthPct,
        fromPctAfter: donorPctAfter,
        toPctAfter: receiverPctAfter,
        targetPct: groupPct,
      });
      usedDonor.add(donor.row.monthKey);
      usedReceiver.add(receiver.row.monthKey);
    });
  });

  const averageDeviation = totalWeight > 0 ? weightedDeviation / totalWeight : 0;
  const score = Math.max(0, Math.min(10, 10 - (averageDeviation / 18)));
  let runningScore = score;
  const rankedOperations: QualityOperation[] = [];
  operations
    .sort((a, b) => b.impact - a.impact)
    .forEach((operation) => {
      if (rankedOperations.length >= 10) return;
      const rawGain = totalWeight > 0 ? operation.impact / totalWeight / 18 : 0;
      const estimatedGain = Math.min(Math.max(0, 10 - runningScore), rawGain);
      if (estimatedGain < 0.05) return;
      runningScore = Math.min(10, runningScore + estimatedGain);
      rankedOperations.push({
        ...operation,
        estimatedGain,
        resultingScore: runningScore,
      });
    });

  return {
    score,
    averageDeviation,
    totalWeight,
    editableRows,
    suggestions: suggestions.sort((a, b) => b.impact - a.impact).slice(0, 8),
    operations: rankedOperations,
  };
}

function buildStructuralAlerts(rows: CompareRow[]): StructuralAlert[] {
  const grouped = new Map<string, {
    label: string;
    area: string;
    medio: string;
    facturacion: number;
    budget: number;
    rows: CompareRow[];
  }>();

  rows.forEach((row) => {
    const key = anomalyBaseKey(row);
    const current = grouped.get(key) || {
      label: anomalyLabel(row),
      area: row.area,
      medio: row.medio,
      facturacion: 0,
      budget: 0,
      rows: [],
    };
    current.facturacion += row.facturacion;
    current.budget += row.budget;
    current.rows.push(row);
    grouped.set(key, current);
  });

  const totalFacturacion = rows.reduce((sum, row) => sum + row.facturacion, 0);
  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0);
  const selectionPct = totalFacturacion !== 0 ? ((totalBudget - totalFacturacion) / Math.abs(totalFacturacion)) * 100 : null;
  const alerts: StructuralAlert[] = [];

  grouped.forEach((group, key) => {
    const diff = group.budget - group.facturacion;
    const pct = group.facturacion !== 0 ? (diff / Math.abs(group.facturacion)) * 100 : null;
    const weight = Math.max(Math.abs(group.facturacion), Math.abs(group.budget), Math.abs(diff));
    if (weight < 10000) return;

    const months = group.rows
      .filter((row) => Math.max(Math.abs(row.facturacion), Math.abs(row.budget)) >= 1000)
      .sort((a, b) => Math.max(Math.abs(b.facturacion), Math.abs(b.budget)) - Math.max(Math.abs(a.facturacion), Math.abs(a.budget)))
      .slice(0, 3)
      .map((row) => row.monthLabel);
    const isEquipacionesPro = normalizeText(group.medio).includes('equipaciones pro');
    const hasNoBase = Math.abs(group.facturacion) < 1000 && Math.abs(group.budget) >= 10000;
    const extremePct = pct !== null && Math.abs(pct) >= 150 && Math.abs(diff) >= 25000;
    const farFromSelection = pct !== null && selectionPct !== null && Math.abs(pct - selectionPct) >= Math.max(80, Math.abs(selectionPct) * 1.5) && Math.abs(diff) >= 25000;
    const volumeJump = Math.abs(diff) >= 100000 && (hasNoBase || extremePct || farFromSelection);

    if (!(isEquipacionesPro || hasNoBase || extremePct || farFromSelection || volumeJump)) return;

    let type = 'Supuesto de budget';
    let title = 'Revisar supuesto de la línea';
    let reason = `La línea crece ${formatPercent(pct)} frente al año anterior, con una diferencia de ${formatCurrency(diff)}.`;
    let action = 'No lo trataría como movimiento entre meses: revisa si el objetivo anual de esta combinación es correcto antes de recolocar budget.';

    if (isEquipacionesPro) {
      type = 'Caso específico';
      title = 'Equipaciones PRO (Elche)';
      reason = `Esta combinación tiene ${formatCurrency(group.budget)} de budget frente a ${formatCurrency(group.facturacion)} de facturación histórica. Puede venir de arrastrar el budget anterior y no de la situación prevista.`;
      action = 'Validar el supuesto anual de Equipaciones PRO antes de tocar meses. Si el escenario ha cambiado, ajustaría el total de la línea y después volvería a mirar Operaciones.';
    } else if (hasNoBase) {
      type = 'Budget sin base histórica';
      title = 'Budget con histórico casi cero';
      reason = `Hay ${formatCurrency(group.budget)} de budget con ${formatCurrency(group.facturacion)} de facturación histórica.`;
      action = 'Revisar si es una línea nueva real o si el budget está asignado a una combinación equivocada.';
    } else if (farFromSelection) {
      type = 'Crecimiento fuera de tendencia';
      title = 'Crecimiento muy distinto al filtro';
      reason = `La línea crece ${formatPercent(pct)} mientras la selección filtrada crece ${formatPercent(selectionPct)}.`;
      action = 'Comparar contra el responsable/medio/vertical filtrado. Si no hay explicación de negocio, revisaría el total anual.';
    }

    alerts.push({
      key,
      type,
      severity: hasNoBase || volumeJump || isEquipacionesPro ? 'Alta' : 'Media',
      title,
      groupLabel: group.label,
      reason,
      action,
      facturacion: group.facturacion,
      budget: group.budget,
      diff,
      pct,
      selectionPct,
      months,
      weight,
    });
  });

  return alerts
    .sort((a, b) => {
      const severitySort = (a.severity === 'Alta' ? 0 : 1) - (b.severity === 'Alta' ? 0 : 1);
      if (severitySort !== 0) return severitySort;
      return b.weight - a.weight;
    })
    .slice(0, 12);
}

interface MultiFilterSelectProps {
  label: string;
  value: MultiFilterState;
  options: string[];
  onChange: (value: MultiFilterState) => void;
}

function MultiFilterSelect({ label, value, options, onChange }: MultiFilterSelectProps) {
  const summary = value.values.length === 0
    ? 'Todos'
    : value.values.length === 1
      ? value.values[0]
      : `${value.values.length} seleccionados`;
  const visibleOptions = Array.from(new Set([...value.values, ...options]));

  const toggleValue = (option: string) => {
    const values = value.values.includes(option)
      ? value.values.filter((item) => item !== option)
      : [...value.values, option];
    onChange({ ...value, values });
  };

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <details className="group relative">
        <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition hover:border-[var(--accent)]">
          <span className="min-w-0 truncate">{summary}</span>
          <span className="text-xs text-[var(--text-muted)]">▾</span>
        </summary>
        <div className="absolute z-30 mt-1 w-72 rounded-md border border-[var(--border)] bg-white p-2 shadow-lg">
          <button
            type="button"
            onClick={() => onChange(createFilter())}
            className="mb-2 w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-soft)]"
          >
            Limpiar selección
          </button>
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {visibleOptions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-[var(--text-muted)]">Sin opciones disponibles</div>
            ) : visibleOptions.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--bg-soft)]">
                <input
                  type="checkbox"
                  checked={value.values.includes(option)}
                  onChange={() => toggleValue(option)}
                  className="h-4 w-4 accent-[var(--text-primary)]"
                />
                <span className="min-w-0 truncate" title={option}>{option}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
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

function GenericSortButton({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: GenericSortKey;
  sort: { key: GenericSortKey; direction: SortDirection };
  onSort: (key: GenericSortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-full items-center gap-1 text-xs font-medium ${align === 'right' ? 'justify-end' : 'justify-start'} ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
    >
      {label}
      <Icon className="h-3 w-3" />
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
  const [activeTab, setActiveTab] = useState<ComparatorTab>('analisis');
  const [activeView, setActiveView] = useState<CompareView>('tabla');
  const [chartGroupBy, setChartGroupBy] = useState<ChartGroupKey>('month');
  const [summaryLevels, setSummaryLevels] = useState<SummaryGroupKey[]>(['vertical', 'medio', 'none']);
  const [lockedThroughIndex, setLockedThroughIndex] = useState(4);
  const [filters, setFilters] = useState<CompareFilters>({
    month: createFilter(),
    area: createFilter(),
    responsable: createFilter(),
    subresponsable: createFilter(),
    vertical: createFilter(),
    medio: createFilter(),
    region: createFilter(),
    zona: createFilter(),
    status: createFilter(),
  });
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'diff', direction: 'desc' });
  const [summarySort, setSummarySort] = useState<{ key: GenericSortKey; direction: SortDirection }>({ key: 'diff', direction: 'desc' });
  const [anomalySort, setAnomalySort] = useState<{ key: GenericSortKey; direction: SortDirection }>({ key: 'deviation', direction: 'desc' });
  const [issueSort, setIssueSort] = useState<{ key: GenericSortKey; direction: SortDirection }>({ key: 'budget', direction: 'desc' });

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
      const area = findArea(line);
      const comparableLine = normalizeLineForComparison(line, area);
      const responsable = findResponsable(area, comparableLine);
      const subresponsable = findSubresponsable(area, comparableLine);
      const key = rowKey(comparableLine);
      const existing = grouped.get(key);
      if (existing) return existing;

      const row: CompareRow = {
        key,
        monthKey: comparableLine.monthKey,
        monthLabel: comparableLine.monthLabel,
        area,
        responsable,
        subresponsable,
        vertical: comparableLine.vertical,
        medio: comparableLine.medio,
        region: comparableLine.region,
        zona: comparableLine.zona,
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

      if (row.area === 'Sin área') status = 'Sin área';
      else if (!row.hasFacturacion && row.hasBudget) status = 'Solo budget';
      else if (row.hasFacturacion && !row.hasBudget) status = 'Solo facturación';
      else if (row.facturacion === 0 && row.budget !== 0) status = 'Base cero';
      else if (absDiff >= absThreshold && absPct >= pctThreshold) status = 'Revisar';
      else if (absPct >= pctThreshold) status = 'Variación alta';

      return { ...row, diff, pct, status };
    });
  }, [absThreshold, budgetLines, facturacionLines, pctThreshold]);

  const filteredRows = useMemo(() => {
    const filtered = comparisonRows.filter((row) => (
      filterMatches(filters.month, row.monthLabel) &&
      filterMatches(filters.area, row.area) &&
      filterMatches(filters.responsable, row.responsable) &&
      filterMatches(filters.subresponsable, row.subresponsable) &&
      filterMatches(filters.vertical, row.vertical) &&
      filterMatches(filters.medio, row.medio) &&
      filterMatches(filters.region, row.region) &&
      filterMatches(filters.zona, row.zona) &&
      filterMatches(filters.status, row.status)
    ));

    const getValue = (row: CompareRow): string | number => {
      if (sort.key === 'month') return MONTH_ORDER.get(row.monthLabel) ?? 99;
      if (sort.key === 'area') return row.area;
      if (sort.key === 'responsable') return row.responsable;
      if (sort.key === 'subresponsable') return row.subresponsable;
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
    const missingAreaCount = filteredRows.filter((row) => row.area === 'Sin área').length;
    const missingResponsableCount = filteredRows.filter((row) => row.responsable === 'Pendiente').length;
    const missingSubresponsableCount = filteredRows.filter((row) => row.subresponsable === 'Pendiente').length;

    return { facturacion, budget, diff, pct, reviewCount, missingAreaCount, missingResponsableCount, missingSubresponsableCount };
  }, [filteredRows]);

  const chartRows = useMemo(() => buildChartRows(filteredRows, chartGroupBy), [chartGroupBy, filteredRows]);
  const summaryRows = useMemo(() => buildSummaryRows(filteredRows, summaryLevels), [filteredRows, summaryLevels]);
  const sortedSummaryRows = useMemo(() => {
    const valueForSort = (row: SummaryRow): string | number | null => {
      if (summarySort.key.startsWith('level:')) {
        const levelIndex = parseInt(summarySort.key.slice(6), 10);
        return row.levels[levelIndex] || row.label;
      }
      if (summarySort.key === 'label') return row.label;
      if (summarySort.key === 'rows') return row.rows;
      if (summarySort.key === 'facturacion') return row.facturacion;
      if (summarySort.key === 'budget') return row.budget;
      if (summarySort.key === 'diff') return row.diff;
      if (summarySort.key === 'pct') return row.pct;
      return Math.abs(row.diff);
    };

    return [...summaryRows].sort((a, b) => {
      const result = compareSortable(valueForSort(a), valueForSort(b), summarySort.direction);
      if (result !== 0) return result;
      return a.label.localeCompare(b.label, 'es');
    });
  }, [summaryRows, summarySort]);
  const monthlyRows = useMemo(() => buildChartRows(filteredRows, 'month'), [filteredRows]);
  const lineMax = useMemo(() => Math.max(1, ...monthlyRows.map((row) => Math.max(Math.abs(row.facturacion), Math.abs(row.budget)))), [monthlyRows]);
  const monthlyAnomalies = useMemo(() => buildMonthlyAnomalies(filteredRows), [filteredRows]);
  const sortedMonthlyAnomalies = useMemo(() => {
    const valueForSort = (item: MonthlyAnomaly): string | number | null => {
      if (anomalySort.key === 'month') return MONTH_ORDER.get(item.monthLabel) ?? 99;
      if (anomalySort.key === 'line') return item.groupLabel;
      if (anomalySort.key === 'groupPct') return item.groupPct;
      if (anomalySort.key === 'monthPct') return item.monthPct;
      if (anomalySort.key === 'budget') return item.budget;
      if (anomalySort.key === 'facturacion') return item.facturacion;
      return item.deviation;
    };

    return [...monthlyAnomalies].sort((a, b) => {
      const result = compareSortable(valueForSort(a), valueForSort(b), anomalySort.direction);
      if (result !== 0) return result;
      return a.key.localeCompare(b.key, 'es');
    });
  }, [anomalySort, monthlyAnomalies]);
  const structuralAlerts = useMemo(() => buildStructuralAlerts(filteredRows), [filteredRows]);
  const qualitySummary = useMemo(() => buildQualitySummary(filteredRows, lockedThroughIndex), [filteredRows, lockedThroughIndex]);
  const companyQualitySummary = useMemo(() => buildQualitySummary(comparisonRows, lockedThroughIndex), [comparisonRows, lockedThroughIndex]);
  const classificationIssues = useMemo<ClassificationIssue[]>(() => {
    const grouped = new Map<string, ClassificationIssue>();

    filteredRows.forEach((row) => {
      const issues = [
        row.area === 'Sin área' ? 'Sin área' : '',
        row.responsable === 'Pendiente' ? 'Sin responsable' : '',
        row.subresponsable === 'Pendiente' ? 'Sin subresponsable' : '',
      ].filter(Boolean);

      if (issues.length === 0) return;

      const key = [
        issues.join('|'),
        row.area,
        row.responsable,
        row.subresponsable,
        row.vertical,
        row.medio,
        row.region,
        row.zona,
      ].join('::');
      const existing = grouped.get(key);

      if (existing) {
        existing.facturacion += row.facturacion;
        existing.budget += row.budget;
        existing.rows += 1;
        if (!existing.months.includes(row.monthLabel)) existing.months.push(row.monthLabel);
        return;
      }

      grouped.set(key, {
        key,
        issues,
        area: row.area,
        responsable: row.responsable,
        subresponsable: row.subresponsable,
        vertical: row.vertical,
        medio: row.medio,
        region: row.region,
        zona: row.zona,
        facturacion: row.facturacion,
        budget: row.budget,
        months: [row.monthLabel],
        rows: 1,
      });
    });

    return Array.from(grouped.values())
      .map((issue) => ({
        ...issue,
        months: issue.months.sort((a, b) => (MONTH_ORDER.get(a) ?? 99) - (MONTH_ORDER.get(b) ?? 99)),
      }))
      .sort((a, b) => Math.max(Math.abs(b.facturacion), Math.abs(b.budget)) - Math.max(Math.abs(a.facturacion), Math.abs(a.budget)));
  }, [filteredRows]);
  const sortedClassificationIssues = useMemo(() => {
    const valueForSort = (issue: ClassificationIssue): string | number => {
      if (issueSort.key === 'issue') return issue.issues.join(', ');
      if (issueSort.key === 'area') return issue.area;
      if (issueSort.key === 'responsable') return issue.responsable;
      if (issueSort.key === 'subresponsable') return issue.subresponsable;
      if (issueSort.key === 'vertical') return issue.vertical;
      if (issueSort.key === 'medio') return issue.medio;
      if (issueSort.key === 'region') return issue.region;
      if (issueSort.key === 'zona') return issue.zona;
      if (issueSort.key === 'facturacion') return issue.facturacion;
      if (issueSort.key === 'budget') return issue.budget;
      if (issueSort.key === 'months') return issue.months[0] ? MONTH_ORDER.get(issue.months[0]) ?? 99 : 99;
      return issue.rows;
    };

    return [...classificationIssues].sort((a, b) => {
      const result = compareSortable(valueForSort(a), valueForSort(b), issueSort.direction);
      if (result !== 0) return result;
      return a.key.localeCompare(b.key, 'es');
    });
  }, [classificationIssues, issueSort]);
  const chartInsight = useMemo(() => {
    const rowsWithPct = chartRows.filter((row) => row.pct !== null && Number.isFinite(row.pct));
    if (rowsWithPct.length < 2) return 'Selecciona más de un grupo para valorar si el crecimiento es homogéneo.';

    const average = rowsWithPct.reduce((sum, row) => sum + (row.pct || 0), 0) / rowsWithPct.length;
    const maxDeviation = rowsWithPct.reduce((max, row) => Math.max(max, Math.abs((row.pct || 0) - average)), 0);
    const outliers = rowsWithPct.filter((row) => Math.abs((row.pct || 0) - average) >= Math.max(15, Math.abs(average) * 0.5));

    if (outliers.length === 0) {
      return `Crecimiento bastante homogéneo: media ${formatPercent(average)} y desviación máxima ${formatPercent(maxDeviation)}.`;
    }

    return `Revisa ${outliers.length} grupo${outliers.length === 1 ? '' : 's'} fuera de tendencia. Media ${formatPercent(average)}; mayor desviación ${formatPercent(maxDeviation)}.`;
  }, [chartRows]);
  const monthlyInsight = useMemo(() => {
    if (monthlyAnomalies.length > 0) {
      const first = monthlyAnomalies[0];
      return `Mayor desvío: ${first.groupLabel} en ${first.monthLabel}. La línea crece ${formatPercent(first.groupPct)} en total, pero ese mes marca ${formatPercent(first.monthPct)}.`;
    }

    const rowsWithPct = monthlyRows.filter((row) => row.pct !== null && Number.isFinite(row.pct));
    if (rowsWithPct.length < 2) return 'La vista de líneas necesita varios meses con facturación para comparar la tendencia.';

    const totalPct = totals.pct;
    const outliers = totalPct === null
      ? []
      : rowsWithPct.filter((row) => Math.abs((row.pct || 0) - totalPct) >= Math.max(15, Math.abs(totalPct) * 0.35));

    if (outliers.length === 0) {
      return `Los meses se mueven cerca del crecimiento total de la selección (${formatPercent(totalPct)}).`;
    }

    return `Crecimiento total ${formatPercent(totalPct)}. Revisa ${outliers.map((row) => row.label).join(', ')} porque se aleja${outliers.length === 1 ? '' : 'n'} de esa tendencia.`;
  }, [monthlyAnomalies, monthlyRows, totals.pct]);

  const options = useMemo(() => ({
    month: optionsForFilter(comparisonRows, filters, 'month'),
    area: optionsForFilter(comparisonRows, filters, 'area'),
    responsable: optionsForFilter(comparisonRows, filters, 'responsable'),
    subresponsable: optionsForFilter(comparisonRows, filters, 'subresponsable'),
    vertical: optionsForFilter(comparisonRows, filters, 'vertical'),
    medio: optionsForFilter(comparisonRows, filters, 'medio'),
    region: optionsForFilter(comparisonRows, filters, 'region'),
    zona: optionsForFilter(comparisonRows, filters, 'zona'),
    status: optionsForFilter(comparisonRows, filters, 'status'),
  }), [comparisonRows, filters]);

  const updateSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateSummarySort = (key: GenericSortKey) => {
    setSummarySort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateAnomalySort = (key: GenericSortKey) => {
    setAnomalySort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateIssueSort = (key: GenericSortKey) => {
    setIssueSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateFilter = (key: FilterKey, value: MultiFilterState) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = () => {
    const header = ['Mes', 'Área', 'Responsable', 'Subresponsable', 'Vertical', 'Medio de Venta', 'Región', 'Zona', 'Facturación FY 25/26', 'Budget FY 26/27', 'Diferencia', 'Variación %', 'Estado'];
    const rows = filteredRows.map((row) => [
      row.monthLabel,
      row.area,
      row.responsable,
      row.subresponsable,
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
      <style jsx global>{`
        .budget-compare-table th {
          min-width: 88px;
          resize: horizontal;
          overflow: auto;
          cursor: col-resize;
        }

        .budget-compare-table th:first-child {
          min-width: 140px;
        }
      `}</style>
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Comparador budget</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Compara facturación FY 25/26 contra budget FY 26/27 con la granularidad correcta de cada área.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-[var(--border)] bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('analisis')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeTab === 'analisis' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
            >
              Análisis
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reglas')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeTab === 'reglas' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] ring-1 ring-[var(--border)] hover:bg-[var(--bg-soft)]'}`}
            >
              Reglas y responsables
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'reglas' && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Áreas</p>
            <h3 className="mt-1 text-lg font-semibold">Clasificación por área</h3>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots:</span> verticales Real Federación Andaluza de Fútbol y The Pitch. También entran Fútbol Emotion, Basketball Emotion, Running Emotion y Brandstorming cuando el medio de venta sea Equipaciones, Equipaciones FEDS, Equipaciones Web B2B o Equipaciones Web B2C.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">B2B:</span> verticales Fútbol Emotion, Basketball Emotion, Running Emotion y Brandstorming cuando el medio de venta sea Academy, B2B, B2B Clearance o B2B Reps.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs:</span> todos los demás verticales que no sean Fútbol Emotion, Basketball Emotion, Running Emotion ni Brandstorming. Además, dentro de esas cuatro verticales, entra el medio Equipaciones PRO (Elche).</p>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Responsables</p>
            <h3 className="mt-1 text-lg font-semibold">Asignación de responsable</h3>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs:</span> Pablo Domeque.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots Iberia:</span> Santi Navarro cuando la zona sea Centro-Sur, Levante, Norte o Portugal.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots Italia:</span> Francesco Nunziato cuando la zona sea Italia Centro-Sur o Italia Norte.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots Francia:</span> Maxime cuando la zona sea Francia.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">B2B Francia:</span> Maxime.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">B2B no Francia:</span> Santi Navarro.</p>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Subresponsables</p>
            <h3 className="mt-1 text-lg font-semibold">Asignación de subresponsable</h3>
            <div className="mt-4 grid gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-2">
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs Mallorca o Deportivo:</span> Arturo.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs Kings League, Huesca o Nàstic:</span> Carlos.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs Real Zaragoza:</span> Pablo.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Pro Clubs Equipaciones PRO:</span> David.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots zona Centro-Sur:</span> Tornos.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots zona Levante:</span> Samu.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots zona Norte o Portugal:</span> Juanjo.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots The Pitch:</span> Stefano.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots Italia restante:</span> Francesco.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots zona Francia y B2B Francia:</span> Maxime.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">Grassroots sin zona:</span> queda pendiente de responsable y subresponsable.</p>
              <p><span className="font-semibold text-[var(--text-primary)]">B2B no Francia:</span> Marta.</p>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'analisis' && (
      <>
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
          <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
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
            <button
              type="button"
              onClick={() => setActiveView('pendientes')}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--bg-soft)]"
            >
              <p className="text-xs text-[var(--text-secondary)]">Sin área</p>
              <p className="mt-1 text-xl font-semibold text-[var(--warning)]">{totals.missingAreaCount.toLocaleString('de-DE')}</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('pendientes')}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--bg-soft)]"
            >
              <p className="text-xs text-[var(--text-secondary)]">Sin responsable</p>
              <p className="mt-1 text-xl font-semibold text-[var(--warning)]">{totals.missingResponsableCount.toLocaleString('de-DE')}</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('pendientes')}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--bg-soft)]"
            >
              <p className="text-xs text-[var(--text-secondary)]">Sin subresp.</p>
              <p className="mt-1 text-xl font-semibold text-[var(--warning)]">{totals.missingSubresponsableCount.toLocaleString('de-DE')}</p>
            </button>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Calidad de carga</p>
                <h3 className="mt-1 text-lg font-semibold">Nota {qualitySummary.score.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Mide si los meses editables siguen el crecimiento total de su propia combinación, ponderando por volumen de facturación/budget. Desviación media ponderada: {formatPercent(qualitySummary.averageDeviation)}.
                </p>
              </div>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Meses cerrados hasta</span>
                <select
                  value={lockedThroughIndex}
                  onChange={(event) => setLockedThroughIndex(parseInt(event.target.value, 10))}
                  className="h-10 w-44 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value={-1}>Ninguno</option>
                  {MONTHS.map(([, label], index) => (
                    <option key={label} value={index}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Vista</span>
                <div className="inline-flex rounded-md border border-[var(--border)] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setActiveView('tabla')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'tabla' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Tabla
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('resumen')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'resumen' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Resumen
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('barras')}
                    className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'barras' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Barras
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('lineas')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'lineas' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Líneas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('alertas')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'alertas' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Alertas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('operaciones')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'operaciones' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Operaciones
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('pendientes')}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${activeView === 'pendientes' ? 'bg-[var(--text-primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'}`}
                  >
                    Pendientes
                  </button>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Los filtros se combinan entre sí y recalculan totales, tabla, barras, líneas, alertas, operaciones y pendientes.
              </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-9">
              <MultiFilterSelect label="Mes" value={filters.month} options={options.month} onChange={(value) => updateFilter('month', value)} />
              <MultiFilterSelect label="Área" value={filters.area} options={options.area} onChange={(value) => updateFilter('area', value)} />
              <MultiFilterSelect label="Responsable" value={filters.responsable} options={options.responsable} onChange={(value) => updateFilter('responsable', value)} />
              <MultiFilterSelect label="Subresponsable" value={filters.subresponsable} options={options.subresponsable} onChange={(value) => updateFilter('subresponsable', value)} />
              <MultiFilterSelect label="Vertical" value={filters.vertical} options={options.vertical} onChange={(value) => updateFilter('vertical', value)} />
              <MultiFilterSelect label="Medio" value={filters.medio} options={options.medio} onChange={(value) => updateFilter('medio', value)} />
              <MultiFilterSelect label="Región" value={filters.region} options={options.region} onChange={(value) => updateFilter('region', value)} />
              <MultiFilterSelect label="Zona" value={filters.zona} options={options.zona} onChange={(value) => updateFilter('zona', value)} />
              <MultiFilterSelect label="Estado" value={filters.status} options={options.status} onChange={(value) => updateFilter('status', value)} />
            </div>

            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                {activeView === 'resumen' && (
                  <div className="flex flex-wrap gap-3">
                    {summaryLevels.map((level, index) => (
                      <label key={index} className="space-y-1">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Nivel {index + 1}</span>
                        <select
                          value={level}
                          onChange={(event) => {
                            const next = [...summaryLevels];
                            next[index] = event.target.value as SummaryGroupKey;
                            setSummaryLevels(next);
                          }}
                          className="h-10 w-44 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                        >
                          <option value="none">Sin nivel</option>
                          <option value="month">Mes</option>
                          <option value="area">Area</option>
                          <option value="responsable">Responsable</option>
                          <option value="subresponsable">Subresponsable</option>
                          <option value="vertical">Vertical</option>
                          <option value="medio">Medio</option>
                          <option value="region">Region</option>
                          <option value="zona">Zona</option>
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {activeView === 'barras' && (
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Comparar por</span>
                    <select
                      value={chartGroupBy}
                      onChange={(event) => setChartGroupBy(event.target.value as ChartGroupKey)}
                      className="h-10 w-44 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      <option value="month">Mes</option>
                      <option value="area">Área</option>
                      <option value="responsable">Responsable</option>
                      <option value="subresponsable">Subresponsable</option>
                      <option value="vertical">Vertical</option>
                      <option value="medio">Medio</option>
                      <option value="region">Región</option>
                      <option value="zona">Zona</option>
                      <option value="total">Todo seleccionado</option>
                    </select>
                  </label>
                )}
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
              {activeView === 'tabla' && (
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium transition hover:bg-[var(--bg-soft)]"
                >
                  <Download className="h-4 w-4" />
                  Exportar vista
                </button>
              )}
            </div>

            {activeView === 'resumen' && (
              <div className="rounded-md border border-[var(--border)] bg-white">
                <div className="border-b border-[var(--border)] p-4">
                  <p className="text-sm font-semibold">Resumen comparativo</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Agrupa la selección con los niveles elegidos. Sirve para comparar mes contra mes, vertical contra vertical, medio contra medio o combinaciones.
                  </p>
                </div>
                <div className="max-h-[620px] overflow-auto">
                  <table className="budget-compare-table w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                        {summaryLevels.filter((level) => level !== 'none').map((level, index) => (
                          <th key={`${level}-${index}`} className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium">
                            <GenericSortButton label={summaryGroupTitle(level)} sortKey={`level:${index}`} sort={summarySort} onSort={updateSummarySort} />
                          </th>
                        ))}
                        {summaryLevels.every((level) => level === 'none') && (
                          <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium">
                            <GenericSortButton label="Selección" sortKey="label" sort={summarySort} onSort={updateSummarySort} />
                          </th>
                        )}
                        <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><GenericSortButton label="Líneas" sortKey="rows" sort={summarySort} onSort={updateSummarySort} align="right" /></th>
                        <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><GenericSortButton label="Facturación" sortKey="facturacion" sort={summarySort} onSort={updateSummarySort} align="right" /></th>
                        <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><GenericSortButton label="Budget" sortKey="budget" sort={summarySort} onSort={updateSummarySort} align="right" /></th>
                        <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><GenericSortButton label="Diferencia" sortKey="diff" sort={summarySort} onSort={updateSummarySort} align="right" /></th>
                        <th className="border-b border-[var(--border)] px-3 py-2.5 text-right font-medium"><GenericSortButton label="Variación" sortKey="pct" sort={summarySort} onSort={updateSummarySort} align="right" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSummaryRows.map((row) => (
                        <tr key={row.key} className="hover:bg-[var(--bg-primary)]">
                          {row.levels.map((level, index) => (
                            <td key={`${row.key}-${index}`} className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap font-medium">
                              {level}
                            </td>
                          ))}
                          {row.levels.length === 0 && (
                            <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap font-medium">{row.label}</td>
                          )}
                          <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{row.rows.toLocaleString('de-DE')}</td>
                          <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(row.facturacion)}</td>
                          <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(row.budget)}</td>
                          <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${row.diff >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(row.diff)}</td>
                          <td className={`border-b border-[var(--border)] px-3 py-2 text-right font-mono ${(row.pct ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatPercent(row.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeView === 'tabla' && (
              <div className="max-h-[620px] overflow-auto rounded-md border border-[var(--border)]">
                <table className="budget-compare-table w-full min-w-[1480px] border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                      <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Mes" sortKey="month" sort={sort} onSort={updateSort} /></th>
                      <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Área" sortKey="area" sort={sort} onSort={updateSort} /></th>
                      <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Responsable" sortKey="responsable" sort={sort} onSort={updateSort} /></th>
                      <th className="border-b border-[var(--border)] px-3 py-2.5 text-left font-medium"><SortButton label="Subresponsable" sortKey="subresponsable" sort={sort} onSort={updateSort} /></th>
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
                        <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap font-medium">{row.area}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.responsable}</td>
                        <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap">{row.subresponsable}</td>
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
            )}

            {activeView === 'barras' && (
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Budget vs facturación</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{chartInsight}</p>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#111827]" /> Budget</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#9ca3af]" /> Facturación</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {chartRows.map((row) => {
                    const rowMax = Math.max(1, Math.abs(row.facturacion), Math.abs(row.budget));
                    const facturacionWidth = barWidth(row.facturacion, rowMax);
                    const budgetWidth = barWidth(row.budget, rowMax);
                    const isPositive = (row.pct ?? 0) >= 0;

                    return (
                      <div key={row.label} className="grid gap-2 rounded-md border border-[var(--border)] p-3 lg:grid-cols-[220px_1fr_130px] lg:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={row.label}>{row.label}</p>
                          <p className={`mt-0.5 text-xs font-medium ${isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {formatPercent(row.pct)}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Budget</span>
                            <div className="h-3 flex-1 rounded-sm bg-[var(--bg-soft)]">
                              <div className="h-3 rounded-sm bg-[#111827]" style={{ width: `${budgetWidth}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Fact.</span>
                            <div className="h-3 flex-1 rounded-sm bg-[var(--bg-soft)]">
                              <div className="h-3 rounded-sm bg-[#9ca3af]" style={{ width: `${facturacionWidth}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <p>{formatCurrency(row.budget)}</p>
                          <p className="text-[var(--text-secondary)]">{formatCurrency(row.facturacion)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeView === 'lineas' && (
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Tendencia mensual</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{monthlyInsight}</p>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#111827]" /> Budget</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#9ca3af]" /> Facturación</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <svg viewBox="0 0 760 260" className="h-[300px] min-w-[760px] w-full">
                    <line x1="48" y1="220" x2="712" y2="220" stroke="#e5e7eb" strokeWidth="1" />
                    <line x1="48" y1="50" x2="48" y2="220" stroke="#e5e7eb" strokeWidth="1" />
                    <polyline points={linePoints(monthlyRows, (row) => row.facturacion, lineMax)} fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={linePoints(monthlyRows, (row) => row.budget, lineMax)} fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {monthlyRows.map((row, index) => {
                      const budgetPoint = linePoint(row, index, monthlyRows, (r) => r.budget, lineMax);
                      const facturacionPoint = linePoint(row, index, monthlyRows, (r) => r.facturacion, lineMax);
                      return (
                        <g key={row.label}>
                          <circle cx={facturacionPoint.x} cy={facturacionPoint.y} r="4" fill="#9ca3af" />
                          <circle cx={budgetPoint.x} cy={budgetPoint.y} r="4" fill="#111827" />
                          <text x={budgetPoint.x} y="244" textAnchor="middle" className="fill-[var(--text-secondary)] text-[10px]">{row.label.replace(/^[0-9]+ · /, '')}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {monthlyRows.map((row) => (
                    <div key={row.label} className="rounded-md border border-[var(--border)] p-3">
                      <p className="text-xs font-medium">{row.label}</p>
                      <p className={`mt-1 text-sm font-semibold ${(row.pct ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatPercent(row.pct)}</p>
                      <p className="mt-1 font-mono text-xs">{formatCurrency(row.budget)}</p>
                      <p className="font-mono text-xs text-[var(--text-secondary)]">{formatCurrency(row.facturacion)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3">
                  <p className="text-sm font-semibold">Desvíos mensuales frente al crecimiento de su línea</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Compara cada mes contra el crecimiento total de la misma combinación de área, vertical, medio, región y zona. Sirve para localizar meses donde se ha metido presupuesto fuera de patrón.
                  </p>
                  {monthlyAnomalies.length === 0 ? (
                    <p className="mt-3 text-xs font-medium text-[var(--success)]">No veo meses claramente fuera de la tendencia de su propia línea con los filtros actuales.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-md border border-[var(--border)] bg-white">
                      <table className="budget-compare-table w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                        <thead>
                          <tr className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                            <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><GenericSortButton label="Mes" sortKey="month" sort={anomalySort} onSort={updateAnomalySort} /></th>
                            <th className="border-b border-[var(--border)] px-3 py-2 text-left font-medium"><GenericSortButton label="Línea" sortKey="line" sort={anomalySort} onSort={updateAnomalySort} /></th>
                            <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Crec. línea" sortKey="groupPct" sort={anomalySort} onSort={updateAnomalySort} align="right" /></th>
                            <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Crec. mes" sortKey="monthPct" sort={anomalySort} onSort={updateAnomalySort} align="right" /></th>
                            <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Budget" sortKey="budget" sort={anomalySort} onSort={updateAnomalySort} align="right" /></th>
                            <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Facturación" sortKey="facturacion" sort={anomalySort} onSort={updateAnomalySort} align="right" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedMonthlyAnomalies.map((item) => (
                            <tr key={item.key}>
                              <td className="border-b border-[var(--border)] px-3 py-2 whitespace-nowrap font-medium">{item.monthLabel}</td>
                              <td className="border-b border-[var(--border)] px-3 py-2">{item.groupLabel}</td>
                              <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatPercent(item.groupPct)}</td>
                              <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono text-[var(--danger)]">{formatPercent(item.monthPct)}</td>
                              <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(item.budget)}</td>
                              <td className="border-b border-[var(--border)] px-3 py-2 text-right font-mono">{formatCurrency(item.facturacion)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeView === 'alertas' && (
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold">Alertas de supuesto</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Señala combinaciones donde el problema parece estar en el total anual o en la hipótesis de negocio, no en mover budget entre meses.
                  </p>
                </div>

                {structuralAlerts.length === 0 ? (
                  <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-xs font-medium text-[var(--success)]">
                    No veo alertas estructurales con los filtros actuales. Si una línea sigue preocupándote, acota por responsable, vertical o medio para revisarla con más detalle.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {structuralAlerts.map((alert, index) => (
                      <div key={alert.key} className={`rounded-md border p-3 ${alert.severity === 'Alta' ? 'border-amber-200 bg-amber-50/70' : 'border-[var(--border)] bg-white'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">Alerta {index + 1}: {alert.title}</p>
                              <span className={`rounded px-2 py-1 text-[11px] font-semibold ${alert.severity === 'Alta' ? 'bg-amber-100 text-amber-800' : 'bg-[var(--bg-soft)] text-[var(--text-secondary)]'}`}>
                                {alert.severity}
                              </span>
                              <span className="rounded bg-white px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                                {alert.type}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{alert.groupLabel}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-right text-xs md:grid-cols-4">
                            <div className="rounded bg-white px-2 py-1">
                              <p className="text-[var(--text-muted)]">Fact.</p>
                              <p className="font-mono font-semibold">{formatCurrency(alert.facturacion)}</p>
                            </div>
                            <div className="rounded bg-white px-2 py-1">
                              <p className="text-[var(--text-muted)]">Budget</p>
                              <p className="font-mono font-semibold">{formatCurrency(alert.budget)}</p>
                            </div>
                            <div className="rounded bg-white px-2 py-1">
                              <p className="text-[var(--text-muted)]">Dif.</p>
                              <p className={`font-mono font-semibold ${alert.diff >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatCurrency(alert.diff)}</p>
                            </div>
                            <div className="rounded bg-white px-2 py-1">
                              <p className="text-[var(--text-muted)]">Crec.</p>
                              <p className={`font-mono font-semibold ${(alert.pct ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatPercent(alert.pct)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                          <p className="rounded bg-white px-2 py-1 text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">Motivo:</span> {alert.reason}
                          </p>
                          <p className="rounded bg-white px-2 py-1 text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">Qué haría:</span> {alert.action}
                          </p>
                          <p className="rounded bg-white px-2 py-1 text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">Meses con más peso:</span> {alert.months.length ? alert.months.join(', ') : 'Sin concentración clara'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === 'operaciones' && (
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold">Libro mayor de movimientos sugeridos</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Propone mover budget entre meses editables dentro de la misma combinación para acercar cada mes al crecimiento total de su línea. La mejora estimada es orientativa y ponderada por volumen.
                  </p>
                </div>

                {qualitySummary.operations.length === 0 ? (
                  <p className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-xs font-medium text-[var(--success)]">
                    No veo movimientos claros entre meses editables con los filtros actuales.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {qualitySummary.operations.map((operation, index) => {
                      const companyGain = companyQualitySummary.totalWeight > 0
                        ? Math.min(Math.max(0, 10 - companyQualitySummary.score), operation.impact / companyQualitySummary.totalWeight / 18)
                        : 0;
                      const companyResultingScore = Math.min(10, companyQualitySummary.score + companyGain);

                      return (
                        <div key={operation.key} className="rounded-md border border-[var(--border)] p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">Operación {index + 1}</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">{operation.groupLabel}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-medium">
                              <p className="rounded-md bg-[var(--success-soft)] px-2 py-1 text-[var(--success)]">
                                Selección +{operation.estimatedGain.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · nota {operation.resultingScore.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </p>
                              <p className="rounded-md bg-[var(--bg-soft)] px-2 py-1 text-[var(--text-secondary)]">
                                Empresa +{companyGain.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · nota {companyResultingScore.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm">
                            Quita <span className="font-mono font-semibold">{formatCurrency(operation.amount)}</span> de <span className="font-semibold">{operation.fromMonth}</span> y mételo en <span className="font-semibold">{operation.toMonth}</span>.
                          </p>
                          <div className="mt-2 grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-3">
                            <p className="rounded bg-[var(--bg-soft)] px-2 py-1">
                              Objetivo línea <span className="font-medium text-[var(--text-primary)]">{formatPercent(operation.targetPct)}</span>
                            </p>
                            <p className="rounded bg-[var(--bg-soft)] px-2 py-1">
                              Origen <span className="font-medium text-[var(--text-primary)]">{formatPercent(operation.fromPct)}</span> → <span className="font-medium text-[var(--success)]">{formatPercent(operation.fromPctAfter)}</span>
                            </p>
                            <p className="rounded bg-[var(--bg-soft)] px-2 py-1">
                              Destino <span className="font-medium text-[var(--text-primary)]">{formatPercent(operation.toPct)}</span> → <span className="font-medium text-[var(--success)]">{formatPercent(operation.toPctAfter)}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeView === 'pendientes' && (
              <div className="rounded-md border border-[var(--border)] bg-white">
                <div className="border-b border-[var(--border)] p-4">
                  <p className="text-sm font-semibold">Pendientes de clasificación</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Muestra las combinaciones que no han recibido área, responsable o subresponsable con los filtros actuales.
                  </p>
                </div>

                {classificationIssues.length === 0 ? (
                  <p className="m-4 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-xs font-medium text-[var(--success)]">
                    No hay pendientes de clasificación con los filtros actuales.
                  </p>
                ) : (
                  <div className="max-h-[520px] overflow-auto">
                    <table className="budget-compare-table w-full min-w-[1180px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                        <tr>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Pendiente" sortKey="issue" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Área" sortKey="area" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Responsable" sortKey="responsable" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Subresponsable" sortKey="subresponsable" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Vertical" sortKey="vertical" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Medio" sortKey="medio" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Región" sortKey="region" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Zona" sortKey="zona" sort={issueSort} onSort={updateIssueSort} /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Facturación" sortKey="facturacion" sort={issueSort} onSort={updateIssueSort} align="right" /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 text-right font-medium"><GenericSortButton label="Budget" sortKey="budget" sort={issueSort} onSort={updateIssueSort} align="right" /></th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-medium"><GenericSortButton label="Meses" sortKey="months" sort={issueSort} onSort={updateIssueSort} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedClassificationIssues.map((issue) => (
                          <tr key={issue.key} className="border-b border-[var(--border)]">
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {issue.issues.map((name) => (
                                  <span key={name} className="rounded bg-[var(--danger-soft)] px-2 py-1 text-xs font-medium text-[var(--warning)]">{name}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2">{issue.area || '-'}</td>
                            <td className="px-3 py-2">{issue.responsable || '-'}</td>
                            <td className="px-3 py-2">{issue.subresponsable || '-'}</td>
                            <td className="px-3 py-2 font-medium">{issue.vertical || '-'}</td>
                            <td className="px-3 py-2">{issue.medio || '-'}</td>
                            <td className="px-3 py-2">{issue.region || '-'}</td>
                            <td className="px-3 py-2">{issue.zona || '-'}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(issue.facturacion)}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(issue.budget)}</td>
                            <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{issue.months.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {!hasBothFiles && (
        <section className="rounded-lg border border-dashed border-[var(--border)] bg-white/60 p-8 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm font-medium">Carga los dos CSV para ver la comparativa.</p>
        </section>
      )}
      </>
      )}
    </div>
  );
}
