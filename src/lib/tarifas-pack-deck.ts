import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { formatEuro, formatPct } from '@/lib/tarifas-model';
import type { PackDeck, PackDeckLine } from '@/lib/tarifas-pack-payload';

const INK = '171717';
const MUTED = '737373';
const LINE = 'E5E5E5';
const SOFT = 'FAFAFA';
const WHITE = 'FFFFFF';
const PVP_RED = 'B42318';
const PAGE = 'F3F2EE';
const CARD_LINE = 'E8E6E1';

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

function offerMeta(deck: PackDeck): string {
  return [
    deck.season || null,
    `${deck.totals.pieces} ${deck.labels.pieces}`,
    deck.labels.vat,
  ].filter(Boolean).join('   ·   ');
}

function showcaseGrid(count: number): { cols: number; rows: number } {
  if (count <= 5) return { cols: Math.max(count, 1), rows: 1 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 8) return { cols: 4, rows: 2 };
  if (count <= 10) return { cols: 5, rows: 2 };
  return { cols: 4, rows: 3 };
}

function addEscaparateSlide(
  pres: PptxGenJS,
  deck: PackDeck,
  page: PackDeckLine[],
  images: Array<PackedImage | null>,
  offset: number,
) {
  const slide = pres.addSlide();
  slide.background = { color: PAGE };
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.333, h: 0.58,
    fill: { color: INK }, line: { color: INK },
  });
  slide.addText('TEAMSPORTS', {
    x: 0.4, y: 0.16, w: 2.6, h: 0.26,
    fontFace: 'Arial', fontSize: 10, color: 'D4D4D4', charSpacing: 2.6, valign: 'middle', margin: 0,
  });
  slide.addText(offerMeta(deck), {
    x: 3.1, y: 0.16, w: 6.2, h: 0.26,
    fontFace: 'Arial', fontSize: 12, color: WHITE, valign: 'middle', margin: 0,
  });
  slide.addText(euro(deck.totals.sale, deck.locale), {
    x: 9.3, y: 0.12, w: 3.62, h: 0.34,
    fontFace: 'Arial', fontSize: 18, bold: true, color: WHITE, align: 'right', valign: 'middle', margin: 0,
  });

  const count = page.length;
  const { cols, rows } = showcaseGrid(count);
  const area = { x: 0.32, y: 0.74, w: 12.68, h: 6.22 };
  const gap = 0.12;
  const cardW = (area.w - gap * (cols - 1)) / cols;
  const cardH = (area.h - gap * (rows - 1)) / rows;
  const textH = rows === 3 ? 0.86 : 0.98;
  const photoS = Math.min(cardW - 0.18, cardH - textH - 0.28);
  const nameSize = rows === 1 ? 13 : rows === 2 ? 11 : 10;
  const clubSize = rows === 1 ? 18 : rows === 2 ? 15 : 13;

  page.forEach((line, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = area.x + col * (cardW + gap);
    const y = area.y + row * (cardH + gap);
    slide.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: WHITE },
      line: { color: CARD_LINE, width: 0.75 },
      rectRadius: 0.06,
    });
    slide.addText(String(line.index).padStart(2, '0'), {
      x: x + 0.1, y: y + 0.08, w: 0.5, h: 0.16,
      fontFace: 'Arial', fontSize: 8, color: MUTED, margin: 0,
    });
    const photoX = x + (cardW - photoS) / 2;
    const photoY = y + 0.26;
    const image = images[offset + index];
    if (image) {
      slide.addImage({
        data: image.base64,
        x: photoX, y: photoY, w: photoS, h: photoS,
        sizing: { type: 'contain', w: photoS, h: photoS },
      });
    }
    const textY = photoY + photoS + 0.06;
    slide.addText(line.name, {
      x: x + 0.1, y: textY, w: cardW - 0.2, h: rows === 3 ? 0.26 : 0.3,
      fontFace: 'Arial', fontSize: nameSize, bold: true, color: INK,
      align: 'left', valign: 'top', wrap: true, margin: 0,
    });
    slide.addText(line.colour || ' ', {
      x: x + 0.1, y: textY + (rows === 3 ? 0.24 : 0.28), w: cardW - 0.2, h: 0.16,
      fontFace: 'Arial', fontSize: 9, color: MUTED, align: 'left', margin: 0,
    });
    slide.addText([
      { text: `${euro(line.pvp, deck.locale)}   `, options: { fontFace: 'Arial', fontSize: 10, color: PVP_RED, strike: true } },
      { text: euro(line.lineTotal ?? line.club, deck.locale), options: { fontFace: 'Arial', fontSize: clubSize, bold: true, color: INK } },
    ], {
      x: x + 0.1, y: textY + (rows === 3 ? 0.4 : 0.46), w: cardW - 0.2, h: 0.32,
      valign: 'middle', margin: 0,
    });
  });

  slide.addShape('rect', {
    x: 0, y: 7.08, w: 13.333, h: 0.42,
    fill: { color: INK }, line: { color: INK },
  });
  slide.addText(deck.title, {
    x: 0.4, y: 7.14, w: 8.2, h: 0.3,
    fontFace: 'Arial', fontSize: 13, color: WHITE, valign: 'middle', margin: 0,
  });
  slide.addText(euro(deck.totals.sale, deck.locale), {
    x: 8.8, y: 7.14, w: 4.12, h: 0.3,
    fontFace: 'Arial', fontSize: 16, bold: true, color: WHITE, align: 'right', valign: 'middle', margin: 0,
  });
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
  chunk(deck.lines, 12).forEach((page) => {
    addEscaparateSlide(pres, deck, page, images, offset);
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
