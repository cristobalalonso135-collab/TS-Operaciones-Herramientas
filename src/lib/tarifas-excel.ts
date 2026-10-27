import {
  asProduct,
  formatEuro,
  formatPct,
  fueraPackPrice,
  lineMargin,
  packQty,
  rrpPrice,
  sellPrice,
  type PackLine,
  type TarifaChannel,
  type TarifaProduct,
} from '@/lib/tarifas-model';

export const TARIFAS_HEADERS = [
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
  'B2C PVP adulto',
  'B2C PVP niño',
  'B2C Fee 1',
  'B2C Fee 2',
  'B2C Fee 3',
  'B2C Fee 4',
  'B2C Neto adulto',
  'B2C Neto niño',
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

type SheetRows = Record<string, unknown>[];

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

function cell(map: Map<string, number>, row: unknown[], ...names: string[]): unknown {
  for (const name of names) {
    const index = map.get(name.toLocaleLowerCase('es'));
    if (index != null && row[index] != null && String(row[index]).trim() !== '') return row[index];
  }
  return '';
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

function fromMaestroRow(row: Record<string, unknown>, index: number): TarifaProduct | null {
  const adultRef = textCell(pick(row, 'referencia adulto', 'adult article number'));
  const youthRef = textCell(pick(row, 'referencia niño', 'referencia nino', 'youth article number'));
  const name = textCell(pick(row, 'nombre', 'product name'));
  if (!name && !adultRef && !youthRef) return null;
  return asProduct({
    id: adultRef || youthRef || `row-${index}`,
    adultRef,
    youthRef,
    brand: textCell(pick(row, 'marca', 'brand')),
    productType: textCell(pick(row, 'tipo', 'product type')),
    name,
    colour: textCell(pick(row, 'color', 'colour')),
    colorHex: textCell(pick(row, 'color hex', 'color 1')) || null,
    image: textCell(pick(row, 'url imagen', 'imagen', 'image')) || null,
    sport: textCell(pick(row, 'deporte')),
    gender: textCell(pick(row, 'género', 'genero')),
    kind: textCell(pick(row, 'surtido', 'personalizable')),
    collection: textCell(pick(row, 'colección', 'coleccion')),
    season: textCell(pick(row, 'temporada')),
    novelty: textCell(pick(row, 'novedad')),
    red: isoDate(pick(row, 'vigencia red', 'red')),
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
    b2b: {
      adultRrp: moneyCell(pick(row, 'b2b pvp adulto')),
      youthRrp: moneyCell(pick(row, 'b2b pvp niño', 'b2b pvp nino')),
      adultFee1: moneyCell(pick(row, 'b2b fee 1 adulto', 'adult fee 1')),
      youthFee1: moneyCell(pick(row, 'b2b fee 1 niño', 'b2b fee 1 nino', 'youth fee 1')),
      adultFee2: moneyCell(pick(row, 'b2b fee 2 adulto', 'adult fee 2')),
      youthFee2: moneyCell(pick(row, 'b2b fee 2 niño', 'b2b fee 2 nino', 'youth fee 2')),
      adultFee3: moneyCell(pick(row, 'b2b fee 3 adulto', 'adult fee 3')),
      youthFee3: moneyCell(pick(row, 'b2b fee 3 niño', 'b2b fee 3 nino', 'youth fee 3')),
      adultNet: moneyCell(pick(row, 'b2b neto adulto')),
      youthNet: moneyCell(pick(row, 'b2b neto niño', 'b2b neto nino')),
      discountPct: null,
    },
  });
}

function fromLegacyB2C(row: Record<string, unknown>, trade: Record<string, unknown>, index: number): TarifaProduct | null {
  const adultRef = textCell(pick(row, 'adult article number'));
  const youthRef = textCell(pick(row, 'youth article number'));
  const name = textCell(pick(row, 'product name'));
  if (!name && !adultRef) return null;
  return asProduct({
    id: adultRef || youthRef || `row-${index}`,
    adultRef,
    youthRef,
    brand: textCell(pick(row, 'brand')),
    productType: textCell(pick(row, 'product type')),
    name,
    colour: textCell(pick(row, 'colour')),
    colorHex: textCell(pick(row, 'color 1')) || null,
    image: textCell(pick(row, 'url imagen', 'image')) || null,
    sport: textCell(pick(row, 'deporte', 'sport')),
    gender: textCell(pick(row, 'género', 'genero', 'gender')),
    kind: textCell(pick(row, 'surtido')),
    collection: textCell(pick(row, 'colección', 'coleccion', 'collection')),
    season: textCell(pick(row, 'temporada', 'season')),
    novelty: textCell(pick(row, 'novedad')),
    red: isoDate(pick(row, 'red')),
    b2c: {
      adultRrp: moneyCell(pick(row, 'adult rrp')),
      youthRrp: moneyCell(pick(row, 'youth rrp')),
      fee1: moneyCell(pick(row, 'fee 1')),
      fee2: moneyCell(pick(row, 'fee 2')),
      fee3: moneyCell(pick(row, 'fee 3')),
      fee4: moneyCell(pick(row, 'fee 4')),
      adultNet: moneyCell(pick(row, 'adult net price')),
      youthNet: moneyCell(pick(row, 'youth net price')),
      discountPct: null,
    },
    b2b: {
      adultRrp: moneyCell(pick(trade, 'adult rrp')),
      youthRrp: moneyCell(pick(trade, 'youth rrp')),
      adultFee1: moneyCell(pick(trade, 'adult fee 1', ' adult fee 1')),
      youthFee1: moneyCell(pick(trade, 'youth fee 1')),
      adultFee2: moneyCell(pick(trade, 'adult fee 2')),
      youthFee2: moneyCell(pick(trade, 'youth fee 2')),
      adultFee3: moneyCell(pick(trade, 'adult fee 3')),
      youthFee3: moneyCell(pick(trade, 'youth fee 3')),
      adultNet: moneyCell(pick(trade, 'adult net price')),
      youthNet: moneyCell(pick(trade, 'youth net price')),
      discountPct: null,
    },
  });
}

function isLegacySheet(rows: SheetRows): boolean {
  if (!rows[0]) return false;
  const keys = Object.keys(rows[0]);
  return keys.includes('adult article number') || keys.includes('product name');
}

function isMaestroSheet(rows: SheetRows): boolean {
  if (!rows[0]) return false;
  const keys = Object.keys(rows[0]);
  return keys.includes('referencia adulto') || keys.includes('b2c fee 1');
}

export function parseTarifasSheets(sheets: Record<string, unknown[][]>): TarifaProduct[] {
  const named = Object.entries(sheets).map(([name, data]) => ({ name, rows: aoaToRows(data) }));
  const b2cSheet = named.find((sheet) => /b2c/i.test(sheet.name) && isLegacySheet(sheet.rows));
  const b2bSheet = named.find((sheet) => /b2b/i.test(sheet.name) && isLegacySheet(sheet.rows));
  if (b2cSheet) {
    const trade = new Map<string, Record<string, unknown>>();
    (b2bSheet?.rows || []).forEach((row) => {
      const key = `${textCell(pick(row, 'adult article number'))}|${textCell(pick(row, 'youth article number'))}`;
      trade.set(key, row);
    });
    return b2cSheet.rows
      .map((row, index) => {
        const key = `${textCell(pick(row, 'adult article number'))}|${textCell(pick(row, 'youth article number'))}`;
        return fromLegacyB2C(row, trade.get(key) || {}, index);
      })
      .filter((item): item is TarifaProduct => Boolean(item?.name));
  }
  const maestro = named.find((sheet) => isMaestroSheet(sheet.rows)) || named[0];
  if (!maestro) return [];
  return maestro.rows
    .map((row, index) => fromMaestroRow(row, index))
    .filter((item): item is TarifaProduct => Boolean(item?.name));
}

export function catalogExportRows(products: TarifaProduct[]): unknown[][] {
  return [
    [...TARIFAS_HEADERS],
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
      item.b2c.adultRrp,
      item.b2c.youthRrp,
      item.b2c.fee1,
      item.b2c.fee2,
      item.b2c.fee3,
      item.b2c.fee4,
      item.b2c.adultNet,
      item.b2c.youthNet,
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
    'Cantidad',
    'Precio club',
    'Precio estampac.',
    'Precio fuera pack',
    'PVP',
    'Margen %',
  ];
  const body = lines.map((line, index) => {
    const item = byId.get(line.id);
    const n = packQty(line);
    if (!item) return [index + 1, '', '', '', '', '', n, line.stampInput || line.stamp || 0, '', '', ''];
    return [
      index + 1,
      item.adultRef,
      item.youthRef || '',
      item.productType,
      item.name,
      item.colour,
      n,
      formatEuro(sellPrice(item, channel, line.fee, 'adult'), locale),
      formatEuro(line.stamp || 0, locale),
      formatEuro(fueraPackPrice(item, channel), locale),
      formatEuro(rrpPrice(item, channel, 'adult'), locale),
      formatPct(lineMargin(item, channel, line.fee, 'adult'), locale),
    ];
  });
  return [header, ...body];
}

export function moneyFromInput(value: string): number | null {
  return moneyCell(value);
}
