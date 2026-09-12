export const ABONOS_PEOPLE = ['Cristóbal Alonso', 'Pablo Laguna'] as const;
export const DEFAULT_NEW_AUTHOR = 'Cristóbal Alonso';

export const ABONO_ORIGINS = ['Puntual', 'Trade Term'] as const;
export const ABONO_STATUSES = ['Pendiente', 'Reclamado', 'Recibido parcialmente', 'Recibido', 'Cancelado'] as const;

export const DEFAULT_BRANDS = ['Adidas', 'Nike', 'Puma', 'Aneyron', 'Textprint'];
export const DEFAULT_TYPES = ['VIK Cash', 'Credit Notes', 'Fee Pro Clubs', 'Dto FRA', 'Off Invoice', 'Material gratuito', 'Otro'];
export const DEFAULT_AREAS = ['B2B', 'Grassroots', 'Pro Clubs', 'Teamsports'];
export const DEFAULT_TEAMS = [
  'General',
  'TODOS',
  'Mallorca',
  'Zaragoza',
  'Elche',
  'Norte',
  'Levante',
  'GAP Plan',
  'UCAM',
  'Kings League',
];

export type AbonoOrigin = (typeof ABONO_ORIGINS)[number];
export type AbonoStatus = (typeof ABONO_STATUSES)[number];
export type CatalogKind = 'brand' | 'type' | 'area' | 'team';

export interface AbonoCase {
  id: string;
  registro: number;
  createdAt: string;
  addedBy: string;
  dueDate: string | null;
  brand: string;
  type: string;
  area: string;
  teamMotivo: string;
  origin: AbonoOrigin;
  tradeTermId: string | null;
  informedBy: string;
  expectedAmount: number | null;
  status: AbonoStatus;
  nextReview: string | null;
  comment: string;
}

export interface AbonoReceipt {
  id: string;
  caseId: string;
  receivedAt: string;
  amount: number;
  reference: string;
  comment: string;
}

export interface TradeTerm {
  id: string;
  brand: string;
  name: string;
  compensation: string;
  triggerText: string;
  period: string;
  active: boolean;
  comment: string;
}

export interface AbonosCatalogs {
  brands: string[];
  types: string[];
  areas: string[];
  teams: string[];
}

export interface AbonosState {
  cases: AbonoCase[];
  receipts: AbonoReceipt[];
  tradeTerms: TradeTerm[];
  catalogs: AbonosCatalogs;
}

export interface AbonoComputed extends AbonoCase {
  receivedTotal: number;
  pending: number;
  overdueDays: number | null;
  reviewOverdue: boolean;
  tradeTermName: string | null;
}

export const EMPTY_CATALOGS: AbonosCatalogs = {
  brands: [...DEFAULT_BRANDS],
  types: [...DEFAULT_TYPES],
  areas: [...DEFAULT_AREAS],
  teams: [...DEFAULT_TEAMS],
};

export const EMPTY_ABONOS_STATE: AbonosState = {
  cases: [],
  receipts: [],
  tradeTerms: [],
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

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/\s/g, '').replace('€', '');
  if (!text) return null;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.includes(',')
      ? text.replace(',', '.')
      : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cellToIso(value: unknown): string | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value).trim();
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

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function receivedTotalFor(caseId: string, receipts: AbonoReceipt[]): number {
  return receipts
    .filter((receipt) => receipt.caseId === caseId)
    .reduce((sum, receipt) => sum + receipt.amount, 0);
}

export function pendingAmount(expectedAmount: number | null, receivedTotal: number): number {
  return Math.max(0, (expectedAmount ?? 0) - receivedTotal);
}

export function statusAfterReceipts(current: AbonoStatus, expectedAmount: number | null, receivedTotal: number): AbonoStatus {
  if (current === 'Cancelado') return current;
  const pending = pendingAmount(expectedAmount, receivedTotal);
  if (receivedTotal > 0 && pending <= 0.009) return 'Recibido';
  if (receivedTotal > 0 && pending > 0) return 'Recibido parcialmente';
  return current;
}

export function computeCase(row: AbonoCase, receipts: AbonoReceipt[], tradeTerms: TradeTerm[], today = todayIso()): AbonoComputed {
  const receivedTotal = receivedTotalFor(row.id, receipts);
  const pending = pendingAmount(row.expectedAmount, receivedTotal);
  const cancelled = row.status === 'Cancelado';
  const overdue = !cancelled && pending > 0 && !!row.dueDate && row.dueDate < today;
  const reviewOverdue = !cancelled && row.status !== 'Recibido' && !!row.nextReview && row.nextReview <= today;
  const term = tradeTerms.find((item) => item.id === row.tradeTermId) || null;
  return {
    ...row,
    receivedTotal,
    pending,
    overdueDays: overdue && row.dueDate ? daysBetween(row.dueDate, today) : null,
    reviewOverdue,
    tradeTermName: term?.name ?? null,
  };
}

export function computeAll(state: AbonosState, today = todayIso()): AbonoComputed[] {
  return state.cases.map((row) => computeCase(row, state.receipts, state.tradeTerms, today));
}

export function nextRegistro(cases: AbonoCase[]): number {
  return cases.reduce((max, row) => Math.max(max, row.registro), 0) + 1;
}

export function asOrigin(value: string): AbonoOrigin {
  return value === 'Trade Term' ? 'Trade Term' : 'Puntual';
}

export function asStatus(value: string): AbonoStatus {
  if (value === 'Reclamado' || value === 'Recibido parcialmente' || value === 'Recibido' || value === 'Cancelado') return value;
  return 'Pendiente';
}

export function attentionRows(rows: AbonoComputed[]): AbonoComputed[] {
  return [...rows]
    .filter((row) => row.status !== 'Cancelado' && row.status !== 'Recibido')
    .sort((a, b) => {
      const aOverdue = a.overdueDays ?? -1;
      const bOverdue = b.overdueDays ?? -1;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (a.reviewOverdue !== b.reviewOverdue) return Number(b.reviewOverdue) - Number(a.reviewOverdue);
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    })
    .slice(0, 12);
}

export const ADIDAS_SEED_TERMS: Omit<TradeTerm, 'id'>[] = [
  {
    brand: 'Adidas',
    name: 'H1 Data Sharing',
    compensation: '2% NSI',
    triggerText: 'Cumplimiento Data Sharing H1',
    period: 'JUL',
    active: true,
    comment: '',
  },
  {
    brand: 'Adidas',
    name: 'H2 Data Sharing',
    compensation: '2% NSI',
    triggerText: 'Cumplimiento Data Sharing H2',
    period: 'DIC',
    active: true,
    comment: '',
  },
  {
    brand: 'Adidas',
    name: '38% Market Share Grassroots',
    compensation: '2,5% NSI',
    triggerText: 'Market Share >38% (43% GS where ADI Regional Fed)',
    period: 'DIC',
    active: true,
    comment: '',
  },
  {
    brand: 'Adidas',
    name: '40% Market Share Grassroots',
    compensation: '2,5% NSI',
    triggerText: 'Market Share >40%',
    period: 'DIC',
    active: true,
    comment: '',
  },
];
