import {
  asChannel,
  asModule,
  asStatus,
  cellToIso,
  formatIsoDate,
  formatRequiredGaps,
  isUnknownValue,
  mejoraRequiredGaps,
  yearFromDates,
  type MejoraCase,
} from '@/lib/mejoras-model';

export interface ImportColumnMap {
  area: number | null;
  module: number | null;
  need: number | null;
  requester: number | null;
  title: number | null;
  requestedAt: number | null;
  channel: number | null;
  channelNote: number | null;
  status: number | null;
}

export interface ImportPreviewRow {
  key: string;
  area: string;
  module: string;
  title: string;
  need: string;
  requester: string;
  requestedAt: string | null;
  channel: string;
  channelNote: string;
  status: string;
  error: string | null;
}

const HEADER_ALIASES: Record<keyof ImportColumnMap, string[]> = {
  area: ['área', 'area'],
  module: ['módulo', 'modulo'],
  need: ['necesidad', 'descripción', 'descripcion', 'mejora'],
  requester: ['solicitante'],
  title: ['título', 'titulo'],
  requestedAt: ['fecha de solicitud', 'fecha de introducción', 'fecha de introduccion', 'fecha'],
  channel: ['canal'],
  channelNote: ['detalle del canal', 'cómo me lo pasaron', 'como me lo pasaron'],
  status: ['estado'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
}

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function pick(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) return '';
  return row[index];
}

function shortTitleFromNeed(need: string): string {
  const first = need.split(/[\n.]/)[0]?.trim() || need.trim();
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}

export function detectMejorasHeaderRow(rows: unknown[][]): number {
  const index = rows.findIndex((row) => {
    const joined = (row || []).map(normalizeHeader).join(' | ');
    return joined.includes('necesidad') || (joined.includes('módulo') || joined.includes('modulo')) && joined.includes('solicitante');
  });
  return index >= 0 ? index : 0;
}

export function guessColumnMap(header: unknown[]): ImportColumnMap {
  const normalized = header.map(normalizeHeader);
  const find = (keys: string[]) => {
    const index = normalized.findIndex((name) => keys.some((key) => name === key || name.includes(key)));
    return index >= 0 ? index : null;
  };
  return {
    area: find(HEADER_ALIASES.area),
    module: find(HEADER_ALIASES.module),
    need: find(HEADER_ALIASES.need),
    requester: find(HEADER_ALIASES.requester),
    title: find(HEADER_ALIASES.title),
    requestedAt: find(HEADER_ALIASES.requestedAt),
    channel: find(HEADER_ALIASES.channel),
    channelNote: find(HEADER_ALIASES.channelNote),
    status: find(HEADER_ALIASES.status),
  };
}

export function importPreviewError(row: Pick<ImportPreviewRow, 'title' | 'area' | 'module' | 'need' | 'requester'>): string | null {
  return formatRequiredGaps(mejoraRequiredGaps({
    title: row.title,
    area: row.area,
    module: row.module,
    need: row.need,
    requester: row.requester,
  }, 'import'));
}

export function buildImportPreview(rows: unknown[][], map: ImportColumnMap, headerIndex: number): ImportPreviewRow[] {
  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const area = cellText(pick(row, map.area));
      const module = cellText(pick(row, map.module));
      const need = cellText(pick(row, map.need));
      const requesterRaw = cellText(pick(row, map.requester));
      const requester = isUnknownValue(requesterRaw) ? 'Sin asignar' : requesterRaw;
      const titleRaw = cellText(pick(row, map.title));
      const title = titleRaw || shortTitleFromNeed(need);
      if (isUnknownValue(area) && isUnknownValue(module) && isUnknownValue(need) && isUnknownValue(requesterRaw) && isUnknownValue(titleRaw)) return null;
      const preview: ImportPreviewRow = {
        key: `import-${index}`,
        area,
        module,
        title,
        need,
        requester,
        requestedAt: cellToIso(pick(row, map.requestedAt)),
        channel: cellText(pick(row, map.channel)),
        channelNote: isUnknownValue(pick(row, map.channelNote)) ? '' : cellText(pick(row, map.channelNote)),
        status: cellText(pick(row, map.status)),
        error: null,
      };
      preview.error = importPreviewError(preview);
      return preview;
    })
    .filter((row): row is ImportPreviewRow => Boolean(row));
}

export function previewToRecords(rows: ImportPreviewRow[]): MejoraCase[] {
  return rows.filter((row) => !row.error).map((row, index) => ({
    id: crypto.randomUUID(),
    registro: index + 1,
    createdAt: new Date().toISOString(),
    requestedAt: row.requestedAt,
    year: yearFromDates(row.requestedAt, new Date().toISOString()),
    area: row.area,
    module: asModule(row.module),
    title: row.title,
    need: row.need,
    requester: row.requester,
    addedBy: 'Cristóbal',
    channel: asChannel(row.channel),
    informedBy: '',
    channelNote: row.channelNote,
    status: asStatus(row.status) || 'Pendiente',
    comment: '',
    attachments: [],
  }));
}

export const MEJORAS_TEMPLATE_HEADERS = [
  'Área',
  'Módulo',
  'Título',
  'Necesidad',
  'Solicitante',
  'Fecha de solicitud',
  'Canal',
  'Detalle del canal',
  'Estado',
];

export function mejorasTemplateRows(): unknown[][] {
  return [MEJORAS_TEMPLATE_HEADERS, Array(MEJORAS_TEMPLATE_HEADERS.length).fill('')];
}

export function mejorasExportRows(cases: MejoraCase[]): unknown[][] {
  const header = [
    'Registro',
    'Título',
    'Área',
    'Módulo',
    'Necesidad',
    'Solicitante',
    'Fecha de solicitud',
    'Canal',
    'Detalle del canal',
    'Estado',
    'Documentos',
    'Nº documentos',
    'Fecha de registro',
  ];
  const sorted = [...cases].sort((a, b) => (a.registro || 0) - (b.registro || 0));
  const body = sorted.map((row) => [
    row.registro,
    row.title || '',
    row.area || '',
    row.module || '',
    row.need || '',
    row.requester || '',
    row.requestedAt ? formatIsoDate(row.requestedAt) : '',
    row.channel || '',
    row.channelNote || '',
    row.status || '',
    row.attachments.map((item) => item.name).filter(Boolean).join(', '),
    row.attachments.length,
    row.createdAt ? formatIsoDate(row.createdAt.slice(0, 10)) : '',
  ]);
  return [header, ...body];
}
