export interface TarifaStock {
  total: number;
  disp: number;
  pending: number;
  ordered: number;
  reserved: number;
  eqi: number;
  ztt: number;
  zgz: number;
  b2b: number;
}

export interface TarifaB2C {
  adultRrp: number | null;
  youthRrp: number | null;
  fee1: number | null;
  fee2: number | null;
  fee3: number | null;
  fee4: number | null;
  adultNet: number | null;
  youthNet: number | null;
  discountPct: number | null;
}

export interface TarifaB2B {
  adultRrp: number | null;
  youthRrp: number | null;
  adultFee1: number | null;
  youthFee1: number | null;
  adultFee2: number | null;
  youthFee2: number | null;
  adultFee3: number | null;
  youthFee3: number | null;
  adultNet: number | null;
  youthNet: number | null;
  discountPct: number | null;
}

export interface TarifaProduct {
  id: string;
  brand: string;
  productType: string;
  name: string;
  colour: string;
  red: string | null;
  adultRef: string;
  youthRef: string;
  colorHex: string | null;
  image: string | null;
  stock: TarifaStock;
  b2c: TarifaB2C;
  b2b: TarifaB2B;
}

export type TarifaChannel = 'b2c' | 'b2b';
export type FeeLevel = 1 | 2 | 3 | 4;
export type TarifaAge = 'adult' | 'youth';
export type TarifaSport = 'Fútbol' | 'Baloncesto' | 'Hockey' | 'Otros';
export type TarifaKind = 'Personalizable' | 'Catálogo';

export function hasAdult(item: TarifaProduct): boolean {
  return Boolean(item.adultRef);
}

export function hasYouth(item: TarifaProduct): boolean {
  return Boolean(item.youthRef);
}

export function sportOf(item: TarifaProduct): TarifaSport {
  const text = `${item.productType} ${item.name}`.toLocaleLowerCase('es');
  if (text.includes('basket') || text.includes('baloncesto')) return 'Baloncesto';
  if (text.includes('hockey')) return 'Hockey';
  if (text.includes('pádel') || text.includes('padel')) return 'Otros';
  return 'Fútbol';
}

export function kindOf(item: TarifaProduct): TarifaKind {
  const type = item.productType.toLocaleLowerCase('es');
  const kit = [
    'camiseta',
    'pantalón corto',
    'pantalon corto',
    'medias',
    'polo',
    'peto',
    'falda',
    'top',
  ];
  if (type.includes('algodón') || type.includes('algodon') || type.includes('térmica') || type.includes('termica')) {
    return 'Catálogo';
  }
  return kit.some((name) => type.includes(name)) ? 'Personalizable' : 'Catálogo';
}

export function channelFees(channel: TarifaChannel): FeeLevel[] {
  return channel === 'b2c' ? [1, 2, 3, 4] : [1, 2, 3];
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  return null;
}

function qty(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyFees(): TarifaB2C {
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

export function emptyStock(): TarifaStock {
  return {
    total: 0,
    disp: 0,
    pending: 0,
    ordered: 0,
    reserved: 0,
    eqi: 0,
    ztt: 0,
    zgz: 0,
    b2b: 0,
  };
}

export function emptyProduct(): TarifaProduct {
  const b2c = emptyFees();
  return {
    id: newId('tf'),
    brand: '',
    productType: '',
    name: '',
    colour: '',
    red: null,
    adultRef: '',
    youthRef: '',
    colorHex: null,
    image: null,
    stock: emptyStock(),
    b2c,
    b2b: {
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
    },
  };
}

export function asProduct(value: unknown): TarifaProduct {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<TarifaProduct>;
  const seed = emptyProduct();
  const stock = { ...emptyStock(), ...(row.stock || {}) };
  if (!stock.ordered) stock.ordered = stock.pending;
  return {
    ...seed,
    ...row,
    id: String(row.id || seed.id),
    brand: String(row.brand || ''),
    productType: String(row.productType || ''),
    name: String(row.name || ''),
    colour: String(row.colour || ''),
    red: row.red || null,
    adultRef: String(row.adultRef || ''),
    youthRef: String(row.youthRef || ''),
    colorHex: row.colorHex || null,
    image: row.image || null,
    stock,
    b2c: { ...seed.b2c, ...(row.b2c || {}) },
    b2b: { ...seed.b2b, ...(row.b2b || {}) },
  };
}

export function familyKey(item: TarifaProduct): string {
  return `${item.brand}|${item.name}`;
}

export function colourways(items: TarifaProduct[], item: TarifaProduct): TarifaProduct[] {
  const key = familyKey(item);
  return items.filter((row) => familyKey(row) === key);
}

export function todayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isExpired(red: string | null, today = todayIso()): boolean {
  return Boolean(red && red < today);
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}%`;
}

export function formatRed(red: string | null): string {
  if (!red) return 'Sin vigencia';
  const [year, month, day] = red.split('-');
  return `${day}/${month}/${year}`;
}

export function sellPrice(
  item: TarifaProduct,
  channel: TarifaChannel,
  fee: FeeLevel = 1,
  age: TarifaAge = 'adult',
): number | null {
  if (channel === 'b2c') {
    if (fee === 1) return money(item.b2c.fee1);
    if (fee === 2) return money(item.b2c.fee2);
    if (fee === 3) return money(item.b2c.fee3);
    return money(item.b2c.fee4);
  }
  const adult = fee === 1 ? item.b2b.adultFee1 : fee === 2 ? item.b2b.adultFee2 : item.b2b.adultFee3;
  const youth = fee === 1 ? item.b2b.youthFee1 : fee === 2 ? item.b2b.youthFee2 : item.b2b.youthFee3;
  return age === 'youth' ? money(youth ?? adult) : money(adult ?? youth);
}

export function rrpPrice(
  item: TarifaProduct,
  channel: TarifaChannel,
  age: TarifaAge = 'adult',
): number | null {
  const adult = channel === 'b2c' ? item.b2c.adultRrp : item.b2b.adultRrp;
  const youth = channel === 'b2c' ? item.b2c.youthRrp : item.b2b.youthRrp;
  return age === 'youth' ? money(youth ?? adult) : money(adult ?? youth);
}

export function activeRef(item: TarifaProduct, age: TarifaAge): string {
  return age === 'youth' ? (item.youthRef || item.adultRef) : (item.adultRef || item.youthRef);
}

export function unitCost(item: TarifaProduct, channel: TarifaChannel): number | null {
  if (channel === 'b2c') return money(item.b2c.adultNet ?? item.b2c.youthNet);
  return money(item.b2b.adultNet ?? item.b2b.youthNet);
}

export function marginPct(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export function uniqueSorted(items: TarifaProduct[], key: 'brand' | 'productType' | 'colour'): string[] {
  return Array.from(new Set(items.map((item) => item[key]).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es'));
}

export interface PackLine {
  id: string;
  qty: number;
  fee: FeeLevel;
  age: TarifaAge;
}

export function packTotals(
  products: TarifaProduct[],
  lines: PackLine[],
  channel: TarifaChannel,
): { pieces: number; sale: number } {
  const byId = new Map(products.map((item) => [item.id, item]));
  let pieces = 0;
  let sale = 0;
  lines.forEach((line) => {
    const item = byId.get(line.id);
    if (!item) return;
    const price = sellPrice(item, channel, line.fee, line.age);
    pieces += line.qty;
    if (price != null) sale += price * line.qty;
  });
  return {
    pieces,
    sale: Math.round(sale * 100) / 100,
  };
}

export { qty, money };
