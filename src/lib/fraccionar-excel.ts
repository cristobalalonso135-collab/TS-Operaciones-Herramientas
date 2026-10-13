import { parseAlbaranesSheet, parseColectivosSheet } from '@/lib/albaranes-excel';
import {
  cellToIso,
  formatIsoDate,
  normKey,
  type AlbaranRow,
  type Colectivo,
} from '@/lib/albaranes-model';

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
}

function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatIsoDate(cellToIso(value));
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    return formatIsoDate(cellToIso(value)) || String(value);
  }
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function excelSerialFromDate(value: Date): string {
  const epoch = Date.UTC(1899, 11, 30);
  return String(Math.round((value.getTime() - epoch) / 86400000));
}

export function asAlbaranId(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getFullYear() > 2500 || value.getUTCFullYear() > 2500) return excelSerialFromDate(value);
    return String(value.getTime());
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d+(\.0+)?$/.test(text)) return String(Math.round(Number(text)));
  return text;
}

function findCol(header: string[], aliases: string[]): number | null {
  for (const alias of aliases) {
    const exact = header.findIndex((name) => name === alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const idx = header.findIndex((name) => name.includes(alias));
    if (idx >= 0) return idx;
  }
  return null;
}

export interface DataRow {
  idAlbaran: string;
  medio: string;
  zona: string;
  fechaAlbaran: string;
  fechaSalida: string;
  estado: string;
  diasRetraso: string;
  unidades: number | null;
  udsBloqueadas: number | null;
  udsLiberables: number | null;
  tsLiberable: string;
  raw: unknown[];
}

export function parseDataSheet(rows: unknown[][]): DataRow[] {
  if (!rows.length) return [];
  const headerIndex = rows.findIndex((row) => {
    const joined = (row || []).map(normalizeHeader).join(' | ');
    return joined.includes('albar');
  });
  const start = headerIndex >= 0 ? headerIndex : 0;
  const header = (rows[start] || []).map(normalizeHeader);
  const col = {
    id: findCol(header, ['id_albaran', 'id albaran', 'idalbaran', 'id']),
    medio: findCol(header, ['medio de venta', 'medio']),
    zona: findCol(header, ['zona']),
    fecha: findCol(header, ['fecha_albaran', 'fecha albarán', 'fecha albaran']),
    salida: findCol(header, ['fecha_informada_salida', 'fecha informada salida', 'fecha salida']),
    estado: findCol(header, ['estado']),
    retraso: findCol(header, ['días retraso', 'dias retraso', 'retraso']),
    unidades: findCol(header, ['unidades']),
    bloqueadas: findCol(header, ['uds bloqueadas', 'bloqueadas']),
    liberables: findCol(header, ['uds liberables', 'liberables']),
    ts: findCol(header, ['ts % liberable', 'liberable']),
  };
  const pick = (row: unknown[], index: number | null) => (index == null || index < 0 ? '' : row[index]);
  const asNum = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100000) return value;
    const text = String(value ?? '').trim().replace(',', '.');
    if (!text) return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  };
  return rows.slice(start + 1).flatMap((row) => {
    const idAlbaran = asAlbaranId(pick(row, col.id));
    if (!idAlbaran && !(row || []).some((cell) => cellText(cell))) return [];
    return [{
      idAlbaran,
      medio: cellText(pick(row, col.medio)),
      zona: cellText(pick(row, col.zona)),
      fechaAlbaran: formatIsoDate(cellToIso(pick(row, col.fecha))) || cellText(pick(row, col.fecha)),
      fechaSalida: formatIsoDate(cellToIso(pick(row, col.salida))) || cellText(pick(row, col.salida)),
      estado: cellText(pick(row, col.estado)),
      diasRetraso: cellText(pick(row, col.retraso)),
      unidades: asNum(pick(row, col.unidades)),
      udsBloqueadas: asNum(pick(row, col.bloqueadas)),
      udsLiberables: asNum(pick(row, col.liberables)),
      tsLiberable: cellText(pick(row, col.ts)),
      raw: row || [],
    }];
  });
}

export type FraccionarIssue = 'Sin albarán en el CSV' | 'Sin código de colectivo' | 'Colectivo desconocido';

export interface FraccionarRow {
  key: string;
  idAlbaran: string;
  albaran: string;
  codigoColectivo: string;
  nombreColectivo: string;
  agente: string;
  medio: string;
  zona: string;
  fechaAlbaran: string;
  fechaSalida: string;
  estado: string;
  diasRetraso: string;
  unidades: number | null;
  udsBloqueadas: number | null;
  udsLiberables: number | null;
  tsLiberable: string;
  issue: FraccionarIssue | null;
}

export function fraccionarJoin(
  data: DataRow[],
  albaranes: AlbaranRow[],
  colectivos: Colectivo[],
): FraccionarRow[] {
  const byId = new Map<string, AlbaranRow>();
  const byNumber = new Map<string, AlbaranRow>();
  albaranes.forEach((row) => {
    if (row.id) byId.set(String(row.id).trim(), row);
    if (row.albaran) byNumber.set(normKey(row.albaran), row);
  });
  const byCode = new Map<string, Colectivo>();
  colectivos.forEach((item) => {
    if (item.codigo) byCode.set(normKey(item.codigo), item);
  });
  const findListed = (id: string) => {
    const direct = byId.get(id) || byNumber.get(normKey(id));
    if (direct) return direct;
    if (!/^\d+$/.test(id)) return undefined;
    const n = Number(id);
    return byId.get(String(n + 1)) || byId.get(String(n - 1));
  };
  return data.map((row, index) => {
    const listed = findListed(row.idAlbaran);
    if (!listed) {
      return {
        key: `${row.idAlbaran || 'row'}-${index}`,
        idAlbaran: row.idAlbaran,
        albaran: '',
        codigoColectivo: '',
        nombreColectivo: '',
        agente: '',
        medio: row.medio,
        zona: row.zona,
        fechaAlbaran: row.fechaAlbaran,
        fechaSalida: row.fechaSalida,
        estado: row.estado,
        diasRetraso: row.diasRetraso,
        unidades: row.unidades,
        udsBloqueadas: row.udsBloqueadas,
        udsLiberables: row.udsLiberables,
        tsLiberable: row.tsLiberable,
        issue: 'Sin albarán en el CSV',
      };
    }
    const codigo = listed.colectivo.trim();
    const club = codigo ? byCode.get(normKey(codigo)) : undefined;
    let issue: FraccionarIssue | null = null;
    if (!codigo) issue = 'Sin código de colectivo';
    else if (!club) issue = 'Colectivo desconocido';
    return {
      key: `${listed.id}-${index}`,
      idAlbaran: listed.id,
      albaran: listed.albaran,
      codigoColectivo: codigo,
      nombreColectivo: club?.nombre || '',
      agente: club?.agente || '',
      medio: row.medio,
      zona: row.zona,
      fechaAlbaran: row.fechaAlbaran,
      fechaSalida: row.fechaSalida,
      estado: row.estado,
      diasRetraso: row.diasRetraso,
      unidades: row.unidades,
      udsBloqueadas: row.udsBloqueadas,
      udsLiberables: row.udsLiberables,
      tsLiberable: row.tsLiberable,
      issue,
    };
  });
}

export function parseAlbaranesForFraccionar(rows: unknown[][]): AlbaranRow[] {
  return parseAlbaranesSheet(rows);
}

export function parseColectivosForFraccionar(rows: unknown[][]): Colectivo[] {
  return parseColectivosSheet(rows);
}

export function fraccionarToAoa(rows: FraccionarRow[]): unknown[][] {
  return [
    [
      'Id_albaran',
      'Albarán',
      'Código colectivo',
      'Nombre colectivo',
      'Agente',
      'Medio de Venta',
      'Zona',
      'Fecha_albaran',
      'Fecha_informada_salida',
      'Estado',
      'Días retraso',
      'Unidades',
      'Uds bloqueadas',
      'Uds liberables',
      'TS % liberable',
      'Incidencia',
    ],
    ...rows.map((row) => [
      row.idAlbaran,
      row.albaran,
      row.codigoColectivo,
      row.nombreColectivo,
      row.agente,
      row.medio,
      row.zona,
      row.fechaAlbaran,
      row.fechaSalida,
      row.estado,
      row.diasRetraso,
      row.unidades ?? '',
      row.udsBloqueadas ?? '',
      row.udsLiberables ?? '',
      row.tsLiberable,
      row.issue || '',
    ]),
  ];
}
