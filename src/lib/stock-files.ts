export interface StockLine {
  key: string;
  id: string;
  referencia: string;
  producto: string;
  marca: string;
  talla: string;
  situacion: string;
  year: number | null;
  temp: string;
  carryover: boolean;
  categoria: string;
  familia: string;
  grupo: string;
  almacen: string;
  qty: number;
  transit: number;
  reserved: number;
  available: number;
  unitCost: number;
  cost: number;
  pvp: number;
  clearance: number;
  saleStart: Date | null;
  saleEnd: Date | null;
  insertedAt: Date | null;
  firstBuy: Date | null;
  lastBuy: Date | null;
  firstSale: Date | null;
  lastSale: Date | null;
  asOf: Date | null;
}

export interface StockMovement {
  id: string;
  referencia: string;
  talla: string;
  firstBuy: Date | null;
  lastBuy: Date | null;
  firstSale: Date | null;
  lastSale: Date | null;
}

export interface StockSnapshot {
  weekKey: string;
  weekLabel: string;
  savedAt: string;
  fileName: string;
  lines: number;
  qty: number;
  cost: number;
  pvp: number;
  skus: number;
  extinguirCost: number;
  expiredCost: number;
  oldSeasonCost: number;
  clearanceCost: number;
  noSaleCost: number;
  staleCost: number;
  withLastSale: number;
}

export const STOCK_SNAPSHOT_STORAGE = 'stock-weekly-snapshots';
const MAX_SNAPSHOTS = 52;

function cellPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).replace(/\u00a0/g, ' ').trim() !== '';
}

export function parseStockAmount(value: unknown): number {
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

function unquote(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

function asValidDate(date: Date): Date | null {
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < 1990 || year > 2100) return null;
  return date;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return asValidDate(value);
  if (typeof value === 'number' && Number.isFinite(value) && value > 30000 && value < 60000) {
    return asValidDate(new Date(Math.round((value - 25569) * 86400 * 1000)));
  }
  if (!cellPresent(value)) return null;
  const raw = unquote(String(value));
  if (/^\d{5}(\.\d+)?$/.test(raw)) return parseDate(Number(raw));
  const euro = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (euro) {
    const day = Number(euro[1]);
    const month = Number(euro[2]);
    const year = Number(euro[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return asValidDate(new Date(year, month - 1, day));
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return asValidDate(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function yes(value: string): boolean {
  const n = value.trim().toLowerCase();
  return n === 'si' || n === 'sí' || n === 'yes' || n === 'true';
}

export function normalizeStockGrid(rows: unknown[][]): string[][] {
  if (rows.length === 0) return [];
  const first = rows[0] ?? [];
  if (first.length <= 2 && String(first[0] ?? '').includes(';')) {
    return rows
      .map((row) => String(row[0] ?? '').split(';').map(unquote))
      .filter((row) => row.some((cell) => cellPresent(cell)));
  }
  return rows
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())))
    .filter((row) => row.some((cell) => cellPresent(cell)));
}

function findHeader(headers: string[], aliases: string[]): number {
  const exact = headers.findIndex((header) => aliases.some((alias) => header === alias));
  if (exact >= 0) return exact;
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

export function parseStockRows(rows: unknown[][]): StockLine[] {
  const grid = normalizeStockGrid(rows);
  if (grid.length < 2) throw new Error('El archivo de stock está vacío.');
  const headers = grid[0].map((header) => unquote(header).replace(/^\*+\s*/, '').trim());
  const col = {
    id: findHeader(headers, ['Id']),
    asOf: findHeader(headers, ['Fecha stock']),
    referencia: findHeader(headers, ['Referencia']),
    producto: findHeader(headers, ['Producto']),
    marca: findHeader(headers, ['Marca']),
    talla: findHeader(headers, ['Talla']),
    situacion: findHeader(headers, ['Situación', 'Situacion']),
    year: findHeader(headers, ['Año', 'Ano']),
    temp: findHeader(headers, ['Temp.']),
    carryover: findHeader(headers, ['Carryover']),
    categoria: findHeader(headers, ['Categoría', 'Categoria']),
    familia: findHeader(headers, ['Familia']),
    grupo: findHeader(headers, ['Grupo']),
    almacen: findHeader(headers, ['Almacén', 'Almacen']),
    qty: findHeader(headers, ['Cantidad']),
    transit: findHeader(headers, ['Tránsito', 'Transito']),
    reserved: findHeader(headers, ['Stock reservado']),
    available: findHeader(headers, ['Stock Disponible']),
    unitCost: findHeader(headers, ['Coste medio unitario']),
    cost: findHeader(headers, ['Coste medio total']),
    pvp: findHeader(headers, ['Precio actual total']),
    clearance: findHeader(headers, ['Dto. clearance']),
    saleStart: findHeader(headers, ['Fecha inicio venta']),
    saleEnd: findHeader(headers, ['Fecha fin venta']),
    insertedAt: findHeader(headers, ['Fecha inserción', 'Fecha insercion']),
    firstBuy: findHeader(headers, ['Primera compra']),
    lastBuy: findHeader(headers, ['Última compra', 'Ultima compra']),
    firstSale: findHeader(headers, ['Primera venta']),
    lastSale: findHeader(headers, ['Última venta', 'Ultima venta']),
  };
  if (col.referencia < 0 || col.qty < 0) {
    throw new Error('No reconozco el archivo. ¿Trae Referencia y Cantidad?');
  }

  return grid.slice(1).map((row, index) => {
    const yearRaw = col.year >= 0 ? parseStockAmount(row[col.year]) : 0;
    const year = yearRaw >= 1990 && yearRaw <= 2100 ? Math.round(yearRaw) : null;
    const referencia = col.referencia >= 0 ? row[col.referencia] ?? '' : '';
    const talla = col.talla >= 0 ? row[col.talla] ?? '' : '';
    const id = col.id >= 0 ? row[col.id] ?? '' : '';
    return {
      key: `${index}|${id}|${referencia}|${talla}`,
      id,
      referencia,
      producto: col.producto >= 0 ? row[col.producto] ?? '' : '',
      marca: col.marca >= 0 ? row[col.marca] ?? '' : '',
      talla,
      situacion: col.situacion >= 0 ? row[col.situacion] ?? '' : '',
      year,
      temp: col.temp >= 0 ? row[col.temp] ?? '' : '',
      carryover: col.carryover >= 0 ? yes(row[col.carryover] ?? '') : false,
      categoria: col.categoria >= 0 ? row[col.categoria] ?? '' : '',
      familia: col.familia >= 0 ? row[col.familia] ?? '' : '',
      grupo: col.grupo >= 0 ? row[col.grupo] ?? '' : '',
      almacen: col.almacen >= 0 ? row[col.almacen] ?? '' : '',
      qty: parseStockAmount(row[col.qty]),
      transit: col.transit >= 0 ? parseStockAmount(row[col.transit]) : 0,
      reserved: col.reserved >= 0 ? parseStockAmount(row[col.reserved]) : 0,
      available: col.available >= 0 ? parseStockAmount(row[col.available]) : 0,
      unitCost: col.unitCost >= 0 ? parseStockAmount(row[col.unitCost]) : 0,
      cost: col.cost >= 0 ? parseStockAmount(row[col.cost]) : 0,
      pvp: col.pvp >= 0 ? parseStockAmount(row[col.pvp]) : 0,
      clearance: col.clearance >= 0 ? parseStockAmount(row[col.clearance]) : 0,
      saleStart: col.saleStart >= 0 ? parseDate(row[col.saleStart]) : null,
      saleEnd: col.saleEnd >= 0 ? parseDate(row[col.saleEnd]) : null,
      insertedAt: col.insertedAt >= 0 ? parseDate(row[col.insertedAt]) : null,
      firstBuy: col.firstBuy >= 0 ? parseDate(row[col.firstBuy]) : null,
      lastBuy: col.lastBuy >= 0 ? parseDate(row[col.lastBuy]) : null,
      firstSale: col.firstSale >= 0 ? parseDate(row[col.firstSale]) : null,
      lastSale: col.lastSale >= 0 ? parseDate(row[col.lastSale]) : null,
      asOf: col.asOf >= 0 ? parseDate(row[col.asOf]) : null,
    };
  }).filter((line) => line.referencia !== '' || line.qty !== 0 || line.cost !== 0);
}

function headerList(rows: unknown[][]): string[] {
  const grid = normalizeStockGrid(rows);
  if (grid.length === 0) return [];
  return grid[0].map((header) => unquote(header).replace(/^\*+\s*/, '').trim());
}

export function isStockMovementFile(rows: unknown[][]): boolean {
  const headers = headerList(rows);
  const hasKey = findHeader(headers, ['Id']) >= 0 || findHeader(headers, ['Referencia']) >= 0;
  const hasDates = findHeader(headers, ['Primera compra']) >= 0
    || findHeader(headers, ['Última compra', 'Ultima compra']) >= 0
    || findHeader(headers, ['Primera venta']) >= 0
    || findHeader(headers, ['Última venta', 'Ultima venta']) >= 0;
  const hasQty = findHeader(headers, ['Cantidad']) >= 0;
  const hasCost = findHeader(headers, ['Coste medio total']) >= 0;
  return hasKey && hasDates && !hasQty && !hasCost;
}

export function parseStockMovements(rows: unknown[][]): StockMovement[] {
  const grid = normalizeStockGrid(rows);
  if (grid.length < 2) throw new Error('El archivo de movimientos está vacío.');
  const headers = grid[0].map((header) => unquote(header).replace(/^\*+\s*/, '').trim());
  const col = {
    id: findHeader(headers, ['Id']),
    referencia: findHeader(headers, ['Referencia']),
    talla: findHeader(headers, ['Talla']),
    firstBuy: findHeader(headers, ['Primera compra']),
    lastBuy: findHeader(headers, ['Última compra', 'Ultima compra']),
    firstSale: findHeader(headers, ['Primera venta']),
    lastSale: findHeader(headers, ['Última venta', 'Ultima venta']),
  };
  if (col.id < 0 && col.referencia < 0) {
    throw new Error('No reconozco los movimientos. ¿Trae Id o Referencia?');
  }
  if (col.firstBuy < 0 && col.lastBuy < 0 && col.firstSale < 0 && col.lastSale < 0) {
    throw new Error('No veo Primera/Última compra ni Primera/Última venta.');
  }
  return grid.slice(1).map((row) => ({
    id: col.id >= 0 ? row[col.id] ?? '' : '',
    referencia: col.referencia >= 0 ? row[col.referencia] ?? '' : '',
    talla: col.talla >= 0 ? row[col.talla] ?? '' : '',
    firstBuy: col.firstBuy >= 0 ? parseDate(row[col.firstBuy]) : null,
    lastBuy: col.lastBuy >= 0 ? parseDate(row[col.lastBuy]) : null,
    firstSale: col.firstSale >= 0 ? parseDate(row[col.firstSale]) : null,
    lastSale: col.lastSale >= 0 ? parseDate(row[col.lastSale]) : null,
  })).filter((row) => row.id !== '' || row.referencia !== '');
}

export function mergeStockMovements(lines: StockLine[], movements: StockMovement[]): StockLine[] {
  if (movements.length === 0) return lines;
  const byIdTalla = new Map<string, StockMovement>();
  const byRefTalla = new Map<string, StockMovement>();
  const byId = new Map<string, StockMovement>();
  const byRef = new Map<string, StockMovement>();
  movements.forEach((row) => {
    if (row.id && row.talla) byIdTalla.set(`${row.id}|${row.talla}`, row);
    if (row.referencia && row.talla) byRefTalla.set(`${row.referencia}|${row.talla}`, row);
    if (row.id && !row.talla) byId.set(row.id, row);
    if (row.referencia && !row.talla) byRef.set(row.referencia, row);
  });
  return lines.map((line) => {
    const hit = (line.id && line.talla ? byIdTalla.get(`${line.id}|${line.talla}`) : undefined)
      || (line.referencia && line.talla ? byRefTalla.get(`${line.referencia}|${line.talla}`) : undefined)
      || (line.id ? byId.get(line.id) : undefined)
      || (line.referencia ? byRef.get(line.referencia) : undefined);
    if (!hit) return line;
    return {
      ...line,
      firstBuy: hit.firstBuy,
      lastBuy: hit.lastBuy,
      firstSale: hit.firstSale,
      lastSale: hit.lastSale,
    };
  });
}

export function isExtinguir(situacion: string): boolean {
  return /extinguir/i.test(situacion);
}

export function isExpired(line: StockLine, today = new Date()): boolean {
  if (!line.saleEnd) return false;
  return line.saleEnd.getTime() < today.getTime();
}

export function isOldSeason(line: StockLine, currentYear = new Date().getFullYear()): boolean {
  if (line.year === null) return false;
  return line.year <= currentYear - 2;
}

export function stockAsOf(lines: StockLine[], fallback = new Date()): Date {
  const hit = lines.find((line) => line.asOf);
  return hit?.asOf ?? fallback;
}

export const STALE_SALE_DAYS = 180;

export function daysSince(date: Date | null, today = new Date()): number | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / 86_400_000));
}

export function stockHasSaleDates(lines: StockLine[]): boolean {
  return lines.some((line) => line.lastSale != null || line.firstSale != null);
}

export function isNeverSold(line: StockLine): boolean {
  return line.lastSale === null && line.firstSale === null && line.qty > 0;
}

export function isStale(line: StockLine, today = new Date(), days = STALE_SALE_DAYS): boolean {
  const age = daysSince(line.lastSale, today);
  return age !== null && age >= days;
}

export function isoWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isoWeekLabel(weekKey: string, savedAt: string): string {
  const date = new Date(savedAt);
  const day = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  return `Sem ${weekKey.slice(-2)} · ${day}`;
}

export function buildStockSnapshot(lines: StockLine[], fileName: string, now = new Date()): StockSnapshot {
  const today = now;
  const year = today.getFullYear();
  const weekKey = isoWeekKey(today);
  let qty = 0;
  let cost = 0;
  let pvp = 0;
  let extinguirCost = 0;
  let expiredCost = 0;
  let oldSeasonCost = 0;
  let clearanceCost = 0;
  let noSaleCost = 0;
  let staleCost = 0;
  let withLastSale = 0;
  const hasSaleDates = stockHasSaleDates(lines);
  const skus = new Set<string>();
  lines.forEach((line) => {
    qty += line.qty;
    cost += line.cost;
    pvp += line.pvp;
    skus.add(`${line.referencia}|${line.talla}`);
    if (isExtinguir(line.situacion)) extinguirCost += line.cost;
    if (isExpired(line, today)) expiredCost += line.cost;
    if (isOldSeason(line, year)) oldSeasonCost += line.cost;
    if (line.clearance > 0) clearanceCost += line.cost;
    if (line.lastSale) withLastSale += 1;
    if (hasSaleDates && isNeverSold(line)) noSaleCost += line.cost;
    if (isStale(line, today)) staleCost += line.cost;
  });
  return {
    weekKey,
    weekLabel: isoWeekLabel(weekKey, today.toISOString()),
    savedAt: today.toISOString(),
    fileName,
    lines: lines.length,
    qty,
    cost,
    pvp,
    skus: skus.size,
    extinguirCost,
    expiredCost,
    oldSeasonCost,
    clearanceCost,
    noSaleCost,
    staleCost,
    withLastSale,
  };
}

function isSnapshot(value: unknown): value is StockSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<StockSnapshot>;
  return typeof row.weekKey === 'string' && typeof row.cost === 'number';
}

export function parseStockSnapshots(raw: string | null): StockSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).sort((a, b) => b.weekKey.localeCompare(a.weekKey) || b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

export function upsertStockSnapshot(list: StockSnapshot[], next: StockSnapshot): StockSnapshot[] {
  return [next, ...list.filter((row) => row.weekKey !== next.weekKey)].sort(
    (a, b) => b.weekKey.localeCompare(a.weekKey) || b.savedAt.localeCompare(a.savedAt),
  ).slice(0, MAX_SNAPSHOTS);
}
