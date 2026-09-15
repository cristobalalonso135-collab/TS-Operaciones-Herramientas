export const DEFAULT_NEW_AUTHOR = 'Cristóbal';
export const MEJORAS_AUTHORS = ['Cristóbal', 'Pablo'] as const;

export const MEJORA_MODULES = ['ERP', 'Web'] as const;
export const MEJORA_CHANNELS = ['Correo', 'Teams', 'Conversación', 'Excel', 'Otro'] as const;
export const MEJORA_STATUSES = ['Pendiente', 'En estudio', 'Aprobada', 'Descartada', 'Hecha'] as const;

export const DEFAULT_AREAS = ['Teamsports', 'B2B', 'Grassroots', 'Pro Clubs'];
export const DEFAULT_REQUESTERS = [
  'Cristóbal',
  'Santi Navarro',
  'Samu',
  'Juanjo',
  'Arturo',
  'Laguna',
  'Alberto Antequera',
  'Salinero',
  'Blanca',
  'Mario Ansini',
];

export type MejoraModule = (typeof MEJORA_MODULES)[number];
export type MejoraChannel = (typeof MEJORA_CHANNELS)[number];
export type MejoraStatus = (typeof MEJORA_STATUSES)[number];

export interface MejoraAttachment {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  addedAt: string;
}

export interface MejoraCase {
  id: string;
  registro: number;
  createdAt: string;
  requestedAt: string | null;
  year: number;
  area: string;
  module: MejoraModule | '';
  title: string;
  need: string;
  requester: string;
  addedBy: string;
  channel: MejoraChannel | '';
  informedBy: string;
  channelNote: string;
  status: MejoraStatus | '';
  comment: string;
  attachments: MejoraAttachment[];
}

export interface MejorasCatalogs {
  areas: string[];
  requesters: string[];
}

export interface MejorasState {
  cases: MejoraCase[];
  catalogs: MejorasCatalogs;
}

export const EMPTY_CATALOGS: MejorasCatalogs = {
  areas: [...DEFAULT_AREAS],
  requesters: [...DEFAULT_REQUESTERS],
};

export const EMPTY_MEJORAS_STATE: MejorasState = {
  cases: [],
  catalogs: EMPTY_CATALOGS,
};

export function todayIso(): string {
  const date = new Date();
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function displayDash(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function isUnknownValue(value: unknown): boolean {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim().toLocaleLowerCase('es');
  return !text
    || text === '-'
    || text === '—'
    || text === '–'
    || text === 'n/a'
    || text === 'na'
    || text === 's/n'
    || text === 'sin dato'
    || text === 'desconocido';
}

export function cellToIso(value: unknown): string | null {
  if (typeof value !== 'number' && isUnknownValue(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? '').trim();
  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (spanish) return toIsoDate(Number(spanish[3]), Number(spanish[2]), Number(spanish[1]));
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export function mergeCatalog(list: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  [...list, ...extra].forEach((item) => {
    const value = String(item || '').trim();
    if (!value) return;
    const key = value.toLocaleLowerCase('es');
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
}

export function asModule(value: unknown): MejoraModule | '' {
  if (isUnknownValue(value)) return '';
  const text = String(value ?? '').trim().toLocaleLowerCase('es');
  if (text === 'erp' || text === 'gestión' || text === 'gestion') return 'ERP';
  if (text === 'web') return 'Web';
  return '';
}

export function asChannel(value: unknown): MejoraChannel | '' {
  if (isUnknownValue(value)) return '';
  const text = String(value ?? '').trim();
  if ((MEJORA_CHANNELS as readonly string[]).includes(text)) return text as MejoraChannel;
  const key = text.toLocaleLowerCase('es');
  if (key === 'teams' || key === 'microsoft teams') return 'Teams';
  if (key === 'correo' || key === 'email' || key === 'mail') return 'Correo';
  if (key === 'conversación' || key === 'conversacion' || key === 'reunión' || key === 'reunion') return 'Conversación';
  if (key === 'excel') return 'Excel';
  if (key) return 'Otro';
  return '';
}

export function asStatus(value: unknown): MejoraStatus | '' {
  if (isUnknownValue(value)) return '';
  const text = String(value ?? '').trim();
  if ((MEJORA_STATUSES as readonly string[]).includes(text)) return text as MejoraStatus;
  return '';
}

export function nextRegistro(cases: MejoraCase[]): number {
  return cases.reduce((max, row) => Math.max(max, row.registro || 0), 0) + 1;
}

export function normalizeAttachments(value: unknown): MejoraAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<MejoraAttachment>;
    const dataUrl = String(row.dataUrl || '');
    if (!dataUrl.startsWith('data:')) return [];
    return [{
      id: String(row.id || crypto.randomUUID()),
      name: String(row.name || 'captura').trim() || 'captura',
      mime: String(row.mime || 'image/jpeg'),
      dataUrl,
      addedAt: String(row.addedAt || ''),
    }];
  });
}

export function mejoraRequiredGaps(row: {
  title?: string | null;
  area?: string | null;
  module?: string | null;
  need?: string | null;
  requester?: string | null;
  addedBy?: string | null;
  requestedAt?: string | null;
  status?: string | null;
  channel?: string | null;
}, options?: { forNew?: boolean }): string[] {
  const gaps: string[] = [];
  if (isUnknownValue(row.title)) gaps.push('Título');
  if (isUnknownValue(row.area)) gaps.push('Área');
  if (!asModule(row.module)) gaps.push('Módulo');
  if (isUnknownValue(row.need)) gaps.push('Necesidad');
  if (isUnknownValue(row.requester)) gaps.push('Solicitante');
  if (options?.forNew) {
    if (!String(row.requestedAt || '').trim()) gaps.push('Fecha de solicitud');
    if (!asStatus(row.status)) gaps.push('Estado');
    if (!asChannel(row.channel)) gaps.push('Canal');
  }
  return gaps;
}

export function formatRequiredGaps(gaps: string[]): string | null {
  if (gaps.length === 0) return null;
  if (gaps.length === 1) return `Falta ${gaps[0]}.`;
  return `Faltan: ${gaps.join(', ')}.`;
}

export function isOpenMejora(status: string): boolean {
  return status !== 'Descartada' && status !== 'Hecha';
}

export function mejorasNeedRewrite(state: Pick<MejorasState, 'cases'>): boolean {
  return state.cases.some((row) => {
    const raw = String(row.module || '');
    if (!raw) return false;
    const mapped = asModule(raw);
    return Boolean(mapped) && mapped !== raw;
  });
}

export function mejorasKpis(rows: MejoraCase[]) {
  const open = rows.filter((row) => isOpenMejora(row.status));
  return {
    total: rows.length,
    erp: rows.filter((row) => row.module === 'ERP').length,
    web: rows.filter((row) => row.module === 'Web').length,
    open: open.length,
  };
}
