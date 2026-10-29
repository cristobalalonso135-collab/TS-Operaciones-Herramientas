import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { formatEuro, formatPct } from '@/lib/tarifas-model';
import type { PackDeck, PackDeckLine } from '@/lib/tarifas-pack-payload';

const INK = '171717';
const MUTED = '737373';
const LINE = 'E5E5E5';
const SOFT = 'FAFAFA';
const WHITE = 'FFFFFF';

interface PackedImage {
  buffer: Buffer;
  ext: 'jpeg' | 'png' | 'gif';
  base64: string;
}

function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name === 'localhost' || name.endsWith('.local') || name.endsWith('.internal')) return true;
  const ipv4 = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

function safeImageUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function imageExt(contentType: string, url: string): PackedImage['ext'] {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('gif')) return 'gif';
  if (url.toLowerCase().endsWith('.png')) return 'png';
  if (url.toLowerCase().endsWith('.gif')) return 'gif';
  return 'jpeg';
}

async function fetchImage(raw: string | null): Promise<PackedImage | null> {
  const url = safeImageUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: `${url.origin}/`,
        'User-Agent': 'Mozilla/5.0 TS-Operaciones-Herramientas',
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (type && !type.startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 80 || buffer.byteLength > 4_000_000) return null;
    const ext = imageExt(type, url.pathname);
    return { buffer, ext, base64: `image/${ext === 'jpeg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}` };
  } catch {
    return null;
  }
}

async function loadImages(lines: PackDeckLine[]): Promise<Array<PackedImage | null>> {
  const cache = new Map<string, Promise<PackedImage | null>>();
  return Promise.all(lines.map((line) => {
    const key = line.image || '';
    if (!key) return Promise.resolve(null);
    const hit = cache.get(key);
    if (hit) return hit;
    const next = fetchImage(key);
    cache.set(key, next);
    return next;
  }));
}

function euro(value: number | null | undefined, locale: string): string {
  return formatEuro(value, locale);
}

function metaLine(deck: PackDeck): string {
  return [deck.channel, deck.season || null, `${deck.totals.pieces} ${deck.labels.pieces}`, deck.labels.vat]
    .filter(Boolean)
    .join('  ·  ');
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type DeckSlide = ReturnType<PptxGenJS['addSlide']>;

function addHeader(slide: DeckSlide, deck: PackDeck, kicker: string) {
  slide.addText(kicker.toUpperCase(), {
    x: 0.46, y: 0.26, w: 8.4, h: 0.24,
    fontFace: 'Arial', fontSize: 10, color: MUTED, charSpacing: 2.4, margin: 0,
  });
  slide.addText(deck.title, {
    x: 0.46, y: 0.48, w: 8.6, h: 0.42,
    fontFace: 'Arial', fontSize: 24, bold: true, color: INK, margin: 0,
  });
  slide.addText(metaLine(deck), {
    x: 0.46, y: 0.9, w: 8.6, h: 0.24,
    fontFace: 'Arial', fontSize: 11, color: MUTED, margin: 0,
  });
  slide.addText(euro(deck.totals.sale, deck.locale), {
    x: 9.2, y: 0.42, w: 3.66, h: 0.4,
    fontFace: 'Arial', fontSize: 22, bold: true, color: INK, align: 'right', margin: 0,
  });
  slide.addText(deck.labels.total, {
    x: 9.2, y: 0.82, w: 3.66, h: 0.22,
    fontFace: 'Arial', fontSize: 10, color: MUTED, align: 'right', margin: 0,
  });
  slide.addShape('rect', {
    x: 0.46, y: 1.2, w: 12.4, h: 0.015, fill: { color: INK }, line: { color: INK },
  });
}

function addFooter(slide: DeckSlide, deck: PackDeck) {
  slide.addShape('roundRect', {
    x: 0.46, y: 6.72, w: 12.4, h: 0.52,
    fill: { color: INK }, line: { color: INK }, rectRadius: 0.08,
  });
  const bits = [
    `${deck.labels.club} ${euro(deck.totals.club, deck.locale)}`,
    `${deck.labels.stamp} ${euro(deck.totals.stamp, deck.locale)}`,
    `${deck.labels.fuera} ${euro(deck.totals.fuera, deck.locale)}`,
    `PVP ${euro(deck.totals.rrp, deck.locale)}`,
  ];
  slide.addText(bits.join('    ·    '), {
    x: 0.62, y: 6.82, w: 8.4, h: 0.32,
    fontFace: 'Arial', fontSize: 11, color: 'D4D4D4', valign: 'middle', margin: 0,
  });
  slide.addText(euro(deck.totals.sale, deck.locale), {
    x: 9.1, y: 6.82, w: 3.5, h: 0.32,
    fontFace: 'Arial', fontSize: 16, bold: true, color: WHITE, align: 'right', valign: 'middle', margin: 0,
  });
}

function addListadoSlide(
  pres: PptxGenJS,
  deck: PackDeck,
  page: PackDeckLine[],
  images: Array<PackedImage | null>,
  offset: number,
) {
  const slide = pres.addSlide();
  slide.background = { color: WHITE };
  addHeader(slide, deck, deck.labels.kicker);
  const startY = 1.32;
  const avail = 6.6 - startY - 0.3;
  const rowH = Math.min(1.88, avail / Math.max(page.length, 1));
  const photoH = Math.min(rowH - 0.1, 1.7);
  const photoW = page.length <= 3 ? 1.62 : page.length <= 6 ? 1.32 : 1.14;
  const cols = [
    { key: '#', w: 0.4 },
    { key: 'photo', w: photoW },
    { key: 'name', w: 0 },
    { key: 'ref', w: 1.52 },
    { key: 'fee', w: 1.48 },
    { key: 'club', w: 1.38 },
    { key: 'stamp', w: 1.26 },
    { key: 'pvp', w: 1.46 },
  ] as const;
  const used = cols.reduce((sum, col) => sum + col.w, 0);
  const widths = cols.map((col) => (col.key === 'name' ? 12.4 - used : col.w));
  let x = 0.46;
  const headerY = startY;
  cols.forEach((col, index) => {
    const label = col.key === '#' ? '#'
      : col.key === 'photo' ? ''
      : col.key === 'name' ? deck.labels.product
      : col.key === 'ref' ? deck.labels.adultRef.replace('adulto', '').replace('niño', '').trim() || 'Ref.'
      : col.key === 'fee' ? deck.labels.fee
      : col.key === 'club' ? deck.labels.club
      : col.key === 'stamp' ? deck.labels.stamp
      : 'PVP';
    slide.addText(label.toUpperCase(), {
      x, y: headerY, w: widths[index], h: 0.26,
      fontFace: 'Arial', fontSize: 9, color: MUTED, margin: 0,
      align: col.key === 'club' || col.key === 'stamp' || col.key === 'pvp' ? 'right' : 'left',
    });
    x += widths[index];
  });
  slide.addShape('rect', {
    x: 0.46, y: headerY + 0.28, w: 12.4, h: 0.01, fill: { color: LINE }, line: { color: LINE },
  });
  const nameSize = page.length <= 4 ? 14 : page.length <= 8 ? 12 : 11;
  page.forEach((line, index) => {
    const y = startY + 0.3 + index * rowH;
    slide.addShape('rect', {
      x: 0.46, y, w: 12.4, h: rowH,
      fill: { color: WHITE }, line: { color: WHITE },
    });
    slide.addShape('rect', {
      x: 0.46, y: y + rowH - 0.01, w: 12.4, h: 0.01, fill: { color: LINE }, line: { color: LINE },
    });
    let cx = 0.46;
    const cells: Array<{ text: string; w: number; align?: 'left' | 'right'; bold?: boolean; color?: string; size?: number }> = [
      { text: String(line.index), w: widths[0], color: MUTED, size: 10 },
      { text: '', w: widths[1] },
      { text: '', w: widths[2] },
      { text: line.ref || '—', w: widths[3], color: MUTED, size: 11 },
      { text: `${line.feeLabel} · ${line.ageLabel}`, w: widths[4], size: 11 },
      { text: euro(line.club, deck.locale), w: widths[5], align: 'right', bold: true },
      { text: euro(line.stamp, deck.locale), w: widths[6], align: 'right' },
      { text: euro(line.pvp, deck.locale), w: widths[7], align: 'right', color: MUTED },
    ];
    cells.forEach((cell) => {
      if (cell.text) {
        slide.addText(cell.text, {
          x: cx, y, w: cell.w, h: rowH,
          fontFace: 'Arial',
          fontSize: cell.size || 12,
          bold: Boolean(cell.bold),
          color: cell.color || INK,
          align: cell.align || 'left',
          valign: 'middle',
          margin: 0.05,
        });
      }
      cx += cell.w;
    });
    const nameParts = [
      { text: line.type, options: { fontFace: 'Arial', fontSize: 10, color: MUTED, bold: false, breakLine: true } },
      { text: line.name, options: { fontFace: 'Arial', fontSize: nameSize, color: INK, bold: true, breakLine: Boolean(line.colour) } },
    ];
    if (line.colour) {
      nameParts.push({ text: line.colour, options: { fontFace: 'Arial', fontSize: 11, color: MUTED, bold: false, breakLine: false } });
    }
    slide.addText(nameParts, {
      x: 0.46 + widths[0] + widths[1],
      y,
      w: widths[2] - 0.08,
      h: rowH,
      valign: 'middle',
      wrap: true,
      margin: 0.06,
    });
    const image = images[offset + index];
    const imgW = widths[1] - 0.12;
    const imgH = photoH;
    const photoX = 0.46 + widths[0] + (widths[1] - imgW) / 2;
    if (image) {
      slide.addImage({
        data: image.base64,
        x: photoX, y: y + (rowH - imgH) / 2, w: imgW, h: imgH,
        sizing: { type: 'contain', w: imgW, h: imgH },
      });
    }
  });
  addFooter(slide, deck);
}

export async function renderPackPptx(deck: PackDeck): Promise<Buffer> {
  const images = await loadImages(deck.lines);
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'PACK', width: 13.333, height: 7.5 });
  pres.layout = 'PACK';
  pres.title = deck.title;
  pres.author = 'Teamsports';
  pres.subject = 'Pack Tarifas';
  let offset = 0;
  chunk(deck.lines, 10).forEach((page) => {
    addListadoSlide(pres, deck, page, images, offset);
    offset += page.length;
  });
  const output = await pres.write({ outputType: 'nodebuffer' });
  return Buffer.from(output as Buffer);
}

function applyHeader(cell: ExcelJS.Cell, size = 10) {
  cell.font = { name: 'Calibri', size, color: { argb: 'FF737373' } };
  cell.alignment = { vertical: 'middle' };
}

export async function renderPackExcel(deck: PackDeck): Promise<Buffer> {
  const images = await loadImages(deck.lines);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teamsports';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(deck.title.slice(0, 31) || 'Pack', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 5 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = [
    { width: 12 },
    { width: 5 },
    { width: 16 },
    { width: 34 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 13 },
    { width: 14 },
    { width: 13 },
  ];

  sheet.mergeCells('A1:K1');
  sheet.getCell('A1').value = deck.labels.kicker.toUpperCase();
  applyHeader(sheet.getCell('A1'));
  sheet.getRow(1).height = 18;

  sheet.mergeCells('A2:K2');
  sheet.getCell('A2').value = deck.title;
  sheet.getCell('A2').font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF171717' } };
  sheet.getCell('A2').alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 28;

  sheet.mergeCells('A3:K3');
  sheet.getCell('A3').value = metaLine(deck);
  applyHeader(sheet.getCell('A3'));
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 10;

  const headers = [
    deck.labels.photo, '#', deck.labels.product, deck.labels.name, deck.labels.colour,
    deck.labels.adultRef, deck.labels.fee, deck.labels.club, deck.labels.stamp, deck.labels.fuera, 'PVP',
  ];
  const head = sheet.getRow(5);
  head.height = 22;
  headers.forEach((label, index) => {
    const cell = head.getCell(index + 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: index >= 7 ? 'right' : 'left',
    };
    cell.border = { right: { style: 'thin', color: { argb: 'FF2A2A2A' } } };
  });

  const moneyFmt = '#,##0.00 €';
  deck.lines.forEach((line, index) => {
    const rowIndex = 6 + index;
    const row = sheet.getRow(rowIndex);
    row.height = 52;
    const zebra = index % 2 === 1;
    const values: Array<string | number | null> = [
      '',
      line.index,
      line.type,
      line.name,
      line.colour,
      line.ref,
      `${line.feeLabel} · ${line.ageLabel}`,
      line.club,
      line.stamp || 0,
      line.fuera,
      line.pvp,
    ];
    values.forEach((value, col) => {
      const cell = row.getCell(col + 1);
      cell.value = value as ExcelJS.CellValue;
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF171717' }, bold: col === 3 || col === 7 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col >= 7 ? 'right' : col === 1 ? 'center' : 'left',
        wrapText: col === 3,
      };
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } };
      if (col >= 7 && col <= 10 && typeof value === 'number') cell.numFmt = moneyFmt;
    });
    const packed = images[index];
    if (packed) {
      const imageId = workbook.addImage({ buffer: packed.buffer as never, extension: packed.ext });
      sheet.addImage(imageId, {
        tl: { col: 0.12, row: rowIndex - 1 + 0.12 },
        ext: { width: 46, height: 46 },
        editAs: 'oneCell',
      });
    }
  });

  const totalsRow = 6 + deck.lines.length + 1;
  const box = sheet.getRow(totalsRow);
  box.height = 26;
  sheet.mergeCells(`A${totalsRow}:G${totalsRow}`);
  sheet.getCell(`A${totalsRow}`).value = deck.labels.total;
  sheet.getCell(`A${totalsRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${totalsRow}`).alignment = { vertical: 'middle' };
  sheet.getCell(`A${totalsRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
  const totalValues = [deck.totals.club, deck.totals.stamp, deck.totals.fuera, deck.totals.rrp];
  totalValues.forEach((value, index) => {
    const cell = box.getCell(8 + index);
    cell.value = value;
    cell.numFmt = moneyFmt;
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });

  const saleRow = totalsRow + 1;
  sheet.mergeCells(`A${saleRow}:G${saleRow}`);
  sheet.getCell(`A${saleRow}`).value = `${deck.labels.total} · ${deck.labels.vat}`;
  sheet.getCell(`A${saleRow}`).font = { name: 'Calibri', size: 11, color: { argb: 'FF737373' } };
  sheet.getCell(`H${saleRow}`).value = deck.totals.sale;
  sheet.getCell(`H${saleRow}`).numFmt = moneyFmt;
  sheet.getCell(`H${saleRow}`).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF171717' } };
  sheet.mergeCells(`I${saleRow}:K${saleRow}`);
  sheet.getCell(`I${saleRow}`).value = `${deck.labels.margin} ${formatPct(deck.totals.margin, deck.locale)}`;
  sheet.getCell(`I${saleRow}`).font = { name: 'Calibri', size: 11, color: { argb: 'FF737373' } };
  sheet.getCell(`I${saleRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
