export interface ExportAttachment {
  name?: string;
  mime?: string;
  dataUrl?: string;
}

export interface ExportDocument {
  caseId: string;
  registro: number;
  fileName: string;
  path: string;
  originalName: string;
  bytes: Uint8Array;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const KNOWN_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'csv', 'txt', 'xls', 'xlsx', 'doc', 'docx']);

function extensionFor(item: ExportAttachment, dataUrl: string): string {
  const fromName = String(item.name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] || '';
  if (KNOWN_EXT.has(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  const mime = String(item.mime || '').toLowerCase();
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  const header = dataUrl.slice(5, dataUrl.indexOf(';') > 0 ? dataUrl.indexOf(';') : dataUrl.indexOf(','));
  return MIME_EXT[header.toLowerCase()] || 'bin';
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Documento sin datos.');
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1).replace(/\s/g, '');
  if (/;base64/i.test(meta)) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

export function documentsForExport(rows: Array<{ id: string; registro: number; attachments?: ExportAttachment[] }>): ExportDocument[] {
  const nextByRegistro = new Map<number, number>();
  const used = new Set<string>();
  const files: ExportDocument[] = [];

  rows.forEach((row) => {
    (row.attachments || []).forEach((item) => {
      const dataUrl = String(item.dataUrl || '');
      if (!dataUrl.startsWith('data:')) return;
      let bytes: Uint8Array;
      try {
        bytes = dataUrlToBytes(dataUrl);
      } catch {
        return;
      }
      if (!bytes.length) return;
      const order = (nextByRegistro.get(row.registro) || 0) + 1;
      nextByRegistro.set(row.registro, order);
      const ext = extensionFor(item, dataUrl);
      let fileName = `${row.registro}-${order}.${ext}`;
      let salt = 2;
      while (used.has(fileName)) {
        fileName = `${row.registro}-${order}-${salt}.${ext}`;
        salt += 1;
      }
      used.add(fileName);
      files.push({
        caseId: row.id,
        registro: row.registro,
        fileName,
        path: `documentos/${fileName}`,
        originalName: String(item.name || fileName).trim() || fileName,
        bytes,
      });
    });
  });

  return files;
}

export function documentLabelsByCase(files: ExportDocument[]): Map<string, string> {
  const grouped = new Map<string, string[]>();
  files.forEach((file) => {
    const names = grouped.get(file.caseId) || [];
    names.push(file.fileName);
    grouped.set(file.caseId, names);
  });
  const labels = new Map<string, string>();
  grouped.forEach((names, caseId) => {
    labels.set(caseId, names.join('; '));
  });
  return labels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

export function zipStored(files: Array<{ path: string; bytes: Uint8Array }>, now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(now);
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.path.replace(/\\/g, '/'));
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.bytes.length, true);
    view.setUint32(22, file.bytes.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.bytes.length, true);
    centralView.setUint32(24, file.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);

    parts.push(local, file.bytes);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  });

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  parts.forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  });
  centrals.forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  });
  out.set(end, cursor);
  return out;
}
