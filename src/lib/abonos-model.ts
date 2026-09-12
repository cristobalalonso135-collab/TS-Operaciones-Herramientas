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
  origin: AbonoOrigin | '';
  tradeTermId: string | null;
  informedBy: string;
  expectedAmount: number | null;
  status: AbonoStatus | '';
  nextReview: string | null;
  comment: string;
  dueDateUnknown: boolean;
}

export interface AbonoReceipt {
  id: string;
  caseId: string;
  receivedAt: string;
  amount: number;
  reference: string;
  comment: string;
}

export interface AbonoClaim {
  id: string;
  caseId: string;
  claimedAt: string;
  kind: 'reclamar' | 'seguir';
  note: string;
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
  claims: AbonoClaim[];
  tradeTerms: TradeTerm[];
  catalogs: AbonosCatalogs;
}

export interface AbonoComputed extends AbonoCase {
  receivedTotal: number;
  pending: number;
  overdueDays: number | null;
  reviewOverdue: boolean;
  tradeTermName: string | null;
  pay1Date: string | null;
  pay1Amount: number | null;
  pay2Date: string | null;
  pay2Amount: number | null;
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
  claims: [],
  tradeTerms: [],
  catalogs: EMPTY_CATALOGS,
};

export function todayIso(): string {
  const date = new Date();
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function startOfWeekMonday(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const weekday = date.getDay();
  const sinceMonday = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - sinceMonday);
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

export function caseLabel(row: { brand: string; area: string; teamMotivo: string }): string {
  return [row.brand, row.area, row.teamMotivo].map((value) => displayDash(value)).join(' · ');
}

export function displayDash(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || '—';
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

export function receiptsForCase(receipts: AbonoReceipt[], caseId: string): AbonoReceipt[] {
  return receipts
    .filter((receipt) => receipt.caseId === caseId)
    .sort((a, b) => {
      const dateDiff = (a.receivedAt || '').localeCompare(b.receivedAt || '');
      return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
    });
}

export function receivedTotalFor(caseId: string, receipts: AbonoReceipt[]): number {
  return receiptsForCase(receipts, caseId).reduce((sum, receipt) => sum + receipt.amount, 0);
}

export function paymentSlots(receipts: AbonoReceipt[], caseId: string): {
  pay1Date: string | null;
  pay1Amount: number | null;
  pay2Date: string | null;
  pay2Amount: number | null;
} {
  const list = receiptsForCase(receipts, caseId);
  return {
    pay1Date: list[0]?.receivedAt || null,
    pay1Amount: list[0] ? list[0].amount : null,
    pay2Date: list[1]?.receivedAt || null,
    pay2Amount: list[1] ? list[1].amount : null,
  };
}

export function pendingAmount(expectedAmount: number | null, receivedTotal: number): number {
  return Math.max(0, (expectedAmount ?? 0) - receivedTotal);
}

export function statusAfterReceipts(current: AbonoStatus | '', expectedAmount: number | null, receivedTotal: number): AbonoStatus | '' {
  if (current === 'Cancelado') return current;
  const pending = pendingAmount(expectedAmount, receivedTotal);
  if (receivedTotal > 0 && pending <= 0.009) return 'Recibido';
  if (receivedTotal > 0 && pending > 0) return 'Recibido parcialmente';
  return current;
}

export function computeCase(row: AbonoCase, receipts: AbonoReceipt[], tradeTerms: TradeTerm[], today = todayIso()): AbonoComputed {
  const receivedTotal = receivedTotalFor(row.id, receipts);
  const pending = pendingAmount(row.expectedAmount, receivedTotal);
  const closed = row.status === 'Recibido' || row.status === 'Cancelado';
  const overdue = !closed && pending > 0 && !!row.dueDate && row.dueDate < today;
  const reviewOverdue = !closed && pending > 0 && !!row.nextReview && row.nextReview <= today;
  const term = tradeTerms.find((item) => item.id === row.tradeTermId) || null;
  const payments = paymentSlots(receipts, row.id);
  return {
    ...row,
    receivedTotal,
    pending,
    overdueDays: overdue && row.dueDate ? daysBetween(row.dueDate, today) : null,
    reviewOverdue,
    tradeTermName: term?.name ?? null,
    ...payments,
  };
}

export function computeAll(state: AbonosState, today = todayIso()): AbonoComputed[] {
  return state.cases.map((row) => computeCase(row, state.receipts, state.tradeTerms, today));
}

export function nextRegistro(cases: AbonoCase[]): number {
  return cases.reduce((max, row) => Math.max(max, row.registro), 0) + 1;
}

export function asOrigin(value: string): AbonoOrigin | '' {
  return value === 'Trade Term' || value === 'Puntual' ? value : '';
}

export function asStatus(value: string): AbonoStatus | '' {
  if (value === 'Pendiente' || value === 'Reclamado' || value === 'Recibido parcialmente' || value === 'Recibido' || value === 'Cancelado') return value;
  return '';
}

export function attentionRows(rows: AbonoComputed[]): AbonoComputed[] {
  return myOpenQueue(rows).slice(0, 12);
}

export function isMyAbono(addedBy: string): boolean {
  const name = addedBy.trim().toLocaleLowerCase('es');
  return name.startsWith('cristóbal') || name.startsWith('cristobal');
}

export function myOpenQueue(rows: AbonoComputed[]): AbonoComputed[] {
  return [...rows]
    .filter((row) => isMyAbono(row.addedBy) && row.status !== 'Recibido' && row.status !== 'Cancelado')
    .sort((a, b) => {
      if ((a.overdueDays ?? -1) !== (b.overdueDays ?? -1)) return (b.overdueDays ?? -1) - (a.overdueDays ?? -1);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.registro - b.registro;
    });
}

export type WeeklyTaskKind = 'reclamar' | 'seguir' | 'cobro' | 'fecha';

export interface WeeklyTask {
  id: string;
  kind: WeeklyTaskKind;
  title: string;
  reason: string;
  actionLabel: string;
  row: AbonoComputed;
}

function stillOpen(row: AbonoComputed): boolean {
  return isMyAbono(row.addedBy) && row.status !== 'Recibido' && row.status !== 'Cancelado' && row.pending > 0.009;
}

export function weeklyTasks(rows: AbonoComputed[], today = todayIso()): WeeklyTask[] {
  const tasks: WeeklyTask[] = [];
  myOpenQueue(rows).forEach((row) => {
    if (!stillOpen(row)) return;
    const reviewDue = !!row.nextReview && row.nextReview <= today;
    const noReview = !row.nextReview;

    if (row.dueDate && row.dueDate < today && row.status !== 'Reclamado') {
      tasks.push({
        id: `reclamar-${row.id}`,
        kind: 'reclamar',
        title: 'Reclamar',
        reason: `Previsto ${formatIsoDate(row.dueDate)}${row.overdueDays ? ` · ${row.overdueDays} días` : ''}.`,
        actionLabel: 'He reclamado',
        row,
      });
      return;
    }

    if (row.status === 'Reclamado' && (reviewDue || noReview)) {
      tasks.push({
        id: `seguir-${row.id}`,
        kind: 'seguir',
        title: 'Seguir reclamando',
        reason: reviewDue ? `Toca revisar (próxima revisión ${formatIsoDate(row.nextReview)}).` : 'Está reclamado y no tiene próxima revisión.',
        actionLabel: 'Sigo en ello',
        row,
      });
      return;
    }

    if (row.status === 'Recibido parcialmente' && (!row.dueDate || row.dueDate >= today)) {
      tasks.push({
        id: `cobro-${row.id}`,
        kind: 'cobro',
        title: 'Comprobar cobro',
        reason: 'Entró una parte. Mira si ha llegado el resto.',
        actionLabel: 'Abrir ficha',
        row,
      });
      return;
    }

    if (!row.dueDate) {
      tasks.push({
        id: `fecha-${row.id}`,
        kind: 'fecha',
        title: 'Poner fecha prevista',
        reason: 'Sin fecha no sé cuándo reclamártelo.',
        actionLabel: 'Abrir ficha',
        row,
      });
    }
  });

  const order: WeeklyTaskKind[] = ['reclamar', 'seguir', 'cobro', 'fecha'];
  return tasks.sort((a, b) => {
    const kindDiff = order.indexOf(a.kind) - order.indexOf(b.kind);
    if (kindDiff !== 0) return kindDiff;
    return (b.row.pending || 0) - (a.row.pending || 0);
  });
}

export const WEEKLY_TASK_ORDER: WeeklyTaskKind[] = ['reclamar', 'seguir', 'cobro', 'fecha'];

export const WEEKLY_TASK_META: Record<WeeklyTaskKind, { title: string; hint: string; bulkLabel: string | null }> = {
  reclamar: { title: 'Reclamar', hint: 'La fecha prevista ya pasó y todavía no está reclamado.', bulkLabel: 'He reclamado todos' },
  seguir: { title: 'Seguir reclamando', hint: 'Están reclamados y toca revisar.', bulkLabel: 'Sigo en ello todos' },
  cobro: { title: 'Comprobar cobro', hint: 'Entró una parte. Mira si ha llegado el resto.', bulkLabel: null },
  fecha: { title: 'Poner fecha prevista', hint: 'Sin fecha. Ábrela y ponla si la tienes.', bulkLabel: null },
};

export interface WeeklyTaskGroup {
  kind: WeeklyTaskKind;
  title: string;
  hint: string;
  bulkLabel: string | null;
  tasks: WeeklyTask[];
  pending: number;
}

export function groupWeeklyTasks(tasks: WeeklyTask[]): WeeklyTaskGroup[] {
  return WEEKLY_TASK_ORDER
    .map((kind) => {
      const list = tasks.filter((task) => task.kind === kind);
      return {
        kind,
        title: WEEKLY_TASK_META[kind].title,
        hint: WEEKLY_TASK_META[kind].hint,
        bulkLabel: WEEKLY_TASK_META[kind].bulkLabel,
        tasks: list,
        pending: list.reduce((sum, task) => sum + task.row.pending, 0),
      };
    })
    .filter((group) => group.tasks.length > 0);
}

export function claimsForCase(claims: AbonoClaim[], caseId: string): AbonoClaim[] {
  return [...claims]
    .filter((claim) => claim.caseId === caseId)
    .sort((a, b) => {
      const dateDiff = b.claimedAt.localeCompare(a.claimedAt);
      return dateDiff !== 0 ? dateDiff : b.id.localeCompare(a.id);
    });
}

export function makeClaim(caseId: string, kind: 'reclamar' | 'seguir', note = '', claimedAt = todayIso()): AbonoClaim {
  return {
    id: crypto.randomUUID(),
    caseId,
    kind,
    note: note.trim(),
    claimedAt,
  };
}

export function claimKindLabel(kind: AbonoClaim['kind']): string {
  return kind === 'seguir' ? 'Seguimiento' : 'Reclamación';
}

export interface CashWeek {
  id: string;
  label: string;
  start: string;
  end: string;
  rows: AbonoComputed[];
  pending: number;
}

export interface CashBrand {
  brand: string;
  pending: number;
  count: number;
}

export interface UpcomingCash {
  weeks: CashWeek[];
  brands: CashBrand[];
  pending: number;
  count: number;
}

export function upcomingCash(rows: AbonoComputed[], today = todayIso()): UpcomingCash {
  const weekStart = startOfWeekMonday(today);
  const weeks: CashWeek[] = Array.from({ length: 4 }, (_, index) => {
    const start = addDaysIso(weekStart, index * 7);
    const end = addDaysIso(start, 6);
    return {
      id: `w${index}`,
      label: index === 0 ? 'Esta semana' : `+${index} sem.`,
      start,
      end,
      rows: [] as AbonoComputed[],
      pending: 0,
    };
  });
  const horizon = weeks[weeks.length - 1].end;
  const open = rows.filter((row) => (
    row.pending > 0.009
    && row.status !== 'Cancelado'
    && row.status !== 'Recibido'
    && !!row.dueDate
    && row.dueDate >= weekStart
    && row.dueDate <= horizon
  ));

  weeks.forEach((week) => {
    week.rows = open
      .filter((row) => row.dueDate! >= week.start && row.dueDate! <= week.end)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.registro - b.registro);
    week.pending = week.rows.reduce((sum, row) => sum + row.pending, 0);
  });

  const brandMap = new Map<string, CashBrand>();
  open.forEach((row) => {
    const brand = row.brand.trim() || '—';
    const current = brandMap.get(brand) || { brand, pending: 0, count: 0 };
    current.pending += row.pending;
    current.count += 1;
    brandMap.set(brand, current);
  });

  return {
    weeks,
    brands: Array.from(brandMap.values()).sort((a, b) => b.pending - a.pending),
    pending: open.reduce((sum, row) => sum + row.pending, 0),
    count: open.length,
  };
}

export function abonosHubKpis(rows: AbonoComputed[], today = todayIso()) {
  const open = rows.filter((row) => row.status !== 'Recibido' && row.status !== 'Cancelado' && row.pending > 0.009);
  const overdue = open.filter((row) => row.overdueDays !== null);
  const claim = weeklyTasks(rows, today).filter((task) => task.kind === 'reclamar' || task.kind === 'seguir');
  return {
    openCount: open.length,
    pending: open.reduce((sum, row) => sum + row.pending, 0),
    overdue: overdue.reduce((sum, row) => sum + row.pending, 0),
    overdueCount: overdue.length,
    claimCount: claim.length,
    claimPending: claim.reduce((sum, task) => sum + task.row.pending, 0),
  };
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
