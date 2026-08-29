import { normalizeStockGrid, parseStockAmount } from '@/lib/stock-files';

export const COVER_DAYS = 180;
export const COVER_YEAR_DAYS = 365;

export interface ProductSales {
  id: string;
  qty12: number;
  amount12: number;
  qty3: number;
}

const MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

function unquote(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

function findHeader(headers: string[], aliases: string[]): number {
  const exact = headers.findIndex((header) => aliases.some((alias) => header === alias));
  if (exact >= 0) return exact;
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

export function parseYearMonth(value: string): { year: number; month: number } | null {
  const raw = value
    .trim()
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/['’´]/g, ' ')
    .replace(/\s+/g, ' ');
  const match = raw.match(/^([a-záéíóú]+)\s+(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3)];
  if (!month) return null;
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  if (year < 1990 || year > 2100) return null;
  return { year, month };
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export function isSalesFile(rows: unknown[][]): boolean {
  const grid = normalizeStockGrid(rows);
  if (grid.length === 0) return false;
  const headers = grid[0].map((header) => unquote(header));
  const hasMonth = findHeader(headers, ['Year-Month', 'Año-mes', 'Ano-mes']) >= 0;
  const hasQty = findHeader(headers, ['Unidades']) >= 0;
  const hasId = findHeader(headers, ['id', 'Id']) >= 0;
  return hasMonth && hasQty && hasId;
}

export function parseSalesRows(rows: unknown[][]): { id: string; index: number; amount: number; qty: number }[] {
  const grid = normalizeStockGrid(rows);
  if (grid.length < 2) throw new Error('El archivo de ventas está vacío.');
  const headers = grid[0].map((header) => unquote(header));
  const col = {
    id: findHeader(headers, ['id', 'Id']),
    month: findHeader(headers, ['Year-Month', 'Año-mes', 'Ano-mes']),
    amount: findHeader(headers, ['Importe']),
    qty: findHeader(headers, ['Unidades']),
  };
  if (col.id < 0 || col.month < 0 || col.qty < 0) {
    throw new Error('No reconozco ventas. ¿Trae id, Year-Month y Unidades?');
  }
  return grid.slice(1).map((row) => {
    const parsed = parseYearMonth(row[col.month] ?? '');
    return {
      id: (row[col.id] ?? '').trim(),
      index: parsed ? monthIndex(parsed.year, parsed.month) : 0,
      amount: col.amount >= 0 ? parseStockAmount(row[col.amount]) : 0,
      qty: parseStockAmount(row[col.qty]),
    };
  }).filter((row) => row.id !== '' && row.index > 0);
}

export function aggregateProductSales(rows: unknown[][]): Map<string, ProductSales> {
  const parsed = parseSalesRows(rows);
  if (parsed.length === 0) throw new Error('No he podido leer ningún mes de ventas.');
  const maxIndex = parsed.reduce((max, row) => Math.max(max, row.index), 0);
  const start12 = maxIndex - 11;
  const start3 = maxIndex - 2;
  const map = new Map<string, ProductSales>();
  parsed.forEach((row) => {
    if (row.index < start12 || row.index > maxIndex) return;
    const current = map.get(row.id) || { id: row.id, qty12: 0, amount12: 0, qty3: 0 };
    current.qty12 += row.qty;
    current.amount12 += row.amount;
    if (row.index >= start3) current.qty3 += row.qty;
    map.set(row.id, current);
  });
  return map;
}

export function coverDays(stockQty: number, salesQty12: number, periodDays = COVER_YEAR_DAYS): number | null {
  if (stockQty <= 0) return 0;
  if (salesQty12 <= 0) return null;
  return stockQty / (salesQty12 / periodDays);
}

export function formatCoverDays(days: number | null): string {
  if (days === null) return 'Sin venta 12m';
  if (days === 0) return '—';
  return `${days.toLocaleString('de-DE', { maximumFractionDigits: 0 })} días`;
}
