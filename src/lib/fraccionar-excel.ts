import { parseAlbaranesSheet, parseColectivosSheet } from '@/lib/albaranes-excel';
import {
  cellToIso,
  formatIsoDate,
  normKey,
  splitColectivoCodes,
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

function isDataFooterRow(row: unknown[]): boolean {
  const text = (row || []).map((cell) => String(cell ?? '').replace(/\u00a0/g, ' ').trim()).join(' ');
  if (!text) return true;
  if (/filtros aplicados/i.test(text)) return true;
  const first = String(row?.[0] ?? '').replace(/\u00a0/g, ' ').trim();
  return /^total$/i.test(first);
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
  tsLiberable: number | null;
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
  const asRatio = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1 ? value / 100 : value;
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const hasPct = raw.includes('%');
    const normalized = raw.replace('%', '').trim();
    const num = normalized.includes(',') && normalized.includes('.')
      ? Number(normalized.replace(/\./g, '').replace(',', '.'))
      : Number(normalized.replace(',', '.'));
    if (!Number.isFinite(num)) return null;
    if (hasPct || num > 1) return num / 100;
    return num;
  };
  return rows.slice(start + 1).flatMap((row) => {
    if (isDataFooterRow(row)) return [];
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
      tsLiberable: asRatio(pick(row, col.ts)),
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
  tsLiberable: number | null;
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
  const findListed = (id: string) => byId.get(id) || byNumber.get(normKey(id));
  const resolveClubs = (codigo: string) => {
    const parts = splitColectivoCodes(codigo);
    const clubs: Colectivo[] = [];
    let missing = false;
    parts.forEach((part) => {
      const club = byCode.get(normKey(part));
      if (club) clubs.push(club);
      else missing = true;
    });
    return { clubs, missing };
  };
  const uniqueJoin = (values: Array<string | undefined>) => {
    const seen = new Set<string>();
    const out: string[] = [];
    values.forEach((value) => {
      const text = String(value || '').trim();
      if (!text) return;
      const key = text.toLocaleLowerCase('es');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out.join(', ');
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
    const { clubs, missing } = resolveClubs(codigo);
    let issue: FraccionarIssue | null = null;
    if (!codigo) issue = 'Sin código de colectivo';
    else if (missing || clubs.length === 0) issue = 'Colectivo desconocido';
    return {
      key: `${listed.id}-${index}`,
      idAlbaran: listed.id,
      albaran: listed.albaran,
      codigoColectivo: codigo,
      nombreColectivo: uniqueJoin(clubs.map((club) => club.nombre)),
      agente: uniqueJoin(clubs.map((club) => club.agente || club.idAgente)),
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

export function formatPercentEs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return `${(value * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function dash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

export type FraccionarCol = {
  key: string;
  label: string;
  viewLabel?: string;
  hideInView?: boolean;
  numeric?: boolean;
  width: number;
  min: number;
  max: number;
  excel: (row: FraccionarRow) => string | number;
  display: (row: FraccionarRow) => string;
};

export const FRACCIONAR_COLUMNS: FraccionarCol[] = [
  { key: 'medio', label: 'Medio de Venta', viewLabel: 'Medio', width: 110, min: 72, max: 360, excel: (row) => row.medio, display: (row) => dash(row.medio) },
  { key: 'zona', label: 'Zona', width: 88, min: 64, max: 280, excel: (row) => row.zona, display: (row) => dash(row.zona) },
  { key: 'albaran', label: 'Albarán', width: 160, min: 110, max: 360, excel: (row) => row.albaran, display: (row) => dash(row.albaran) },
  { key: 'fechaAlbaran', label: 'Fecha_albaran', viewLabel: 'F. alb', width: 86, min: 72, max: 220, excel: (row) => row.fechaAlbaran, display: (row) => dash(row.fechaAlbaran) },
  { key: 'fechaSalida', label: 'Fecha_informada_salida', viewLabel: 'F. salida', width: 86, min: 72, max: 260, excel: (row) => row.fechaSalida, display: (row) => dash(row.fechaSalida) },
  { key: 'estado', label: 'Estado', width: 78, min: 64, max: 220, excel: (row) => row.estado, display: (row) => dash(row.estado) },
  { key: 'diasRetraso', label: 'Días retraso', viewLabel: 'Retraso', numeric: true, width: 64, min: 52, max: 160, excel: (row) => row.diasRetraso, display: (row) => dash(row.diasRetraso) },
  { key: 'unidades', label: 'Unidades', viewLabel: '#', numeric: true, width: 44, min: 36, max: 120, excel: (row) => row.unidades ?? '', display: (row) => dash(row.unidades) },
  { key: 'udsBloqueadas', label: 'Uds bloqueadas', viewLabel: '# bloq', numeric: true, width: 56, min: 44, max: 140, excel: (row) => row.udsBloqueadas ?? '', display: (row) => dash(row.udsBloqueadas) },
  { key: 'udsLiberables', label: 'Uds liberables', viewLabel: '# lib', numeric: true, width: 56, min: 44, max: 140, excel: (row) => row.udsLiberables ?? '', display: (row) => dash(row.udsLiberables) },
  { key: 'tsLiberable', label: 'TS % liberable', viewLabel: '% lib', numeric: true, width: 64, min: 52, max: 160, excel: (row) => formatPercentEs(row.tsLiberable), display: (row) => formatPercentEs(row.tsLiberable) || '—' },
  { key: 'nombreColectivo', label: 'Nombre colectivo', viewLabel: 'Colectivo', width: 180, min: 110, max: 480, excel: (row) => row.nombreColectivo, display: (row) => dash(row.nombreColectivo) },
  { key: 'codigoColectivo', label: 'Código colectivo', hideInView: true, width: 120, min: 80, max: 240, excel: (row) => row.codigoColectivo, display: (row) => dash(row.codigoColectivo) },
  { key: 'agente', label: 'Agente', width: 140, min: 90, max: 360, excel: (row) => row.agente, display: (row) => dash(row.agente) },
  { key: 'issue', label: 'Incidencia', width: 160, min: 100, max: 520, excel: (row) => row.issue || '', display: (row) => row.issue || '' },
];

export const FRACCIONAR_VIEW_COLUMNS = FRACCIONAR_COLUMNS.filter((col) => !col.hideInView);

export function defaultFraccionarColumnWidths(): Record<string, number> {
  return Object.fromEntries(FRACCIONAR_COLUMNS.map((col) => [col.key, col.width]));
}

export function parseAlbaranesForFraccionar(rows: unknown[][]): AlbaranRow[] {
  return parseAlbaranesSheet(rows);
}

export function parseColectivosForFraccionar(rows: unknown[][]): Colectivo[] {
  return parseColectivosSheet(rows);
}

export function fraccionarToAoa(rows: FraccionarRow[]): unknown[][] {
  return [
    FRACCIONAR_COLUMNS.map((col) => col.label),
    ...rows.map((row) => FRACCIONAR_COLUMNS.map((col) => col.excel(row))),
  ];
}
