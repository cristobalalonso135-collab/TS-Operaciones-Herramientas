import { reservaExportRows, type ReservaLine, type ReservaSale } from '@/lib/reservas-model';
import type { TarifaProduct } from '@/lib/tarifas-model';

function textCell(value: unknown): string {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text || text === '-' || text === '—') return '';
  return text;
}

function qtyCell(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? value : 0;
  const text = textCell(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function headerMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = String(header || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
    if (key) map.set(key, index);
  });
  return map;
}

function pick(map: Map<string, number>, row: unknown[], names: string[]): unknown {
  for (const name of names) {
    const index = map.get(name.toLocaleLowerCase('es'));
    if (index != null && row[index] != null && String(row[index]).trim() !== '') return row[index];
  }
  const keys = Array.from(map.keys());
  for (const name of names) {
    const hit = keys.find((key) => key.includes(name.toLocaleLowerCase('es')));
    if (!hit) continue;
    const index = map.get(hit);
    if (index != null && row[index] != null && String(row[index]).trim() !== '') return row[index];
  }
  return '';
}

function rowsFromSheet(data: unknown[][]): ReservaSale[] {
  const start = data.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (start < 0) return [];
  const map = headerMap((data[start] || []).map((item) => String(item || '')));
  if (map.size === 0) return [];
  const out: ReservaSale[] = [];
  data.slice(start + 1).forEach((row) => {
    const ref = textCell(pick(map, row, [
      'referencia',
      'ref',
      'article',
      'articulo',
      'artículo',
      'sku',
      'adult article number',
      'referencia adulto',
    ]));
    const size = textCell(pick(map, row, ['talla', 'size', 'talle', 'talla/size']));
    const qty = qtyCell(pick(map, row, ['unidades', 'uds', 'qty', 'cantidad', 'units', 'ud', 'stock']));
    if (!ref || !size || qty <= 0) return;
    out.push({
      ref,
      size,
      qty,
      brand: textCell(pick(map, row, ['marca', 'brand'])),
      productType: textCell(pick(map, row, ['tipo', 'categoría', 'categoria', 'familia', 'producto', 'product type'])),
    });
  });
  return out;
}

export function parseReservaSalesSheets(sheets: Record<string, unknown[][]>): ReservaSale[] {
  const merged = new Map<string, ReservaSale>();
  Object.values(sheets).forEach((sheet) => {
    rowsFromSheet(sheet || []).forEach((sale) => {
      const key = `${sale.ref}|${sale.size}|${sale.brand}|${sale.productType}`;
      const current = merged.get(key);
      if (current) current.qty += sale.qty;
      else merged.set(key, { ...sale });
    });
  });
  return Array.from(merged.values());
}

export function reservaRpHeaders(): string[] {
  return ['Referencia', 'Talla', 'Unidades', 'Producto', 'Color', 'Marca', 'Edad'];
}

export function reservaRpExportRows(
  lines: ReservaLine[],
  products: TarifaProduct[],
  headers?: string[],
): unknown[][] {
  const head = headers || reservaRpHeaders();
  const body = reservaExportRows(lines, products).map((row) => [
    row.ref,
    row.size,
    row.qty,
    row.name,
    row.colour,
    row.brand,
    row.band === 'youth' ? 'Niño' : row.band === 'onesize' ? 'Única' : 'Adulto',
  ]);
  return [head, ...body];
}
