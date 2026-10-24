import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const EXCEL = 'C:/Users/cristobal.alonso/Desktop/TS Operaciones/Pricelist/Tarifas 26-27.xlsx';
const IMAGES = 'C:/Users/cristobal.alonso/Desktop/data.csv';
const STOCK = 'C:/Users/cristobal.alonso/Desktop/TS Operaciones/Pricelist/Power BI/Stock.csv';
const OUT = path.resolve('src/data/tarifas-catalog.json');

function money(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text || text === '-' || text === '—') return null;
  const n = Number(text.replace(/[€%\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function percent(value) {
  const n = money(value);
  if (n == null) return null;
  return n <= 1 ? Math.round(n * 10000) / 100 : n;
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function sku(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—') return '';
  return text;
}

function qty(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  if (text.includes(',')) return Number(text.replace(',', '.')) || 0;
  return Number(text) || 0;
}

function parseDelimited(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line) => line.length);
  const delim = lines[0].includes(';') && !lines[0].startsWith('url_imagen') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(delim).map((c) => c.replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = parts[i] || ''; });
    return row;
  });
}

function emptyStock() {
  return { total: 0, disp: 0, pending: 0, reserved: 0, eqi: 0, ztt: 0, zgz: 0, b2b: 0 };
}

const imageRows = parseDelimited(IMAGES);
const images = new Map();
imageRows.forEach((row) => {
  const ref = sku(row.referencia);
  const url = String(row.url_imagen || '').trim();
  if (!ref || !url.startsWith('http')) return;
  images.set(ref, url);
});

const stockRows = parseDelimited(STOCK);
const stock = new Map();
stockRows.forEach((row) => {
  const ref = sku(row['Referencia (producto real)']);
  if (!ref) return;
  const current = stock.get(ref) || emptyStock();
  current.total += qty(row['Stock total']);
  current.disp += qty(row['Uds. disp.']);
  current.pending += qty(row['Uds. ptes. recep.']);
  current.reserved += qty(row['Uds. res. total']);
  current.eqi += qty(row['Stock EQI']);
  current.ztt += qty(row['Stock ZTT']);
  current.zgz += qty(row['Stock ZGZ']);
  current.b2b += qty(row['Stock B2B']);
  stock.set(ref, current);
});

function mergeStock(a, b) {
  const left = a || emptyStock();
  const right = b || emptyStock();
  return {
    total: left.total + right.total,
    disp: left.disp + right.disp,
    pending: left.pending + right.pending,
    reserved: left.reserved + right.reserved,
    eqi: left.eqi + right.eqi,
    ztt: left.ztt + right.ztt,
    zgz: left.zgz + right.zgz,
    b2b: left.b2b + right.b2b,
  };
}

const wb = XLSX.readFile(EXCEL, { cellDates: true });
const b2c = XLSX.utils.sheet_to_json(wb.Sheets['Tarifas B2C'], { defval: '', raw: true });
const b2b = XLSX.utils.sheet_to_json(wb.Sheets['Tarifas B2B'], { defval: '', raw: true });
const b2bByKey = new Map();
b2b.forEach((row) => {
  const key = `${sku(row['ADULT ARTICLE NUMBER'])}|${sku(row['YOUTH ARTICLE NUMBER'])}`;
  b2bByKey.set(key, row);
});

const products = b2c.map((row, index) => {
  const adultRef = sku(row['ADULT ARTICLE NUMBER']);
  const youthRef = sku(row['YOUTH ARTICLE NUMBER']);
  const key = `${adultRef}|${youthRef}`;
  const trade = b2bByKey.get(key) || {};
  const image = images.get(adultRef) || images.get(youthRef) || null;
  return {
    id: adultRef || youthRef || `row-${index}`,
    brand: String(row.BRAND || '').trim(),
    productType: String(row['PRODUCT TYPE'] || '').trim(),
    name: String(row['PRODUCT NAME'] || '').trim(),
    colour: String(row.COLOUR || '').trim(),
    red: isoDate(row.RED),
    adultRef,
    youthRef,
    colorHex: String(row['Color 1'] || '').trim() || null,
    image,
    stock: mergeStock(stock.get(adultRef), stock.get(youthRef)),
    b2c: {
      adultRrp: money(row['ADULT RRP']),
      youthRrp: money(row['YOUTH RRP']),
      fee1: money(row['FEE 1']),
      fee2: money(row['FEE 2']),
      fee3: money(row['FEE 3']),
      fee4: money(row['FEE 4']),
      adultNet: money(row['ADULT NET PRICE']),
      youthNet: money(row['YOUTH NET PRICE']),
      discountPct: percent(row['DISCOUNT %']),
    },
    b2b: {
      adultRrp: money(trade['ADULT RRP']),
      youthRrp: money(trade['YOUTH RRP']),
      adultFee1: money(trade[' ADULT FEE 1'] ?? trade['ADULT FEE 1']),
      youthFee1: money(trade['YOUTH FEE 1']),
      adultFee2: money(trade['ADULT FEE 2']),
      youthFee2: money(trade['YOUTH FEE 2']),
      adultFee3: money(trade['ADULT FEE 3']),
      youthFee3: money(trade['YOUTH FEE 3']),
      adultNet: money(trade['ADULT NET PRICE']),
      youthNet: money(trade['YOUTH NET PRICE']),
      discountPct: percent(trade['DISCOUNT %']),
    },
  };
}).filter((item) => item.name);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(products));

const withImage = products.filter((item) => item.image).length;
const withStock = products.filter((item) => item.stock.total > 0 || item.stock.disp > 0 || item.stock.pending > 0).length;
console.log(JSON.stringify({
  products: products.length,
  withImage,
  withStock,
  imageFile: images.size,
  stockRefs: stock.size,
}, null, 2));
