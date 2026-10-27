import { ageKind, newId, type TarifaProduct } from '@/lib/tarifas-model';

export type ReservaBand = 'adult' | 'youth' | 'onesize';
export type ReservaCurveKind = 'sku' | 'family' | 'template';

export const SKU_CURVE_MIN = 80;
export const FAMILY_CURVE_MIN = 30;

export interface SizeGrid {
  id: string;
  brand: string;
  productType: string;
  band: ReservaBand;
  sizes: string[];
}

export interface ReservaSale {
  ref: string;
  size: string;
  qty: number;
  brand: string;
  productType: string;
}

export interface CurvePart {
  size: string;
  weight: number;
}

export interface SizeCurve {
  key: string;
  kind: ReservaCurveKind;
  brand: string;
  productType: string;
  band: ReservaBand;
  ref: string;
  sizes: CurvePart[];
  units: number;
}

export interface ReservaSizeCell {
  ref: string;
  size: string;
  qty: number;
  locked: boolean;
}

export interface ReservaLine {
  id: string;
  adultQty: number;
  youthQty: number;
  onesizeQty: number;
  adultSizes: ReservaSizeCell[];
  youthSizes: ReservaSizeCell[];
  onesizeSizes: ReservaSizeCell[];
}

export interface ReservasCatalog {
  grids: SizeGrid[];
  onesizeTypes: string[];
  sales: ReservaSale[];
  templates: SizeCurve[];
}

export function emptyReservasCatalog(): ReservasCatalog {
  return { grids: [], onesizeTypes: [], sales: [], templates: [] };
}

export function asReservasCatalog(value: unknown): ReservasCatalog {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<ReservasCatalog>;
  const grids = Array.isArray(row.grids) ? row.grids.map(asGrid).filter((item) => item.brand || item.productType) : [];
  const onesizeTypes = Array.isArray(row.onesizeTypes)
    ? Array.from(new Set(row.onesizeTypes.map((item) => String(item || '').trim()).filter(Boolean)))
    : [];
  const sales = Array.isArray(row.sales) ? row.sales.map(asSale).filter((item) => item.ref && item.size && item.qty > 0) : [];
  const templates = Array.isArray(row.templates) ? row.templates.map(asTemplate).filter((item) => item.sizes.length > 0) : [];
  return { grids, onesizeTypes, sales, templates };
}

function asGrid(value: unknown): SizeGrid {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<SizeGrid>;
  const band: ReservaBand = row.band === 'youth' || row.band === 'onesize' ? row.band : 'adult';
  const sizes = Array.isArray(row.sizes)
    ? uniqueSizes(row.sizes.map((item) => String(item || '').trim()).filter(Boolean), band)
    : [];
  return {
    id: String(row.id || newId('grid')),
    brand: String(row.brand || '').trim(),
    productType: String(row.productType || '').trim(),
    band,
    sizes,
  };
}

function asSale(value: unknown): ReservaSale {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<ReservaSale>;
  const qty = Number(row.qty);
  return {
    ref: String(row.ref || '').trim(),
    size: String(row.size || '').trim(),
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    brand: String(row.brand || '').trim(),
    productType: String(row.productType || '').trim(),
  };
}

function asTemplate(value: unknown): SizeCurve {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<SizeCurve>;
  const band: ReservaBand = row.band === 'youth' || row.band === 'onesize' ? row.band : 'adult';
  const sizes = Array.isArray(row.sizes)
    ? row.sizes.map((part) => ({
      size: String((part as CurvePart)?.size || '').trim(),
      weight: Number((part as CurvePart)?.weight) || 0,
    })).filter((part) => part.size)
    : [];
  const total = sizes.reduce((sum, part) => sum + part.weight, 0);
  return {
    key: familyCurveKey(String(row.brand || ''), String(row.productType || ''), band),
    kind: 'template',
    brand: String(row.brand || '').trim(),
    productType: String(row.productType || '').trim(),
    band,
    ref: '',
    sizes: total > 0 ? sizes.map((part) => ({ ...part, weight: part.weight / total })) : sizes,
    units: Number(row.units) || 0,
  };
}

export function familyCurveKey(brand: string, productType: string, band: ReservaBand): string {
  return `${norm(brand)}|${norm(productType)}|${band}`;
}

export function gridKey(grid: Pick<SizeGrid, 'brand' | 'productType' | 'band'>): string {
  return familyCurveKey(grid.brand, grid.productType, grid.band);
}

function norm(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function uniqueSizes(sizes: string[], band: ReservaBand): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  sizes.forEach((size) => {
    const key = norm(size);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(size);
  });
  return sortSizes(out, band);
}

export function sortSizes(sizes: string[], band: ReservaBand): string[] {
  const adult = ['3xs', 'xxxs', 'xxs', '2xs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', '5xl'];
  return sizes.slice().sort((a, b) => {
    const na = Number(String(a).replace(',', '.'));
    const nb = Number(String(b).replace(',', '.'));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (band !== 'youth') {
      const ia = adult.indexOf(norm(a));
      const ib = adult.indexOf(norm(b));
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }
    return a.localeCompare(b, 'es', { numeric: true });
  });
}

export function isOnesizeType(productType: string, onesizeTypes: string[]): boolean {
  const key = norm(productType);
  return onesizeTypes.some((item) => norm(item) === key);
}

export function classifySize(size: string): ReservaBand | 'unknown' {
  const text = size.trim().toLocaleLowerCase('es');
  if (!text) return 'unknown';
  if (/^(uni|única|unica|unique|os|one\s*size|talla\s*única|talla\s*unica|tu)$/i.test(text)) return 'onesize';
  if (/(niñ[oa]|youth|\bjr\b|jnr|junior|cdo|infantil)/i.test(text)) return 'youth';
  const height = Number(text.replace(',', '.'));
  if (Number.isFinite(height) && height >= 116 && height <= 176) return 'youth';
  if (/^(3xs|xxxs|xxs|2xs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)(\b|$)/i.test(text)) return 'adult';
  return 'unknown';
}

export function emptyReservaLine(id: string): ReservaLine {
  return {
    id,
    adultQty: 0,
    youthQty: 0,
    onesizeQty: 0,
    adultSizes: [],
    youthSizes: [],
    onesizeSizes: [],
  };
}

export function largestRemainder(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safe = Math.max(0, Math.round(total));
  const sum = weights.reduce((acc, value) => acc + Math.max(0, value), 0);
  if (safe === 0) return weights.map(() => 0);
  if (sum <= 0) {
    const base = Math.floor(safe / n);
    const extra = safe - base * n;
    return weights.map((_, index) => base + (index < extra ? 1 : 0));
  }
  const raw = weights.map((value) => (Math.max(0, value) / sum) * safe);
  const rounded = raw.map((value) => Math.floor(value));
  let left = safe - rounded.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  let cursor = 0;
  while (left > 0 && order.length) {
    rounded[order[cursor % order.length].index] += 1;
    left -= 1;
    cursor += 1;
  }
  return rounded;
}

function indexProducts(products: TarifaProduct[]) {
  const adult = new Map<string, TarifaProduct>();
  const youth = new Map<string, TarifaProduct>();
  products.forEach((item) => {
    if (item.adultRef) adult.set(item.adultRef, item);
    if (item.youthRef) youth.set(item.youthRef, item);
  });
  return { adult, youth };
}

export function enrichSales(sales: ReservaSale[], products: TarifaProduct[]): ReservaSale[] {
  const { adult, youth } = indexProducts(products);
  return sales.map((sale) => {
    const hit = adult.get(sale.ref) || youth.get(sale.ref);
    return {
      ...sale,
      brand: sale.brand || hit?.brand || '',
      productType: sale.productType || hit?.productType || '',
    };
  });
}

function bandForSale(sale: ReservaSale, products: TarifaProduct[]): ReservaBand | null {
  const { adult, youth } = indexProducts(products);
  if (youth.has(sale.ref) && !adult.has(sale.ref)) return 'youth';
  if (adult.has(sale.ref) && !youth.has(sale.ref)) return classifySize(sale.size) === 'onesize' ? 'onesize' : 'adult';
  if (adult.has(sale.ref) && youth.has(sale.ref)) {
    const classified = classifySize(sale.size);
    if (classified !== 'unknown') return classified;
    return 'adult';
  }
  const classified = classifySize(sale.size);
  return classified === 'unknown' ? null : classified;
}

export function buildCurves(catalog: ReservasCatalog, products: TarifaProduct[]): { sku: Map<string, SizeCurve>; family: Map<string, SizeCurve> } {
  const sales = enrichSales(catalog.sales, products);
  const skuUnits = new Map<string, Map<string, number>>();
  const familyUnits = new Map<string, Map<string, number>>();
  const skuMeta = new Map<string, { brand: string; productType: string; band: ReservaBand }>();

  sales.forEach((sale) => {
    const band = bandForSale(sale, products);
    if (!band) return;
    const brand = sale.brand;
    const productType = sale.productType;
    const skuMap = skuUnits.get(sale.ref) || new Map<string, number>();
    skuMap.set(sale.size, (skuMap.get(sale.size) || 0) + sale.qty);
    skuUnits.set(sale.ref, skuMap);
    skuMeta.set(sale.ref, { brand, productType, band });
    if (brand && productType) {
      const key = familyCurveKey(brand, productType, band);
      const fam = familyUnits.get(key) || new Map<string, number>();
      fam.set(sale.size, (fam.get(sale.size) || 0) + sale.qty);
      familyUnits.set(key, fam);
    }
  });

  const sku = new Map<string, SizeCurve>();
  skuUnits.forEach((parts, ref) => {
    const meta = skuMeta.get(ref);
    if (!meta) return;
    const curve = curveFromCounts(parts, meta.band, {
      key: `sku:${ref}`,
      kind: 'sku',
      brand: meta.brand,
      productType: meta.productType,
      band: meta.band,
      ref,
    });
    if (curve.units >= SKU_CURVE_MIN) sku.set(ref, curve);
  });

  const family = new Map<string, SizeCurve>();
  familyUnits.forEach((parts, key) => {
    const [brand, productType, band] = key.split('|');
    const typedBand = (band === 'youth' || band === 'onesize' ? band : 'adult') as ReservaBand;
    const curve = curveFromCounts(parts, typedBand, {
      key: `family:${key}`,
      kind: 'family',
      brand,
      productType,
      band: typedBand,
      ref: '',
    });
    if (curve.units >= FAMILY_CURVE_MIN) family.set(key, curve);
  });

  catalog.templates.forEach((item) => {
    const key = familyCurveKey(item.brand, item.productType, item.band);
    if (!family.has(key) && item.sizes.length) family.set(key, { ...item, key: `template:${key}`, kind: 'template' });
  });

  return { sku, family };
}

function curveFromCounts(
  parts: Map<string, number>,
  band: ReservaBand,
  meta: Omit<SizeCurve, 'sizes' | 'units'>,
): SizeCurve {
  const units = Array.from(parts.values()).reduce((sum, value) => sum + value, 0);
  const sizes = uniqueSizes(Array.from(parts.keys()), band).map((size) => ({
    size,
    weight: units > 0 ? (parts.get(size) || 0) / units : 0,
  }));
  return { ...meta, sizes, units };
}

export function findGrid(
  grids: SizeGrid[],
  brand: string,
  productType: string,
  band: ReservaBand,
): SizeGrid | undefined {
  const key = familyCurveKey(brand, productType, band);
  return grids.find((item) => gridKey(item) === key);
}

export type CurveBundle = { sku: Map<string, SizeCurve>; family: Map<string, SizeCurve> };

export function resolveCurve(
  catalog: ReservasCatalog,
  products: TarifaProduct[],
  item: TarifaProduct,
  band: ReservaBand,
  curves?: CurveBundle,
): { curve: SizeCurve | null; sizes: string[]; source: ReservaCurveKind | 'none' } {
  const { sku, family } = curves || buildCurves(catalog, products);
  const ref = band === 'youth' ? item.youthRef : item.adultRef;
  const skuCurve = ref ? sku.get(ref) : undefined;
  const fam = family.get(familyCurveKey(item.brand, item.productType, band));
  const grid = findGrid(catalog.grids, item.brand, item.productType, band);
  const curve = skuCurve || fam || null;
  const sizes = uniqueSizes([
    ...(grid?.sizes || []),
    ...(curve?.sizes.map((part) => part.size) || []),
  ], band);
  if (!curve || sizes.length === 0) return { curve: null, sizes, source: 'none' };
  return { curve, sizes, source: skuCurve ? 'sku' : curve.kind };
}

export function isOnesizeProduct(item: TarifaProduct, onesizeTypes: string[]): boolean {
  return isOnesizeType(item.productType, onesizeTypes);
}

export function splitToCells(
  total: number,
  sizes: string[],
  curve: SizeCurve | null,
  ref: string,
  previous?: ReservaSizeCell[],
): ReservaSizeCell[] {
  if (sizes.length === 0) return [];
  const prev = new Map((previous || []).map((cell) => [norm(cell.size), cell]));
  const locked = sizes
    .map((size) => prev.get(norm(size)))
    .filter((cell): cell is ReservaSizeCell => Boolean(cell?.locked));
  const lockedQty = locked.reduce((sum, cell) => sum + cell.qty, 0);
  const unlockedSizes = sizes.filter((size) => !prev.get(norm(size))?.locked);
  const remaining = Math.max(0, Math.round(total) - lockedQty);
  const weights = unlockedSizes.map((size) => {
    const part = curve?.sizes.find((item) => norm(item.size) === norm(size));
    return part?.weight || 0;
  });
  const split = largestRemainder(remaining, weights);
  return sizes.map((size) => {
    const old = prev.get(norm(size));
    if (old?.locked) return { ...old, ref, size };
    const index = unlockedSizes.findIndex((item) => norm(item) === norm(size));
    return { ref, size, qty: index >= 0 ? split[index] : 0, locked: false };
  });
}

export function setCellQty(cells: ReservaSizeCell[], size: string, qty: number, total: number, curve: SizeCurve | null): ReservaSizeCell[] {
  const sizes = cells.map((cell) => cell.size);
  const next = cells.map((cell) => (
    norm(cell.size) === norm(size)
      ? { ...cell, qty: Math.max(0, Math.round(qty)), locked: true }
      : cell
  ));
  return splitToCells(total, sizes, curve, cells[0]?.ref || '', next);
}

export function hydrateLine(
  line: ReservaLine,
  item: TarifaProduct,
  catalog: ReservasCatalog,
  products: TarifaProduct[],
  curves?: CurveBundle,
): ReservaLine {
  if (isOnesizeProduct(item, catalog.onesizeTypes)) {
    const resolved = resolveCurve(catalog, products, item, 'onesize', curves);
    const sizes = resolved.sizes.length ? resolved.sizes : ['UNI'];
    const ref = item.adultRef || item.youthRef;
    const onesizeQty = Math.max(0, Math.round(line.onesizeQty));
    return {
      ...line,
      adultQty: 0,
      youthQty: 0,
      onesizeQty,
      adultSizes: [],
      youthSizes: [],
      onesizeSizes: splitToCells(onesizeQty, sizes, resolved.curve, ref, line.onesizeSizes),
    };
  }
  const kind = ageKind(item);
  const adult = kind === 'youthOnly' ? { curve: null, sizes: [] as string[], source: 'none' as const } : resolveCurve(catalog, products, item, 'adult', curves);
  const youth = kind === 'adult' ? { curve: null, sizes: [] as string[], source: 'none' as const } : resolveCurve(catalog, products, item, 'youth', curves);
  const adultQty = item.adultRef ? Math.max(0, Math.round(line.adultQty)) : 0;
  const youthQty = item.youthRef ? Math.max(0, Math.round(line.youthQty)) : 0;
  return {
    ...line,
    adultQty,
    youthQty,
    onesizeQty: 0,
    adultSizes: item.adultRef && adult.sizes.length
      ? splitToCells(adultQty, adult.sizes, adult.curve, item.adultRef, line.adultSizes)
      : [],
    youthSizes: item.youthRef && youth.sizes.length
      ? splitToCells(youthQty, youth.sizes, youth.curve, item.youthRef, line.youthSizes)
      : [],
    onesizeSizes: [],
  };
}

export function applyShortcut(
  lines: ReservaLine[],
  products: TarifaProduct[],
  catalog: ReservasCatalog,
  players: number,
  mixAdult: number,
): ReservaLine[] {
  const total = Math.max(0, Math.round(players));
  const adultShare = Math.min(100, Math.max(0, mixAdult));
  const adultPlayers = Math.round(total * (adultShare / 100));
  const youthPlayers = total - adultPlayers;
  const byId = new Map(products.map((item) => [item.id, item]));
  const curves = buildCurves(catalog, products);
  return lines.map((line) => {
    const item = byId.get(line.id);
    if (!item) return line;
    if (isOnesizeProduct(item, catalog.onesizeTypes)) {
      return hydrateLine({ ...line, onesizeQty: total, adultQty: 0, youthQty: 0 }, item, catalog, products, curves);
    }
    return hydrateLine({
      ...line,
      adultQty: item.adultRef ? adultPlayers : 0,
      youthQty: item.youthRef ? youthPlayers : 0,
      onesizeQty: 0,
    }, item, catalog, products, curves);
  });
}

export function proposeGrids(catalog: ReservasCatalog, products: TarifaProduct[]): SizeGrid[] {
  const sales = enrichSales(catalog.sales, products);
  const buckets = new Map<string, { brand: string; productType: string; band: ReservaBand; sizes: string[] }>();
  sales.forEach((sale) => {
    const band = bandForSale(sale, products);
    if (!band || !sale.brand || !sale.productType) return;
    const key = familyCurveKey(sale.brand, sale.productType, band);
    const current = buckets.get(key) || { brand: sale.brand, productType: sale.productType, band, sizes: [] };
    current.sizes.push(sale.size);
    buckets.set(key, current);
  });
  const existing = new Set(catalog.grids.map(gridKey));
  const proposed: SizeGrid[] = [];
  buckets.forEach((bucket) => {
    if (existing.has(familyCurveKey(bucket.brand, bucket.productType, bucket.band))) return;
    const sizes = uniqueSizes(bucket.sizes, bucket.band);
    if (!sizes.length) return;
    proposed.push({
      id: newId('grid'),
      brand: bucket.brand,
      productType: bucket.productType,
      band: bucket.band,
      sizes,
    });
  });
  return proposed;
}

export function lineHasCurve(
  item: TarifaProduct,
  catalog: ReservasCatalog,
  products: TarifaProduct[],
  curves?: CurveBundle,
): boolean {
  if (isOnesizeProduct(item, catalog.onesizeTypes)) return true;
  const kind = ageKind(item);
  if (kind !== 'youthOnly') {
    const adult = resolveCurve(catalog, products, item, 'adult', curves);
    if (item.adultRef && adult.source === 'none') return false;
  }
  if (kind !== 'adult') {
    const youth = resolveCurve(catalog, products, item, 'youth', curves);
    if (item.youthRef && youth.source === 'none') return false;
  }
  return true;
}

export function reservaExportRows(lines: ReservaLine[], products: TarifaProduct[]): { ref: string; size: string; qty: number; name: string; colour: string; brand: string; band: ReservaBand }[] {
  const byId = new Map(products.map((item) => [item.id, item]));
  const rows: { ref: string; size: string; qty: number; name: string; colour: string; brand: string; band: ReservaBand }[] = [];
  lines.forEach((line) => {
    const item = byId.get(line.id);
    if (!item) return;
    const push = (cells: ReservaSizeCell[], band: ReservaBand) => {
      cells.forEach((cell) => {
        if (!cell.ref || !cell.size || cell.qty <= 0) return;
        rows.push({
          ref: cell.ref,
          size: cell.size,
          qty: cell.qty,
          name: item.name,
          colour: item.colour,
          brand: item.brand,
          band,
        });
      });
    };
    push(line.adultSizes, 'adult');
    push(line.youthSizes, 'youth');
    push(line.onesizeSizes, 'onesize');
  });
  return rows;
}
