export interface TarifaStock {
  total: number;
  disp: number;
  pending: number;
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

export function formatRed(red: string | null): string {
  if (!red) return 'Sin vigencia';
  const [year, month, day] = red.split('-');
  return `${day}/${month}/${year}`;
}

export function sellPrice(item: TarifaProduct, channel: TarifaChannel): number | null {
  if (channel === 'b2c') return item.b2c.fee1;
  return item.b2b.adultFee1 ?? item.b2b.youthFee1;
}

export function rrpPrice(item: TarifaProduct, channel: TarifaChannel): number | null {
  if (channel === 'b2c') return item.b2c.adultRrp ?? item.b2c.youthRrp;
  return item.b2b.adultRrp ?? item.b2b.youthRrp;
}

export function uniqueSorted(items: TarifaProduct[], key: 'brand' | 'productType'): string[] {
  return Array.from(new Set(items.map((item) => item[key]).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es'));
}
