import { classifyLine, findArea, normalizeText } from '@/lib/business-classification';

export interface OperationLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  facturacion: number;
  gm: number;
  free: number;
  gen: number;
}

export interface BudgetLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  vertical: string;
  medio: string;
  region: string;
  zona: string;
  budget: number;
  gmBudget: number;
}

export interface ZonaBudget {
  fileName: string;
  byZona: Record<string, number>;
  total: number;
  kept: number;
}

export interface FreeOpLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  zona: string;
  free: number;
  neta: number;
  bruto: number;
}

export interface GenOpLine {
  monthIndex: number;
  monthLabel: string;
  fyStart: number;
  zona: string;
  gen: number;
  genCost: number;
  b2cPrev: number;
  pctB2c: number | null;
}

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

function cellPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).replace(/\u00a0/g, ' ').trim() !== '';
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/^\*+\s*/, '').replace(/\s+/g, ' ');
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

function findHeader(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => {
    const needle = normalizeText(alias);
    return header === needle || header.includes(needle);
  }));
}

function fiscalMonthByIndex(index: number): { index: number; label: string } | null {
  const found = FISCAL_MONTHS.find((month) => month.index === index);
  return found ? { index: found.index, label: found.label } : null;
}

export function parseFiscalMonth(value: unknown): { index: number; label: string } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fiscalMonthByIndex(((value.getMonth() + 9) % 12) + 1);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 1 && rounded <= 12) return fiscalMonthByIndex(rounded);
  }
  if (!cellPresent(value)) return null;
  const normalized = normalizeText(value).replace(/[._'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = FISCAL_MONTHS
    .flatMap((month) => month.names.map((name) => ({ name, month })))
    .sort((a, b) => b.name.length - a.name.length);
  const named = aliases.find(({ name }) => (
    name.length <= 3
      ? new RegExp(`(?:^| )${name}(?: |$)`).test(normalized)
      : normalized.includes(name)
  ));
  if (named) return { index: named.month.index, label: named.month.label };
  return null;
}

export function parseCalendarYear(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear();
  const text = String(value ?? '');
  const full = text.match(/\b(20\d{2}|19\d{2})\b/);
  if (full) return Number(full[1]);
  const short = text.match(/[''`´’](\d{2})\b/) || text.match(/(?:^|\s)(\d{2})\s*$/);
  if (short) return 2000 + Number(short[1]);
  return null;
}

export function fyStartFrom(calendarYear: number, monthIndex: number): number {
  return monthIndex >= 10 ? calendarYear - 1 : calendarYear;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function rangeFromFiscalMonths(fyStart: number, fromMonth: number, toMonth: number): DateRange {
  const from = Math.min(Math.max(1, fromMonth), 12);
  const to = Math.max(Math.min(12, toMonth), 1);
  const startMonth = Math.min(from, to);
  const endMonth = Math.max(from, to);
  const startCal = calendarMonth(fyStart, startMonth);
  const endCal = calendarMonth(fyStart, endMonth);
  return {
    start: new Date(startCal.year, startCal.month - 1, 1),
    end: new Date(endCal.year, endCal.month, 0),
  };
}

export function shiftRange(range: DateRange, years: number): DateRange {
  return {
    start: new Date(range.start.getFullYear() + years, range.start.getMonth(), range.start.getDate()),
    end: new Date(range.end.getFullYear() + years, range.end.getMonth(), range.end.getDate()),
  };
}

export function calendarMonth(fyStart: number, monthIndex: number): { year: number; month: number } {
  const month = ((monthIndex + 2) % 12) + 1;
  const year = monthIndex >= 10 ? fyStart + 1 : fyStart;
  return { year, month };
}

export function monthOverlapsRange(fyStart: number, monthIndex: number, range: DateRange): boolean {
  const { year, month } = calendarMonth(fyStart, monthIndex);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  return monthStart <= range.end && monthEnd >= range.start;
}

export function filterByRange<T extends { fyStart: number; monthIndex: number }>(lines: T[], range: DateRange): T[] {
  return lines.filter((line) => monthOverlapsRange(line.fyStart, line.monthIndex, range));
}

function headerIndexOf(rows: unknown[][], test: (header: string) => boolean): number {
  return rows.findIndex((row) => row.some((cell) => test(normalizeHeader(cell))));
}

function dimKey(line: { vertical: string; medio: string; region: string; zona: string; monthIndex: number }): string {
  return [
    line.monthIndex,
    normalizeText(line.vertical),
    normalizeText(line.medio),
    normalizeText(line.region),
    normalizeText(line.zona),
  ].join('|');
}

function dimKeyLoose(line: { vertical: string; medio: string; zona: string; monthIndex: number }): string {
  return [
    line.monthIndex,
    normalizeText(line.vertical),
    normalizeText(line.medio),
    normalizeText(line.zona),
  ].join('|');
}

export function parseOperationRows(rows: unknown[][]): OperationLine[] {
  if (!rows.length) throw new Error('El archivo de operación está vacío.');
  const headerIndex = headerIndexOf(rows, (header) => header === 'vertical' || header.includes('importe'));
  if (headerIndex < 0) throw new Error('No reconozco el CSV de operación. ¿Trae Year-Month, Vertical, Medio, Zona e Importe Teamsports?');

  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const colMap = {
    month: findHeader(headers, ['year-month', 'ano mes', 'año mes', 'ano-mes', 'mes']),
    vertical: findHeader(headers, ['vertical']),
    medio: findHeader(headers, ['medio de venta', 'medio']),
    region: findHeader(headers, ['region']),
    zona: findHeader(headers, ['zona']),
    facturacion: headers.findIndex((header) => header.includes('importe') && header.includes('teamsports')),
    gm: findHeader(headers, ['gm']),
    free: headers.findIndex((header) => header.includes('free')),
    gen: headers.findIndex((header) => header.includes('gen') && header.includes('web') && !header.includes('%')),
  };
  if (colMap.facturacion < 0) {
    colMap.facturacion = headers.findIndex((header) => header.includes('importe') && !header.includes('a/a'));
  }
  if (colMap.month < 0 || colMap.vertical < 0 || colMap.medio < 0 || colMap.facturacion < 0) {
    throw new Error('Faltan columnas en operación: Year-Month, Vertical, Medio o Importe Teamsports.');
  }

  const parsed = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)))
    .map((row) => {
      const monthValue = row[colMap.month];
      const month = parseFiscalMonth(monthValue);
      const calendarYear = parseCalendarYear(monthValue);
      if (!month || calendarYear === null) return null;
      const vertical = String(row[colMap.vertical] ?? '').trim();
      if (!vertical) return null;
      return {
        monthIndex: month.index,
        monthLabel: month.label,
        fyStart: fyStartFrom(calendarYear, month.index),
        vertical,
        medio: String(row[colMap.medio] ?? '').trim(),
        region: colMap.region >= 0 ? String(row[colMap.region] ?? '').trim() : '',
        zona: colMap.zona >= 0 ? String(row[colMap.zona] ?? '').trim() : '',
        facturacion: parseAmount(row[colMap.facturacion]),
        gm: colMap.gm >= 0 ? parseAmount(row[colMap.gm]) : 0,
        free: colMap.free >= 0 ? parseAmount(row[colMap.free]) : 0,
        gen: colMap.gen >= 0 ? parseAmount(row[colMap.gen]) : 0,
      };
    })
    .filter((line): line is OperationLine => (
      line !== null && (line.facturacion !== 0 || line.gm !== 0 || line.free !== 0 || line.gen !== 0)
    ));

  if (parsed.length === 0) throw new Error('El CSV de operación no tiene líneas con importe, frees o generados.');
  return parsed;
}

export function parseBudgetRows(rows: unknown[][]): BudgetLine[] {
  if (!rows.length) throw new Error('El archivo de budget está vacío.');
  const headerIndex = headerIndexOf(rows, (header) => header.includes('budget') || header === 'vertical');
  if (headerIndex < 0) throw new Error('No reconozco el budget. ¿Trae Año Mes, Vertical, Medio, Zona y Budget?');

  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const colMap = {
    month: findHeader(headers, ['ano mes', 'año mes', 'month name', 'year-month', 'mes']),
    vertical: findHeader(headers, ['vertical']),
    medio: findHeader(headers, ['medio de venta', 'medio']),
    region: findHeader(headers, ['region']),
    zona: findHeader(headers, ['zona']),
    budget: findHeader(headers, ['budget']),
    gmBudget: headers.findIndex((header) => header.includes('gm') && (header.includes('bg') || header.includes('budget'))),
  };
  if (colMap.month < 0 || colMap.vertical < 0 || colMap.medio < 0 || colMap.budget < 0) {
    throw new Error('Faltan columnas en budget: Año Mes, Vertical, Medio de Venta o Budget.');
  }

  const parsed = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellPresent(cell)))
    .map((row) => {
      const monthValue = row[colMap.month];
      const month = parseFiscalMonth(monthValue);
      if (!month) return null;
      const calendarYear = parseCalendarYear(monthValue);
      const fyStart = calendarYear === null ? 2026 : fyStartFrom(calendarYear, month.index);
      const vertical = String(row[colMap.vertical] ?? '').trim();
      if (!vertical) return null;
      return {
        monthIndex: month.index,
        monthLabel: month.label,
        fyStart,
        vertical,
        medio: String(row[colMap.medio] ?? '').trim(),
        region: colMap.region >= 0 ? String(row[colMap.region] ?? '').trim() : '',
        zona: colMap.zona >= 0 ? String(row[colMap.zona] ?? '').trim() : '',
        budget: parseAmount(row[colMap.budget]),
        gmBudget: colMap.gmBudget >= 0 ? parseAmount(row[colMap.gmBudget]) : 0,
      };
    })
    .filter((line): line is BudgetLine => line !== null && (line.budget !== 0 || line.gmBudget !== 0));

  if (parsed.length === 0) throw new Error('El budget no tiene líneas con importe.');
  return parsed;
}

export function currentFyStart(lines: { fyStart: number }[]): number | null {
  if (lines.length === 0) return null;
  return Math.max(...lines.map((line) => line.fyStart));
}

export function zonaBudgetFrom(
  lines: BudgetLine[],
  fileName: string,
  keep: (line: BudgetLine) => boolean,
  emptyMessage: string,
): ZonaBudget {
  const byZona: Record<string, number> = {};
  let kept = 0;
  lines.forEach((line) => {
    if (!keep(line)) return;
    const zona = line.zona || 'Sin zona';
    byZona[zona] = (byZona[zona] ?? 0) + line.budget;
    kept += 1;
  });
  if (kept === 0) throw new Error(emptyMessage);
  return {
    fileName,
    byZona,
    total: Object.values(byZona).reduce((sum, value) => sum + value, 0),
    kept,
  };
}

export function grassrootsBudgetFrom(lines: BudgetLine[], fileName: string): ZonaBudget {
  return zonaBudgetFrom(
    lines,
    fileName,
    (line) => findArea({ vertical: line.vertical, medio: line.medio }) === 'Grassroots',
    'No he encontrado líneas Grassroots en el budget.',
  );
}

export function webB2cBudgetFrom(lines: BudgetLine[], fileName: string): ZonaBudget {
  return zonaBudgetFrom(
    lines,
    fileName,
    (line) => normalizeText(line.medio) === 'equipaciones web b2c',
    'No he encontrado Equipaciones Web B2C en el budget.',
  );
}

export function freesFromOperation(lines: OperationLine[]): FreeOpLine[] {
  const grouped = new Map<string, FreeOpLine>();
  lines.forEach((line) => {
    if (findArea({ vertical: line.vertical, medio: line.medio }) !== 'Grassroots') return;
    if (line.facturacion === 0 && line.free === 0) return;
    const zona = line.zona || 'Sin zona';
    const key = `${line.fyStart}|${line.monthIndex}|${normalizeText(zona)}`;
    const current = grouped.get(key) ?? {
      monthIndex: line.monthIndex,
      monthLabel: line.monthLabel,
      fyStart: line.fyStart,
      zona,
      free: 0,
      neta: 0,
      bruto: 0,
    };
    current.free += line.free;
    current.neta += line.facturacion;
    current.bruto = current.neta - current.free;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).filter((line) => line.neta !== 0 || line.free !== 0);
}

function prevPeriod(fyStart: number, monthIndex: number): { fyStart: number; monthIndex: number } {
  if (monthIndex === 1) return { fyStart: fyStart - 1, monthIndex: 12 };
  return { fyStart, monthIndex: monthIndex - 1 };
}

export function generadosFromOperation(lines: OperationLine[]): GenOpLine[] {
  const b2c = new Map<string, number>();
  lines.forEach((line) => {
    if (normalizeText(line.medio) !== 'equipaciones web b2c') return;
    const zona = line.zona || 'Sin zona';
    const key = `${line.fyStart}|${line.monthIndex}|${normalizeText(zona)}`;
    b2c.set(key, (b2c.get(key) ?? 0) + line.facturacion);
  });

  const grouped = new Map<string, GenOpLine>();
  lines.forEach((line) => {
    if (line.gen === 0) return;
    const zona = line.zona || 'Sin zona';
    const key = `${line.fyStart}|${line.monthIndex}|${normalizeText(zona)}`;
    const current = grouped.get(key) ?? {
      monthIndex: line.monthIndex,
      monthLabel: line.monthLabel,
      fyStart: line.fyStart,
      zona,
      gen: 0,
      genCost: 0,
      b2cPrev: 0,
      pctB2c: null,
    };
    current.gen += line.gen;
    current.genCost = -current.gen;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((line) => {
    const prev = prevPeriod(line.fyStart, line.monthIndex);
    const b2cPrev = b2c.get(`${prev.fyStart}|${prev.monthIndex}|${normalizeText(line.zona)}`) ?? 0;
    return {
      ...line,
      b2cPrev,
      pctB2c: b2cPrev === 0 ? null : (line.genCost / b2cPrev) * 100,
    };
  });
}

export interface TrackingBuildLine {
  key: string;
  fyStart: number;
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

function collapseForTracking(line: TrackingBuildLine): TrackingBuildLine {
  const area = normalizeText(line.area);
  const isKingsLeague = normalizeText(line.vertical).includes('kings league');
  return {
    ...line,
    vertical: isKingsLeague ? 'Kings League' : line.vertical,
    region: isKingsLeague ? '' : line.region,
    zona: area === 'pro clubs' || area === 'b2b' || isKingsLeague ? '' : line.zona,
  };
}

function trackingMergeKey(line: TrackingBuildLine): string {
  return [
    line.fyStart,
    line.monthIndex ?? 'ytd',
    normalizeText(line.area),
    normalizeText(line.responsable),
    normalizeText(line.subresponsable),
    normalizeText(line.vertical),
    normalizeText(line.medio),
    normalizeText(line.region),
    normalizeText(line.zona),
  ].join('|');
}

function lyMatchKey(line: TrackingBuildLine): string {
  return [
    line.monthIndex ?? 'ytd',
    normalizeText(line.area),
    normalizeText(line.responsable),
    normalizeText(line.subresponsable),
    normalizeText(line.vertical),
    normalizeText(line.medio),
    normalizeText(line.region),
    normalizeText(line.zona),
  ].join('|');
}

export function buildTrackingLines(
  operation: OperationLine[],
  budget: BudgetLine[],
  range: DateRange,
): { lines: TrackingBuildLine[]; currentFy: number | null } {
  const tyRange = range;
  const lyRange = shiftRange(range, -1);
  const tyOperation = filterByRange(operation, tyRange);
  const lyOperation = filterByRange(operation, lyRange);
  const tyMonths = new Set(tyOperation.map((line) => line.monthIndex));
  const budgetInRange = filterByRange(budget, tyRange).filter((line) => tyMonths.has(line.monthIndex));

  const budgetExact = new Map<string, { budget: number; gmBudget: number }>();
  const budgetLoose = new Map<string, { budget: number; gmBudget: number }>();
  budgetInRange.forEach((line) => {
    const exact = dimKey(line);
    const loose = dimKeyLoose(line);
    const prevExact = budgetExact.get(exact) ?? { budget: 0, gmBudget: 0 };
    budgetExact.set(exact, {
      budget: prevExact.budget + line.budget,
      gmBudget: prevExact.gmBudget + line.gmBudget,
    });
    const prevLoose = budgetLoose.get(loose) ?? { budget: 0, gmBudget: 0 };
    budgetLoose.set(loose, {
      budget: prevLoose.budget + line.budget,
      gmBudget: prevLoose.gmBudget + line.gmBudget,
    });
  });

  const toMerged = (rows: OperationLine[], attachBudget: boolean): TrackingBuildLine[] => {
    const aggregated = new Map<string, OperationLine>();
    rows.forEach((line) => {
      const key = dimKey(line);
      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, { ...line });
        return;
      }
      existing.facturacion += line.facturacion;
      existing.gm += line.gm;
      existing.free += line.free;
      existing.gen += line.gen;
    });

    const classified = Array.from(aggregated.values()).map((line, index) => {
      const classifiedLine = classifyLine({
        vertical: line.vertical,
        medio: line.medio,
        region: line.region,
        zona: line.zona,
      });
      const matched = attachBudget
        ? (budgetExact.get(dimKey(line)) ?? budgetLoose.get(dimKeyLoose(line)))
        : null;
      return collapseForTracking({
        key: `${index}|${line.fyStart}|${line.monthIndex}|${line.vertical}|${line.medio}|${line.zona}`,
        fyStart: line.fyStart,
        monthIndex: line.monthIndex,
        monthLabel: line.monthLabel,
        vertical: line.vertical,
        medio: line.medio,
        region: line.region,
        zona: line.zona,
        ...classifiedLine,
        facturacion: line.facturacion,
        budget: matched?.budget ?? 0,
        facturacionLy: 0,
        gm: line.gm,
        gmBudget: matched?.gmBudget ?? 0,
        gmLy: 0,
      });
    });

    const merged = new Map<string, TrackingBuildLine>();
    classified.forEach((line) => {
      const key = trackingMergeKey(line);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...line, key });
        return;
      }
      existing.facturacion += line.facturacion;
      existing.gm += line.gm;
      existing.budget += line.budget;
      existing.gmBudget += line.gmBudget;
    });
    return Array.from(merged.values());
  };

  const tyMerged = toMerged(tyOperation, true);
  const lyMerged = toMerged(lyOperation, false);
  const lyMap = new Map<string, TrackingBuildLine>();
  lyMerged.forEach((line) => {
    lyMap.set(lyMatchKey(line), line);
  });

  const lines = tyMerged.map((line) => {
    const ly = lyMap.get(lyMatchKey(line));
    return {
      ...line,
      facturacionLy: ly?.facturacion ?? 0,
      gmLy: ly?.gm ?? 0,
    };
  });

  return { lines, currentFy: currentFyStart(tyMerged) };
}

export function snapshotFromFileName(name: string): Date | null {
  const iso = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const euro = name.match(/(\d{1,2})[_-](\d{1,2})[_-](\d{2,4})/);
  if (!euro) return null;
  const yearRaw = Number(euro[3]);
  return new Date(yearRaw < 100 ? 2000 + yearRaw : yearRaw, Number(euro[2]) - 1, Number(euro[1]));
}
