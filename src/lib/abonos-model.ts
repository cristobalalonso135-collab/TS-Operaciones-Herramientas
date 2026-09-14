export const ABONOS_PEOPLE = ['Cristóbal', 'Pablo'] as const;
export const DEFAULT_NEW_AUTHOR = 'Cristóbal';

export const ABONO_ORIGINS = ['Puntual', 'Acuerdo'] as const;
export const ABONO_SOURCES = ['Correo', 'Teams', 'Conversación', 'Excel', 'Otro'] as const;
export const ABONO_STATUSES = ['Pendiente', 'Pago comunicado', 'Liquidado parcialmente', 'Liquidado'] as const;

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
export type AbonoSource = (typeof ABONO_SOURCES)[number];
export type AbonoStatus = (typeof ABONO_STATUSES)[number];
export type CatalogKind = 'brand' | 'type' | 'area' | 'team';

export interface AbonoCase {
  id: string;
  registro: number;
  createdAt: string;
  addedBy: string;
  responsible: string;
  dueDate: string | null;
  brand: string;
  type: string;
  area: string;
  teamMotivo: string;
  origin: AbonoOrigin | '';
  source: AbonoSource | '';
  tradeTermId: string | null;
  informedBy: string;
  expectedAmount: number | null;
  communicatedAmount: number | null;
  status: AbonoStatus | '';
  nextReview: string | null;
  comment: string;
  attachments: AbonoAttachment[];
}

export interface AbonoAttachment {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  addedAt: string;
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
  kind: 'reclamar' | 'seguir' | 'respuesta';
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

export function taskName(row: { brand: string; type?: string; area: string; teamMotivo: string; comment?: string }): string {
  const comment = String(row.comment || '').trim();
  if (comment) return comment;
  const team = String(row.teamMotivo || '').trim();
  if (team) return team;
  return caseLabel(row);
}

export function displayDash(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function shortPersonName(value: string | null | undefined): string {
  const name = String(value ?? '').trim();
  if (!name) return '';
  const key = name.toLocaleLowerCase('es');
  if (key.startsWith('cristóbal') || key.startsWith('cristobal')) return 'Cristóbal';
  if (key.startsWith('pablo')) return 'Pablo';
  return name;
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
  if (expectedAmount === null) {
    if (receivedTotal > 0) return 'Liquidado parcialmente';
    return current === 'Pago comunicado' ? current : 'Pendiente';
  }
  const pending = pendingAmount(expectedAmount, receivedTotal);
  if (receivedTotal > 0 && pending <= 0.009) return 'Liquidado';
  if (receivedTotal > 0 && pending > 0) return 'Liquidado parcialmente';
  return current === 'Pago comunicado' ? current : 'Pendiente';
}

export function computeCase(row: AbonoCase, receipts: AbonoReceipt[], tradeTerms: TradeTerm[], today = todayIso()): AbonoComputed {
  const recordedTotal = receivedTotalFor(row.id, receipts);
  const receivedTotal = row.status === 'Liquidado' && row.expectedAmount !== null
    ? Math.max(recordedTotal, row.expectedAmount)
    : recordedTotal;
  const pending = pendingAmount(row.expectedAmount, receivedTotal);
  const closed = row.status === 'Liquidado';
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
  if (value === 'Puntual') return value;
  if (value === 'Acuerdo' || value === 'Trade Term') return 'Acuerdo';
  return '';
}

export function asSource(value: string): AbonoSource | '' {
  const text = value.trim();
  if ((ABONO_SOURCES as readonly string[]).includes(text)) return text as AbonoSource;
  const key = text.toLocaleLowerCase('es');
  if (key.includes('correo') || key.includes('mail') || key.includes('email')) return 'Correo';
  if (key.includes('teams')) return 'Teams';
  if (key.includes('excel')) return 'Excel';
  if (key.includes('convers') || key.includes('reun') || key.includes('tel') || key.includes('llam') || key.includes('whats')) return 'Conversación';
  if (key.includes('sap') || key === 'otro') return 'Otro';
  return '';
}

export function normalizeAttachments(value: unknown): AbonoAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<AbonoAttachment>;
    const dataUrl = String(row.dataUrl || '');
    if (!dataUrl.startsWith('data:image/')) return [];
    return [{
      id: String(row.id || crypto.randomUUID()),
      name: String(row.name || 'captura').trim() || 'captura',
      mime: String(row.mime || 'image/jpeg'),
      dataUrl,
      addedAt: String(row.addedAt || ''),
    }];
  });
}

export function formatSourceLabel(row: { source?: string | null; informedBy?: string | null }): string {
  const source = String(row.source || '').trim();
  const detail = String(row.informedBy || '').trim();
  if (source && detail) return `${source} · ${detail}`;
  return displayDash(source || detail);
}

export function asStatus(value: string): AbonoStatus | '' {
  if (value === 'Recibido') return 'Liquidado';
  if (value === 'Recibido parcialmente') return 'Liquidado parcialmente';
  if (value === 'Reclamado') return 'Pendiente';
  if (value === 'Pendiente' || value === 'Pago comunicado' || value === 'Liquidado parcialmente' || value === 'Liquidado') return value;
  return '';
}

export function abonoRequiredGaps(row: {
  brand?: string | null;
  area?: string | null;
  teamMotivo?: string | null;
  type?: string | null;
  expectedAmount?: number | null;
  dueDate?: string | null;
  addedBy?: string | null;
  responsible?: string | null;
  source?: string | null;
  informedBy?: string | null;
  status?: string | null;
}): string[] {
  const gaps: string[] = [];
  if (!String(row.brand || '').trim()) gaps.push('Empresa');
  if (!String(row.area || '').trim()) gaps.push('Área');
  if (!String(row.teamMotivo || '').trim()) gaps.push('Equipo');
  if (!String(row.type || '').trim()) gaps.push('Tipo');
  if (row.expectedAmount === null || row.expectedAmount === undefined || !Number.isFinite(row.expectedAmount)) gaps.push('Importe previsto');
  if (!String(row.dueDate || '').trim()) gaps.push('Fecha prevista');
  if (!String(row.addedBy || '').trim()) gaps.push('Añadido por');
  if (!String(row.responsible || '').trim()) gaps.push('Responsable');
  if (!asSource(String(row.source || ''))) gaps.push('Canal');
  if (!String(row.informedBy || '').trim()) gaps.push('Persona');
  if (!asStatus(String(row.status || ''))) gaps.push('Estado');
  return gaps;
}

export function formatRequiredGaps(gaps: string[]): string | null {
  if (gaps.length === 0) return null;
  if (gaps.length === 1) return `Falta ${gaps[0]}.`;
  return `Faltan: ${gaps.join(', ')}.`;
}

export function attentionRows(rows: AbonoComputed[]): AbonoComputed[] {
  return myOpenQueue(rows).slice(0, 12);
}

export function isMyAbono(responsible: string): boolean {
  const name = responsible.trim().toLocaleLowerCase('es');
  return name.startsWith('cristóbal') || name.startsWith('cristobal');
}

function matchesResponsibleScope(row: AbonoComputed, responsible: string): boolean {
  if (!responsible || responsible === 'Todos') return true;
  if (isMyAbono(responsible)) return isMyAbono(row.responsible);
  return row.responsible.trim().toLocaleLowerCase('es') === responsible.trim().toLocaleLowerCase('es');
}

export function myOpenQueue(rows: AbonoComputed[], responsible = 'Cristóbal'): AbonoComputed[] {
  return [...rows]
    .filter((row) => matchesResponsibleScope(row, responsible) && row.status !== 'Liquidado')
    .sort((a, b) => {
      if ((a.overdueDays ?? -1) !== (b.overdueDays ?? -1)) return (b.overdueDays ?? -1) - (a.overdueDays ?? -1);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.registro - b.registro;
    });
}

export type WeeklyTaskKind = 'confirmar' | 'reclamar' | 'seguir' | 'cobro' | 'fecha';

export interface WeeklyTask {
  id: string;
  kind: WeeklyTaskKind;
  title: string;
  reason: string;
  actionLabel: string;
  row: AbonoComputed;
}

function stillOpen(row: AbonoComputed, responsible: string): boolean {
  return matchesResponsibleScope(row, responsible) && row.status !== 'Liquidado' && row.pending > 0.009;
}

export function weeklyTasks(rows: AbonoComputed[], today = todayIso(), responsible = 'Cristóbal', claims: AbonoClaim[] = []): WeeklyTask[] {
  const tasks: WeeklyTask[] = [];
  myOpenQueue(rows, responsible).forEach((row) => {
    if (!stillOpen(row, responsible)) return;
    const reviewDue = !!row.nextReview && row.nextReview <= today;
    const noReview = !row.nextReview;
    const priorClaim = claimsForCase(claims, row.id).some((claim) => claim.kind === 'reclamar' || claim.kind === 'seguir');

    if (row.status === 'Pago comunicado' && (reviewDue || noReview)) {
      const mismatch = row.communicatedAmount !== null && Math.abs(row.communicatedAmount - row.pending) > 0.009;
      tasks.push({
        id: `confirmar-${row.id}`,
        kind: 'confirmar',
        title: 'Confirmar pago con Finanzas',
        reason: mismatch
          ? `La marca comunica ${formatMoney(row.communicatedAmount)} y quedan ${formatMoney(row.pending)} pendientes.`
          : 'La marca ha comunicado el pago. Falta la confirmación de Finanzas.',
        actionLabel: 'Abrir ficha',
        row,
      });
      return;
    }

    if (row.dueDate && row.dueDate < today && (reviewDue || noReview)) {
      tasks.push({
        id: `${priorClaim ? 'seguir' : 'reclamar'}-${row.id}`,
        kind: priorClaim ? 'seguir' : 'reclamar',
        title: priorClaim ? 'Seguir reclamando' : 'Reclamar',
        reason: reviewDue
          ? `Toca revisar (próxima revisión ${formatIsoDate(row.nextReview)}).`
          : `Previsto ${formatIsoDate(row.dueDate)}${row.overdueDays ? ` · ${row.overdueDays} días` : ''}.`,
        actionLabel: priorClaim ? 'Sigo en ello' : 'He reclamado',
        row,
      });
      return;
    }

    if (row.status === 'Liquidado parcialmente' && (!row.dueDate || row.dueDate >= today)) {
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

  const order: WeeklyTaskKind[] = ['confirmar', 'reclamar', 'seguir', 'cobro', 'fecha'];
  return tasks.sort((a, b) => {
    const kindDiff = order.indexOf(a.kind) - order.indexOf(b.kind);
    if (kindDiff !== 0) return kindDiff;
    return (b.row.pending || 0) - (a.row.pending || 0);
  });
}

export const WEEKLY_TASK_ORDER: WeeklyTaskKind[] = ['confirmar', 'reclamar', 'seguir', 'cobro', 'fecha'];

export const WEEKLY_TASK_META: Record<WeeklyTaskKind, { title: string; hint: string; bulkLabel: string | null }> = {
  confirmar: { title: 'Confirmar con Finanzas', hint: 'La marca ha comunicado el pago y falta validar el ingreso.', bulkLabel: null },
  reclamar: { title: 'Reclamar', hint: 'La fecha prevista ya pasó y todavía no está reclamado.', bulkLabel: null },
  seguir: { title: 'Seguir reclamando', hint: 'Están reclamados y toca revisar.', bulkLabel: null },
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

export function makeClaim(caseId: string, kind: AbonoClaim['kind'], note = '', claimedAt = todayIso()): AbonoClaim {
  return {
    id: crypto.randomUUID(),
    caseId,
    kind,
    note: note.trim(),
    claimedAt,
  };
}

export function claimKindLabel(kind: AbonoClaim['kind']): string {
  if (kind === 'respuesta') return 'Respuesta';
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
    && row.status !== 'Liquidado'
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
  const open = rows.filter((row) => row.status !== 'Liquidado' && row.pending > 0.009);
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

export function linkedCases(rows: AbonoComputed[], termId: string): AbonoComputed[] {
  return rows
    .filter((row) => row.tradeTermId === termId)
    .sort((a, b) => a.registro - b.registro);
}

export function termRollup(rows: AbonoComputed[]): { count: number; pending: number; status: string } {
  if (rows.length === 0) return { count: 0, pending: 0, status: 'Sin vincular' };
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  if (rows.every((row) => row.status === 'Liquidado')) return { count: rows.length, pending, status: 'Liquidado' };
  if (rows.some((row) => row.overdueDays !== null)) return { count: rows.length, pending, status: 'Vencido' };
  if (rows.some((row) => row.status === 'Pago comunicado')) return { count: rows.length, pending, status: 'Pago comunicado' };
  if (rows.some((row) => row.status === 'Liquidado parcialmente')) return { count: rows.length, pending, status: 'Liquidado parcialmente' };
  if (rows.some((row) => row.status === 'Pendiente' || !row.status)) return { count: rows.length, pending, status: 'Pendiente' };
  return { count: rows.length, pending, status: rows[0].status || 'Pendiente' };
}

export function namesNeedShortening(state: Pick<AbonosState, 'cases'>): boolean {
  return state.cases.some((row) => (
    shortPersonName(row.addedBy) !== String(row.addedBy || '').trim()
    || shortPersonName(row.responsible) !== String(row.responsible || '').trim()
  ));
}

export function abonosNeedRewrite(state: Pick<AbonosState, 'cases'>): boolean {
  if (namesNeedShortening(state)) return true;
  return state.cases.some((row) => {
    const raw = String(row.source || '');
    if (!raw) return false;
    return asSource(raw) !== raw;
  });
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
