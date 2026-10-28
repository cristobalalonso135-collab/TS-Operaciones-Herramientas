import {
  asOutletProduct,
  asProduct,
  formatEuro,
  formatPct,
  fueraPackPrice,
  lineAge,
  lineMargin,
  marginPct,
  outletCost,
  rrpPrice,
  sellPrice,
  type OutletLine,
  type PackLine,
  type TarifaB2B,
  type TarifaB2C,
  type TarifaChannel,
  type TarifaProduct,
} from '@/lib/tarifas-model';

export const PRODUCT_HEADERS = [
  'Referencia adulto',
  'Referencia niño',
  'Marca',
  'Tipo',
  'Nombre',
  'Color',
  'Color hex',
  'URL imagen',
  'Deporte',
  'Género',
  'Surtido',
  'Colección',
  'Temporada',
  'Novedad',
  'Vigencia RED',
] as const;

export const B2C_HEADERS = [
  'Referencia adulto',
  'Referencia niño',
  'Nombre',
  'B2C PVP adulto',
  'B2C PVP niño',
  'B2C Fee 1',
  'B2C Fee 2',
  'B2C Fee 3',
  'B2C Fee 4',
  'B2C Neto adulto',
  'B2C Neto niño',
] as const;

export const B2B_HEADERS = [
  'Referencia adulto',
  'Referencia niño',
  'Nombre',
  'B2B PVP adulto',
  'B2B PVP niño',
  'B2B Fee 1 adulto',
  'B2B Fee 1 niño',
  'B2B Fee 2 adulto',
  'B2B Fee 2 niño',
  'B2B Fee 3 adulto',
  'B2B Fee 3 niño',
  'B2B Neto adulto',
  'B2B Neto niño',
] as const;

export const OUTLET_HEADERS = [
  ...PRODUCT_HEADERS,
  'Coste adulto',
  'Coste niño',
  'PVP adulto',
  'PVP niño',
] as const;

export type IngestZone = 'productos' | 'b2c' | 'b2b' | 'outlet';

export interface ChannelPriceRow {
  adultRef: string;
  youthRef: string;
  b2c?: TarifaB2C;
  b2b?: TarifaB2B;
}

export interface TarifasWorkbookParse {
  productos: TarifaProduct[];
  b2c: ChannelPriceRow[];
  b2b: ChannelPriceRow[];
  outlet: TarifaProduct[];
  combined: TarifaProduct[];
}

type SheetRows = Record<string, unknown>[];
type SheetKind = 'productos' | 'b2c' | 'b2b' | 'outlet' | 'combined' | 'legacy-b2c' | 'legacy-b2b' | 'unknown';

function moneyCell(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text || text === '-' || text === '—') return null;
  const n = Number(text.replace(/[€%\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function textCell(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—') return '';
  return text;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = textCell(value);
  if (!text) return null;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);
  return null;
}

function headerMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = String(header || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
    if (key) map.set(key, index);
  });
  return map;
}

function aoaToRows(data: unknown[][]): SheetRows {
  const headerRow = (data.find((row) => row.some((cell) => String(cell || '').trim())) || []) as unknown[];
  const start = data.findIndex((row) => row === headerRow);
  const map = headerMap(headerRow.map((item) => String(item || '')));
  return data.slice(start + 1).map((row) => {
    const out: Record<string, unknown> = {};
    map.forEach((index, key) => {
      out[key] = row[index];
    });
    return out;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
}

function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = name.toLocaleLowerCase('es');
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
    const hit = Object.keys(row).find((item) => item.replace(/\s+/g, ' ').trim() === key);
    if (hit && row[hit] != null && String(row[hit]).trim() !== '') return row[hit];
  }
  return '';
}

function emptyB2c(): TarifaB2C {
  return {
    adultRrp: null,
    youthRrp: null,
    fee1: null,
    fee2: null,
    fee3: null,
    fee4: null,
    adultNet: null,
    youthNet: null,
    discountPct: null,
  };
}

function emptyB2b(): TarifaB2B {
  return {
    adultRrp: null,
    youthRrp: null,
    adultFee1: null,
    youthFee1: null,
    adultFee2: null,
    youthFee2: null,
    adultFee3: null,
    youthFee3: null,
    adultNet: null,
    youthNet: null,
    discountPct: null,
  };
}

function channelHasMoney(channel: TarifaB2C | TarifaB2B): boolean {
  return Object.values(channel).some((value) => typeof value === 'number' && Number.isFinite(value));
}

function productAttrs(row: Record<string, unknown>, index: number) {
  const adultRef = textCell(pick(row, 'referencia adulto', 'adult article number'));
  const youthRef = textCell(pick(row, 'referencia niño', 'referencia nino', 'youth article number'));
  const name = textCell(pick(row, 'nombre', 'product name'));
  return {
    id: adultRef || youthRef || `row-${index}`,
    adultRef,
    youthRef,
    brand: textCell(pick(row, 'marca', 'brand')),
    productType: textCell(pick(row, 'tipo', 'product type')),
    name,
    colour: textCell(pick(row, 'color', 'colour')),
    colorHex: textCell(pick(row, 'color hex', 'color 1')) || null,
    image: textCell(pick(row, 'url imagen', 'imagen', 'image')) || null,
    sport: textCell(pick(row, 'deporte', 'sport')),
    gender: textCell(pick(row, 'género', 'genero', 'gender')),
    kind: textCell(pick(row, 'surtido', 'personalizable')),
    collection: textCell(pick(row, 'colección', 'coleccion', 'collection')),
    season: textCell(pick(row, 'temporada', 'season')),
    novelty: textCell(pick(row, 'novedad')),
    red: isoDate(pick(row, 'vigencia red', 'red')),
  };
}

function fromProductosRow(row: Record<string, unknown>, index: number): TarifaProduct | null {
  const attrs = productAttrs(row, index);
  if (!attrs.name && !attrs.adultRef && !attrs.youthRef) return null;
  return asProduct({ ...attrs, b2c: emptyB2c(), b2b: emptyB2b() });
}

function fromB2CRow(row: Record<string, unknown>): ChannelPriceRow | null {
  const adultRef = textCell(pick(row, 'referencia adulto', 'adult article number'));
  const youthRef = textCell(pick(row, 'referencia niño', 'referencia nino', 'youth article number'));
  if (!adultRef && !youthRef) return null;
  return {
    adultRef,
    youthRef,
    b2c: {
      adultRrp: moneyCell(pick(row, 'b2c pvp adulto', 'adult rrp')),
      youthRrp: moneyCell(pick(row, 'b2c pvp niño', 'b2c pvp nino', 'youth rrp')),
      fee1: moneyCell(pick(row, 'b2c fee 1', 'fee 1')),
      fee2: moneyCell(pick(row, 'b2c fee 2', 'fee 2')),
      fee3: moneyCell(pick(row, 'b2c fee 3', 'fee 3')),
      fee4: moneyCell(pick(row, 'b2c fee 4', 'fee 4')),
      adultNet: moneyCell(pick(row, 'b2c neto adulto', 'adult net price')),
      youthNet: moneyCell(pick(row, 'b2c neto niño', 'b2c neto nino', 'youth net price')),
      discountPct: null,
    },
  };
}

function fromB2BRow(row: Record<string, unknown>): ChannelPriceRow | null {
  const adultRef = textCell(pick(row, 'referencia adulto', 'adult article number'));
  const youthRef = textCell(pick(row, 'referencia niño', 'referencia nino', 'youth article number'));
  if (!adultRef && !youthRef) return null;
  return {
    adultRef,
    youthRef,
    b2b: {
      adultRrp: moneyCell(pick(row, 'b2b pvp adulto', 'adult rrp')),
      youthRrp: moneyCell(pick(row, 'b2b pvp niño', 'b2b pvp nino', 'youth rrp')),
      adultFee1: moneyCell(pick(row, 'b2b fee 1 adulto', 'adult fee 1', ' adult fee 1')),
      youthFee1: moneyCell(pick(row, 'b2b fee 1 niño', 'b2b fee 1 nino', 'youth fee 1')),
      adultFee2: moneyCell(pick(row, 'b2b fee 2 adulto', 'adult fee 2')),
      youthFee2: moneyCell(pick(row, 'b2b fee 2 niño', 'b2b fee 2 nino', 'youth fee 2')),
      adultFee3: moneyCell(pick(row, 'b2b fee 3 adulto', 'adult fee 3')),
      youthFee3: moneyCell(pick(row, 'b2b fee 3 niño', 'b2b fee 3 nino', 'youth fee 3')),
      adultNet: moneyCell(pick(row, 'b2b neto adulto', 'adult net price')),
      youthNet: moneyCell(pick(row, 'b2b neto niño', 'b2b neto nino', 'youth net price')),
      discountPct: null,
    },
  };
}

function fromMaestroRow(row: Record<string, unknown>, index: number): TarifaProduct | null {
  const attrs = productAttrs(row, index);
  if (!attrs.name && !attrs.adultRef && !attrs.youthRef) return null;
  return asProduct({
    ...attrs,
    b2c: fromB2CRow(row)?.b2c || emptyB2c(),
    b2b: fromB2BRow(row)?.b2b || emptyB2b(),
  });
}

function fromOutletRow(row: Record<string, unknown>, index: number): TarifaProduct | null {
  const product = fromProductosRow(row, index);
  if (!product) return null;
  const adultNet = moneyCell(pick(row, 'coste adulto', 'b2c neto adulto', 'adult net price'));
  const youthNet = moneyCell(pick(row, 'coste niño', 'coste nino', 'b2c neto niño', 'b2c neto nino', 'youth net price'));
  const adultRrp = moneyCell(pick(row, 'pvp adulto', 'b2c pvp adulto', 'adult rrp'));
  const youthRrp = moneyCell(pick(row, 'pvp niño', 'pvp nino', 'b2c pvp niño', 'b2c pvp nino', 'youth rrp'));
  return asOutletProduct({
    ...product,
    b2c: { ...emptyB2c(), adultNet, youthNet, adultRrp, youthRrp },
    b2b: emptyB2b(),
  });
}

function fromLegacyB2C(row: Record<string, unknown>, trade: Record<string, unknown>, index: number): TarifaProduct | null {
  const product = fromMaestroRow({ ...trade, ...row }, index);
  return product;
}

function isLegacySheet(rows: SheetRows): boolean {
  if (!rows[0]) return false;
  const keys = Object.keys(rows[0]);
  return keys.includes('adult article number') || keys.includes('product name');
}

function classifySheet(name: string, rows: SheetRows): SheetKind {
  const n = name.trim().toLocaleLowerCase('es');
  const keys = Object.keys(rows[0] || {});
  if (/outlet/.test(n)) return 'outlet';
  if (/producto/.test(n) || /atribut/.test(n)) return 'productos';
  if (/(^|[^a-z])b2c([^a-z]|$)/i.test(n) || n === 'b2c') {
    return isLegacySheet(rows) ? 'legacy-b2c' : 'b2c';
  }
  if (/(^|[^a-z])b2b([^a-z]|$)/i.test(n) || n === 'b2b') {
    return isLegacySheet(rows) ? 'legacy-b2b' : 'b2b';
  }
  if (keys.includes('coste adulto') || keys.includes('coste niño') || keys.includes('coste nino')) return 'outlet';
  if (keys.includes('marca') && (keys.includes('b2c fee 1') || keys.includes('b2b fee 1 adulto') || keys.includes('b2b pvp adulto'))) {
    return 'combined';
  }
  if (keys.includes('b2c fee 1') || keys.includes('b2c pvp adulto') || keys.includes('b2c neto adulto')) return 'b2c';
  if (keys.includes('b2b fee 1 adulto') || keys.includes('b2b pvp adulto') || keys.includes('b2b neto adulto')) return 'b2b';
  if (keys.includes('marca') || keys.includes('deporte') || keys.includes('surtido')) return 'productos';
  if (isLegacySheet(rows)) return 'legacy-b2c';
  return 'unknown';
}

function compact<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => Boolean(item));
}

export function refsMatch(
  item: Pick<TarifaProduct, 'adultRef' | 'youthRef'>,
  row: { adultRef: string; youthRef: string },
): boolean {
  if (row.adultRef && item.adultRef && row.adultRef === item.adultRef) return true;
  if (row.youthRef && item.youthRef && row.youthRef === item.youthRef) return true;
  return false;
}

export function overlayChannelPrices(
  products: TarifaProduct[],
  rows: ChannelPriceRow[],
  channel: 'b2c' | 'b2b',
): { products: TarifaProduct[]; applied: number; missing: number } {
  if (!rows.length) return { products, applied: 0, missing: 0 };
  const next = products.slice();
  let applied = 0;
  let missing = 0;
  rows.forEach((row) => {
    const index = next.findIndex((item) => refsMatch(item, row));
    if (index < 0) {
      missing += 1;
      return;
    }
    const current = next[index];
    if (channel === 'b2c' && row.b2c) next[index] = { ...current, b2c: row.b2c };
    if (channel === 'b2b' && row.b2b) next[index] = { ...current, b2b: row.b2b };
    applied += 1;
  });
  return { products: next, applied, missing };
}

export function mergeKeptPrices(incoming: TarifaProduct[], existing: TarifaProduct[]): TarifaProduct[] {
  return incoming.map((item) => {
    const prev = existing.find((row) => refsMatch(row, item));
    return {
      ...item,
      id: prev?.id || item.id,
      image: item.image || prev?.image || null,
      b2c: channelHasMoney(item.b2c) ? item.b2c : prev?.b2c || item.b2c,
      b2b: channelHasMoney(item.b2b) ? item.b2b : prev?.b2b || item.b2b,
    };
  });
}

export function parseTarifasWorkbook(sheets: Record<string, unknown[][]>): TarifasWorkbookParse {
  const named = Object.entries(sheets).map(([name, data]) => {
    const rows = aoaToRows(data);
    return { name, rows, kind: classifySheet(name, rows) };
  });

  const productos = named.filter((sheet) => sheet.kind === 'productos').flatMap((sheet) => (
    compact(sheet.rows.map((row, index) => fromProductosRow(row, index)))
  ));
  const b2c = named.filter((sheet) => sheet.kind === 'b2c').flatMap((sheet) => (
    compact(sheet.rows.map((row) => fromB2CRow(row)))
  ));
  const b2b = named.filter((sheet) => sheet.kind === 'b2b').flatMap((sheet) => (
    compact(sheet.rows.map((row) => fromB2BRow(row)))
  ));
  const outlet = named.filter((sheet) => sheet.kind === 'outlet').flatMap((sheet) => (
    compact(sheet.rows.map((row, index) => fromOutletRow(row, index)))
  ));
  const combined = named.filter((sheet) => sheet.kind === 'combined').flatMap((sheet) => (
    compact(sheet.rows.map((row, index) => fromMaestroRow(row, index)))
  ));

  const legacyB2c = named.find((sheet) => sheet.kind === 'legacy-b2c');
  const legacyB2b = named.find((sheet) => sheet.kind === 'legacy-b2b');
  if (legacyB2c) {
    const trade = new Map<string, Record<string, unknown>>();
    (legacyB2b?.rows || []).forEach((row) => {
      const key = `${textCell(pick(row, 'adult article number'))}|${textCell(pick(row, 'youth article number'))}`;
      trade.set(key, row);
    });
    const legacy = compact(legacyB2c.rows.map((row, index) => {
      const key = `${textCell(pick(row, 'adult article number'))}|${textCell(pick(row, 'youth article number'))}`;
      return fromLegacyB2C(row, trade.get(key) || {}, index);
    }));
    return {
      productos,
      b2c: b2c.length ? b2c : legacy.map((item) => ({ adultRef: item.adultRef, youthRef: item.youthRef, b2c: item.b2c })),
      b2b: b2b.length ? b2b : legacy.map((item) => ({ adultRef: item.adultRef, youthRef: item.youthRef, b2b: item.b2b })),
      outlet,
      combined: combined.length ? combined : legacy,
    };
  }

  return { productos, b2c, b2b, outlet, combined };
}

export function parseTarifasSheets(sheets: Record<string, unknown[][]>): TarifaProduct[] {
  const parsed = parseTarifasWorkbook(sheets);
  if (parsed.combined.length) return parsed.combined.filter((item) => item.name);
  if (!parsed.productos.length) return [];
  let next = parsed.productos;
  if (parsed.b2c.length) next = overlayChannelPrices(next, parsed.b2c, 'b2c').products;
  if (parsed.b2b.length) next = overlayChannelPrices(next, parsed.b2b, 'b2b').products;
  return next.filter((item) => item.name);
}

export function productExportRows(products: TarifaProduct[]): unknown[][] {
  return [
    [...PRODUCT_HEADERS],
    ...products.map((item) => [
      item.adultRef,
      item.youthRef,
      item.brand,
      item.productType,
      item.name,
      item.colour,
      item.colorHex || '',
      item.image || '',
      item.sport,
      item.gender,
      item.kind,
      item.collection,
      item.season,
      item.novelty,
      item.red || '',
    ]),
  ];
}

export function b2cExportRows(products: TarifaProduct[]): unknown[][] {
  return [
    [...B2C_HEADERS],
    ...products.map((item) => [
      item.adultRef,
      item.youthRef,
      item.name,
      item.b2c.adultRrp,
      item.b2c.youthRrp,
      item.b2c.fee1,
      item.b2c.fee2,
      item.b2c.fee3,
      item.b2c.fee4,
      item.b2c.adultNet,
      item.b2c.youthNet,
    ]),
  ];
}

export function b2bExportRows(products: TarifaProduct[]): unknown[][] {
  return [
    [...B2B_HEADERS],
    ...products.map((item) => [
      item.adultRef,
      item.youthRef,
      item.name,
      item.b2b.adultRrp,
      item.b2b.youthRrp,
      item.b2b.adultFee1,
      item.b2b.youthFee1,
      item.b2b.adultFee2,
      item.b2b.youthFee2,
      item.b2b.adultFee3,
      item.b2b.youthFee3,
      item.b2b.adultNet,
      item.b2b.youthNet,
    ]),
  ];
}

export function outletExportRows(products: TarifaProduct[]): unknown[][] {
  return [
    [...OUTLET_HEADERS],
    ...products.map((item) => [
      item.adultRef,
      item.youthRef,
      item.brand,
      item.productType,
      item.name,
      item.colour,
      item.colorHex || '',
      item.image || '',
      item.sport,
      item.gender,
      item.kind,
      item.collection,
      item.season,
      item.novelty,
      item.red || '',
      item.b2c.adultNet,
      item.b2c.youthNet,
      item.b2c.adultRrp,
      item.b2c.youthRrp,
    ]),
  ];
}

export function packExportRows(
  products: TarifaProduct[],
  lines: PackLine[],
  channel: TarifaChannel,
  headers?: string[],
  locale = 'es-ES',
): unknown[][] {
  const byId = new Map(products.map((item) => [item.id, item]));
  const header = headers || [
    'Número',
    'Referencia adulto',
    'Referencia niño',
    'Producto',
    'Nombre',
    'Color',
    'Precio club',
    'Precio estampac.',
    'Precio fuera pack',
    'PVP',
    'Margen %',
  ];
  const body = lines.map((line, index) => {
    const item = byId.get(line.id);
    if (!item) return [index + 1, '', '', '', '', '', '', line.stampInput || line.stamp || 0, '', '', ''];
    const age = lineAge(line);
    return [
      index + 1,
      age === 'adult' ? item.adultRef : '',
      age === 'youth' ? item.youthRef || '' : '',
      item.productType,
      item.name,
      item.colour,
      formatEuro(sellPrice(item, channel, line.fee, age), locale),
      formatEuro(line.stamp || 0, locale),
      formatEuro(fueraPackPrice(item, channel), locale),
      formatEuro(rrpPrice(item, channel, age), locale),
      formatPct(lineMargin(item, channel, line.fee, age), locale),
    ];
  });
  return [header, ...body];
}

export function outletQuoteExportRows(
  products: TarifaProduct[],
  lines: OutletLine[],
  headers?: string[],
  locale = 'es-ES',
): unknown[][] {
  const byId = new Map(products.map((item) => [item.id, item]));
  const header = headers || [
    'Número',
    'Referencia',
    'Producto',
    'Nombre',
    'Color',
    'Coste',
    'Precio',
    'Margen %',
  ];
  const body = lines.map((line, index) => {
    const item = byId.get(line.id);
    if (!item) return [index + 1, '', '', '', '', '', line.priceInput || line.price || 0, ''];
    const age = lineAge(line);
    const cost = outletCost(item, age);
    return [
      index + 1,
      age === 'youth' ? item.youthRef || item.adultRef : item.adultRef || item.youthRef,
      item.productType,
      item.name,
      item.colour,
      formatEuro(cost, locale),
      formatEuro(line.price, locale),
      formatPct(marginPct(line.price, cost), locale),
    ];
  });
  return [header, ...body];
}

export function moneyFromInput(value: string): number | null {
  return moneyCell(value);
}
