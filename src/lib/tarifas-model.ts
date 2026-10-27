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

export type TarifaChannel = 'b2c' | 'b2b';
export type FeeLevel = 1 | 2 | 3 | 4;
export type TarifaAge = 'adult' | 'youth';
export type TarifaSport = 'Fútbol' | 'Baloncesto' | 'Balonmano';
export type TarifaKind = 'Personalizable' | 'Catálogo';
export type TarifaGender = 'Hombre' | 'Mujer' | 'Unisex';
export type TarifaNovelty = 'Nueva' | 'Año pasado';

export const SPORTS: TarifaSport[] = ['Fútbol', 'Baloncesto', 'Balonmano'];
export const GENDERS: TarifaGender[] = ['Hombre', 'Mujer', 'Unisex'];
export const KINDS: TarifaKind[] = ['Personalizable', 'Catálogo'];
export const NOVELTIES: TarifaNovelty[] = ['Nueva', 'Año pasado'];

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
  sport: TarifaSport;
  gender: TarifaGender;
  kind: TarifaKind;
  collection: string;
  season: string;
  novelty: TarifaNovelty | '';
  outlet: boolean;
  stock: TarifaStock;
  b2c: TarifaB2C;
  b2b: TarifaB2B;
}

export function hasAdult(item: TarifaProduct): boolean {
  return Boolean(item.adultRef);
}

export function hasYouth(item: TarifaProduct): boolean {
  return Boolean(item.youthRef);
}

export type TarifaAgeKind = 'both' | 'adult' | 'youthOnly';

export function ageKind(item: TarifaProduct): TarifaAgeKind {
  const adult = hasAdult(item);
  const youth = hasYouth(item);
  if (adult && youth) return 'both';
  if (youth && !adult) return 'youthOnly';
  return 'adult';
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

function asSport(value: unknown, fallback: TarifaSport): TarifaSport {
  const text = String(value || '').trim();
  const hit = SPORTS.find((item) => item.toLocaleLowerCase('es') === text.toLocaleLowerCase('es'));
  return hit || fallback;
}

function asGender(value: unknown, fallback: TarifaGender): TarifaGender {
  const text = String(value || '').trim().toLocaleLowerCase('es');
  if (text === 'hombre' || text === 'male' || text === 'm') return 'Hombre';
  if (text === 'mujer' || text === 'female' || text === 'f') return 'Mujer';
  if (text === 'unisex') return 'Unisex';
  return fallback;
}

function asKind(value: unknown, fallback: TarifaKind): TarifaKind {
  const text = String(value || '').trim().toLocaleLowerCase('es');
  if (text.startsWith('person')) return 'Personalizable';
  if (text.startsWith('cat') || text === 'catalogo' || text === 'catálogo') return 'Catálogo';
  return fallback;
}

function asNovelty(value: unknown): TarifaNovelty | '' {
  const text = String(value || '').trim().toLocaleLowerCase('es');
  if (!text) return '';
  if (text.includes('nueva') || text === 'new' || text === 'si' || text === 'sí') return 'Nueva';
  if (text.includes('año') || text.includes('pasad') || text.includes('continu')) return 'Año pasado';
  return '';
}

function inferSport(item: Pick<TarifaProduct, 'productType' | 'name'>): TarifaSport {
  const text = `${item.productType} ${item.name}`.toLocaleLowerCase('es');
  if (text.includes('basket') || text.includes('baloncesto')) return 'Baloncesto';
  if (text.includes('balonmano') || text.includes('handball')) return 'Balonmano';
  return 'Fútbol';
}

function inferGender(item: Pick<TarifaProduct, 'productType' | 'name'>): TarifaGender {
  const text = `${item.productType} ${item.name}`.toLocaleLowerCase('es');
  if (text.includes('falda') || text.includes('mujer') || text.includes('women')) return 'Mujer';
  return 'Unisex';
}

function inferKind(item: Pick<TarifaProduct, 'productType'>): TarifaKind {
  const type = item.productType.toLocaleLowerCase('es');
  const kit = ['camiseta', 'pantalón corto', 'pantalon corto', 'medias', 'polo', 'peto', 'falda', 'top'];
  if (type.includes('algodón') || type.includes('algodon') || type.includes('térmica') || type.includes('termica')) {
    return 'Catálogo';
  }
  return kit.some((name) => type.includes(name)) ? 'Personalizable' : 'Catálogo';
}

function inferCollection(item: Pick<TarifaProduct, 'name' | 'productType' | 'collection'>): string {
  if (item.collection) return item.collection;
  const name = item.name.trim();
  const type = item.productType.trim();
  if (type && name.toLocaleLowerCase('es').startsWith(type.toLocaleLowerCase('es'))) {
    return name.slice(type.length).trim();
  }
  return name;
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
    sport: 'Fútbol',
    gender: 'Unisex',
    kind: 'Catálogo',
    collection: '',
    season: '26/27',
    novelty: '',
    outlet: false,
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

export function asOutletProduct(item: TarifaProduct): TarifaProduct {
  const id = item.id.startsWith('ol-') ? item.id : `ol-${item.adultRef || item.youthRef || item.id}`;
  return { ...item, outlet: true, id };
}

export function asProduct(value: unknown): TarifaProduct {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<TarifaProduct>;
  const seed = emptyProduct();
  const stock = { ...emptyStock(), ...(row.stock || {}) };
  if (!stock.ordered) stock.ordered = stock.pending;
  const base: TarifaProduct = {
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
    sport: String(row.sport || '').trim() ? asSport(row.sport, seed.sport) : inferSport({ productType: String(row.productType || ''), name: String(row.name || '') }),
    gender: String(row.gender || '').trim() ? asGender(row.gender, seed.gender) : inferGender({ productType: String(row.productType || ''), name: String(row.name || '') }),
    kind: String(row.kind || '').trim() ? asKind(row.kind, seed.kind) : inferKind({ productType: String(row.productType || '') }),
    collection: String(row.collection || ''),
    season: String(row.season || seed.season),
    novelty: asNovelty(row.novelty),
    outlet: Boolean(row.outlet),
    stock,
    b2c: { ...seed.b2c, ...(row.b2c || {}) },
    b2b: { ...seed.b2b, ...(row.b2b || {}) },
  };
  return {
    ...base,
    collection: inferCollection(base),
    season: base.season || '26/27',
  };
}

export function sportOf(item: TarifaProduct): TarifaSport {
  return item.sport || inferSport(item);
}

export function kindOf(item: TarifaProduct): TarifaKind {
  return item.kind || inferKind(item);
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

export function formatEuro(value: number | null | undefined, locale = 'es-ES'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatQty(value: number | null | undefined, locale = 'es-ES'): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return value.toLocaleString(locale, { maximumFractionDigits: 0 });
}

export function formatPct(value: number | null | undefined, locale = 'es-ES'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
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

export function lineCost(item: TarifaProduct, channel: TarifaChannel, age: TarifaAge = 'adult'): number | null {
  if (channel === 'b2c') {
    return money(age === 'youth' ? item.b2c.youthNet ?? item.b2c.adultNet : item.b2c.adultNet ?? item.b2c.youthNet);
  }
  return money(age === 'youth' ? item.b2b.youthNet ?? item.b2b.adultNet : item.b2b.adultNet ?? item.b2b.youthNet);
}

export function marginPct(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export function lineMargin(
  item: TarifaProduct,
  channel: TarifaChannel,
  fee: FeeLevel,
  age: TarifaAge = 'adult',
): number | null {
  return marginPct(sellPrice(item, channel, fee, age), lineCost(item, channel, age));
}

export function uniqueSorted(
  items: TarifaProduct[],
  key: 'brand' | 'productType' | 'colour' | 'collection' | 'season',
): string[] {
  return Array.from(new Set(items.map((item) => item[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}

export interface PackLine {
  id: string;
  fee: FeeLevel;
  stamp: number;
  stampInput: string;
}

export function fueraPackFee(channel: TarifaChannel): FeeLevel {
  return channel === 'b2c' ? 4 : 3;
}

export function fueraPackPrice(item: TarifaProduct, channel: TarifaChannel): number | null {
  return sellPrice(item, channel, fueraPackFee(channel), 'adult');
}

export function packTotals(
  products: TarifaProduct[],
  lines: PackLine[],
  channel: TarifaChannel,
): { pieces: number; club: number; stamp: number; sale: number; rrp: number; fuera: number; margin: number | null } {
  const byId = new Map(products.map((item) => [item.id, item]));
  let club = 0;
  let stamp = 0;
  let rrp = 0;
  let fuera = 0;
  let cost = 0;
  let hasCost = false;
  lines.forEach((line) => {
    const item = byId.get(line.id);
    if (!item) return;
    const price = sellPrice(item, channel, line.fee, 'adult');
    const pvp = rrpPrice(item, channel, 'adult');
    const extra = Number.isFinite(line.stamp) ? line.stamp : 0;
    const unit = lineCost(item, channel, 'adult');
    if (price != null) club += price;
    stamp += extra;
    if (pvp != null) rrp += pvp;
    const out = fueraPackPrice(item, channel);
    if (out != null) fuera += out;
    if (unit != null) {
      cost += unit;
      hasCost = true;
    }
  });
  const sale = Math.round((club + stamp) * 100) / 100;
  return {
    pieces: lines.length,
    club: Math.round(club * 100) / 100,
    stamp: Math.round(stamp * 100) / 100,
    sale,
    rrp: Math.round(rrp * 100) / 100,
    fuera: Math.round(fuera * 100) / 100,
    margin: hasCost ? marginPct(sale || null, cost) : null,
  };
}

export { qty, money };
