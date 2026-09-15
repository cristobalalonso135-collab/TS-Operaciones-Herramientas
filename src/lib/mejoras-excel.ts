import {
  asChannel,
  asModule,
  asStatus,
  formatRequiredGaps,
  mejoraRequiredGaps,
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
  informedBy: number | null;
  channelNote: number | null;
  status: number | null;
  comment: number | null;
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
  informedBy: string;
  channelNote: string;
  status: string;
  comment: string;
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
  informedBy: ['persona'],
  channelNote: ['detalle del canal', 'cómo me lo pasaron', 'como me lo pasaron'],
  status: ['estado'],
  comment: ['comentario', 'comentarios'],
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
    informedBy: find(HEADER_ALIASES.informedBy),
    channelNote: find(HEADER_ALIASES.channelNote),
    status: find(HEADER_ALIASES.status),
    comment: find(HEADER_ALIASES.comment),
  };
}

export function importPreviewError(row: Pick<ImportPreviewRow, 'title' | 'area' | 'module' | 'need' | 'requester'>): string | null {
  return formatRequiredGaps(mejoraRequiredGaps({
    title: row.title,
    area: row.area,
    module: row.module,
    need: row.need,
    requester: row.requester,
    addedBy: 'Cristóbal',
    requestedAt: 'ok',
    status: 'Pendiente',
  }));
}

export function buildImportPreview(rows: unknown[][], map: ImportColumnMap, headerIndex: number): ImportPreviewRow[] {
  return rows.slice(headerIndex + 1)
    .map((row, index) => {
      const area = cellText(pick(row, map.area));
      const module = cellText(pick(row, map.module));
      const need = cellText(pick(row, map.need));
      const requester = cellText(pick(row, map.requester));
      const title = cellText(pick(row, map.title)) || shortTitleFromNeed(need);
      if (!area && !module && !need && !requester) return null;
      const preview: ImportPreviewRow = {
        key: `import-${index}`,
        area,
        module,
        title,
        need,
        requester,
        requestedAt: cellText(pick(row, map.requestedAt)) || null,
        channel: cellText(pick(row, map.channel)),
        informedBy: cellText(pick(row, map.informedBy)),
        channelNote: cellText(pick(row, map.channelNote)),
        status: cellText(pick(row, map.status)),
        comment: cellText(pick(row, map.comment)),
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
    year: 2027,
    area: row.area,
    module: asModule(row.module),
    title: row.title,
    need: row.need,
    requester: row.requester,
    addedBy: 'Cristóbal',
    channel: asChannel(row.channel),
    informedBy: row.informedBy,
    channelNote: row.channelNote,
    status: asStatus(row.status) || 'Pendiente',
    comment: row.comment,
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
  'Persona',
  'Detalle del canal',
  'Estado',
  'Comentario',
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
    'Añadido por',
    'Canal',
    'Persona',
    'Detalle del canal',
    'Estado',
    'Comentario',
    'Adjuntos',
  ];
  const body = cases.map((row) => [
    row.registro,
    row.title,
    row.area,
    row.module,
    row.need,
    row.requester,
    row.requestedAt || '',
    row.addedBy,
    row.channel,
    row.informedBy,
    row.channelNote,
    row.status,
    row.comment,
    row.attachments.length,
  ]);
  return [header, ...body];
}
