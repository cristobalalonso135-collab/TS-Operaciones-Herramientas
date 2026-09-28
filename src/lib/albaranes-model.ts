export const DEFAULT_SERIES = ['WWW', 'EQI', 'EQK', 'B2B', 'DVC'] as const;
export const ALCANCE_ALBARANES =
  'Albaranes no facturados · Almacén origen Equipaciones · Series WWW, EQI, EQK, B2B y DVC';
export const STATE_EN_PROCESO = 'En proceso';
export const STATE_PTE_PAGO = 'Pte. pago transferencia';
export const INTERNET_AGENT = 'internet';
export const REVIEW_MESSAGE = 'Por favor, revisa cada caso y actualiza manualmente su estado en el ERP.';

export type AssignmentReason =
  | 'Agente vacío'
  | 'Colectivo vacío'
  | 'Colectivo desconocido'
  | 'Varios responsables para el mismo colectivo'
  | 'Agente sin correo'
  | 'Agente inactivo'
  | 'Varios códigos de colectivo en el mismo campo'
  | 'Agente desconocido';

export type ChangeKind = 'nuevo' | 'igual' | 'cambio-estado' | 'cambio-agente' | 'desaparecido';
export type MailStatus = 'pendiente' | 'generado' | 'omitido-duplicado' | 'incidencia';

export interface AlbaranRow {
  id: string;
  albaran: string;
  serie: string;
  fechaAlbaran: string | null;
  almacenOrigen: string;
  agente: string;
  estado: string;
  idEstado: string;
  fechaEstado: string | null;
  colectivo: string;
  importe?: number;
}

export interface Carga {
  id: string;
  loadedAt: string;
  loadDate: string;
  fileName: string;
  fileHash: string;
  recordCount: number;
  totalImporte?: number;
  rows: AlbaranRow[];
  estadoCounts?: Array<{ name: string; count: number; importe: number }>;
  serieCounts?: Array<{ name: string; count: number; importe: number }>;
  buckets?: Array<{ serie: string; estado: string; count: number; importe: number }>;
  monthCounts?: Array<{ name: string; count: number; importe: number }>;
  estadoMonthCounts?: Array<{ name: string; count: number; importe: number }>;
  listing?: ListingRow[];
  incidents?: DataIncident[];
  newCount: number;
  sameCount: number;
  stateChangeCount: number;
  agentChangeCount: number;
  disappearedCount: number;
  newBreaches: number;
  continuingBreaches: number;
  resolvedBreaches: number;
  averageAgeDays?: number;
}

export interface DisappearedAlbaran {
  id: string;
  albaran: string;
  serie: string;
  estado: string;
  lastSeenDate: string;
  reason: string;
}

export interface Agent {
  id: string;
  agenteErp: string;
  nombre: string;
  email: string;
  idioma?: string;
  supervisor: string;
  activo: boolean;
}

export interface ListingRow {
  albaran: string;
  serie: string;
  estado: string;
  fechaAlbaran: string | null;
  fechaEstado: string | null;
  agente: string;
  colectivo: string;
}

export type DataIncidentReason =
  | 'Sin serie'
  | 'WWW sin colectivo'
  | 'Colectivo desconocido'
  | 'Colectivo inactivo'
  | 'Colectivo sin agente'
  | 'Varios códigos de colectivo'
  | 'Agente sin email';

export const DATA_INCIDENT_REASONS: DataIncidentReason[] = [
  'Sin serie',
  'WWW sin colectivo',
  'Colectivo desconocido',
  'Colectivo inactivo',
  'Colectivo sin agente',
  'Varios códigos de colectivo',
  'Agente sin email',
];

export const DATA_INCIDENT_DETAIL: Record<DataIncidentReason, string> = {
  'Sin serie': 'El albarán no trae serie reconocible (WWW, EQI, EQK, B2B, DVC).',
  'WWW sin colectivo': 'Es serie WWW y no trae código de colectivo.',
  'Colectivo desconocido': 'El código no está en el maestro de colectivos.',
  'Colectivo inactivo': 'El colectivo existe en el maestro pero está inactivo.',
  'Colectivo sin agente': 'El colectivo no tiene agente en el maestro; no se podrá enviar el correo.',
  'Varios códigos de colectivo': 'Hay más de un código en el mismo campo.',
  'Agente sin email': 'Este agente no tiene correo. Súbelo en Carga con el Excel de emails o complétalo en el maestro.',
};

export interface DataIncident {
  key: string;
  albaranId: string;
  albaran: string;
  serie: string;
  estado: string;
  agente: string;
  codigoColectivo: string;
  reason: DataIncidentReason;
}

export interface Colectivo {
  id: string;
  codigo: string;
  nombre: string;
  idAgente: string;
  agente?: string;
  comercial?: string;
  zona?: string;
  pais?: string;
  marca?: string;
  activo: boolean;
}

export interface Regla {
  id: string;
  nombre: string;
  activa: boolean;
  series: string[];
  estado: string;
  plazoDias: number;
  metodo: 'agente-o-colectivo';
  frecuencia: 'diaria';
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  ok: boolean;
  agenteResuelto: string;
  email: string;
  reason: AssignmentReason | null;
  action: string;
}

export interface Evaluacion {
  key: string;
  cargaId: string;
  loadDate: string;
  reglaId: string;
  albaranId: string;
  albaran: string;
  serie: string;
  estado: string;
  fechaAlbaran?: string | null;
  fechaEstado: string | null;
  diasEstado: number;
  plazoDias?: number;
  agenteOriginal: string;
  codigoColectivo: string;
  agenteResuelto: string;
  email: string;
  primeraFechaIncumplimiento: string;
  diasIncumpliendo: number;
  ultimaNotificacion: string | null;
  numeroNotificaciones: number;
  envio: MailStatus;
  assignmentOk: boolean;
  assignmentReason: AssignmentReason | null;
  assignmentAction: string;
  nuevo: boolean;
}

export interface LoteCorreo {
  id: string;
  generatedAt: string;
  loadDate: string;
  cargaId: string;
  fileName: string;
  destinatarios: number;
  albaranes: number;
  enviados: number;
  omitidos: number;
  incidencias: number;
}

export interface Comunicacion {
  clave: string;
  loadDate: string;
  email: string;
  agenteResuelto: string;
  asunto: string;
  cuerpoHtml: string;
  numeroAlbaranes: number;
  enviar: boolean;
  generatedAt: string;
}

export interface AlbaranesState {
  rules: Regla[];
  agents: Agent[];
  colectivos: Colectivo[];
  colectivosFileName?: string;
  colectivosLoadedAt?: string;
  emailsFileName?: string;
  emailsLoadedAt?: string;
  cargas: Carga[];
  disappeared: DisappearedAlbaran[];
  evaluations: Evaluacion[];
  lots: LoteCorreo[];
  communications: Comunicacion[];
}

export const EMPTY_ALBARANES_STATE: AlbaranesState = {
  rules: [],
  agents: [],
  colectivos: [],
  colectivosFileName: '',
  colectivosLoadedAt: '',
  emailsFileName: '',
  emailsLoadedAt: '',
  cargas: [],
  disappeared: [],
  evaluations: [],
  lots: [],
  communications: [],
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(date = new Date()): string {
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatIsoDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatIsoDate(value);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
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
  const spanish = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
  if (spanish) return toIsoDate(Number(spanish[3]), Number(spanish[2]), Number(spanish[1]));
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export function formatInt(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 0 });
}

export function formatEuro(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

export function formatShare(part: number, total: number): string {
  if (!total || part <= 0) return '0 %';
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0,1 %';
  const digits = pct < 10 ? 1 : 0;
  return `${pct.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

export function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/ /g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function sortCounts(rows: Array<{ name: string; count: number; importe: number }>) {
  return [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

export function monthKey(iso: string | null | undefined): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '(sin fecha)';
}

export function formatMonthKey(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : value;
}

export function monthsBetween(month: string, todayIsoValue: string): number | null {
  const from = month.match(/^(\d{4})-(\d{2})$/);
  const to = todayIsoValue.match(/^(\d{4})-(\d{2})/);
  if (!from || !to) return null;
  return (Number(to[1]) - Number(from[1])) * 12 + (Number(to[2]) - Number(from[2]));
}

function sortMonths(rows: Array<{ name: string; count: number; importe: number }>) {
  return [...rows].sort((a, b) => {
    if (a.name === '(sin fecha)') return 1;
    if (b.name === '(sin fecha)') return -1;
    return a.name.localeCompare(b.name);
  });
}

function tallyMonths(rows: AlbaranRow[], pick: (row: AlbaranRow) => string | null | undefined) {
  return sortMonths(tally(rows, (row) => monthKey(pick(row))));
}

function tally(rows: AlbaranRow[], pick: (row: AlbaranRow) => string): Array<{ name: string; count: number; importe: number }> {
  const counts = new Map<string, { count: number; importe: number }>();
  rows.forEach((row) => {
    const name = pick(row);
    const current = counts.get(name) || { count: 0, importe: 0 };
    current.count += 1;
    current.importe += row.importe || 0;
    counts.set(name, current);
  });
  return sortCounts(Array.from(counts.entries()).map(([name, item]) => ({ name, count: item.count, importe: item.importe })));
}

function tallyNamed(items: Array<{ name: string; count: number; importe: number }>) {
  const counts = new Map<string, { count: number; importe: number }>();
  items.forEach((item) => {
    const current = counts.get(item.name) || { count: 0, importe: 0 };
    current.count += item.count;
    current.importe += item.importe;
    counts.set(item.name, current);
  });
  return sortCounts(Array.from(counts.entries()).map(([name, item]) => ({ name, count: item.count, importe: item.importe })));
}

export function tallyBuckets(rows: AlbaranRow[]): Array<{ serie: string; estado: string; count: number; importe: number }> {
  const counts = new Map<string, { serie: string; estado: string; count: number; importe: number }>();
  rows.forEach((row) => {
    const serie = row.serie || '(sin serie)';
    const estado = row.estado || '(sin estado)';
    const key = `${serie}\0${estado}`;
    const current = counts.get(key) || { serie, estado, count: 0, importe: 0 };
    current.count += 1;
    current.importe += row.importe || 0;
    counts.set(key, current);
  });
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.serie.localeCompare(b.serie, 'es') || a.estado.localeCompare(b.estado, 'es'),
  );
}

export function cargaBuckets(carga: Carga): Array<{ serie: string; estado: string; count: number; importe: number }> {
  if (carga.buckets && carga.buckets.length > 0) return carga.buckets;
  if (carga.rows && carga.rows.length > 0) return tallyBuckets(carga.rows);
  return [];
}

export interface CargaFilters {
  series?: string[];
  estados?: string[];
  agentes?: string[];
  almacenes?: string[];
}

export interface CargaSummary {
  total: number;
  importe: number;
  estadoCounts: Array<{ name: string; count: number; importe: number }>;
  serieCounts: Array<{ name: string; count: number; importe: number }>;
  monthCounts: Array<{ name: string; count: number; importe: number }>;
  estadoMonthCounts: Array<{ name: string; count: number; importe: number }>;
  estadoCount: number;
  serieCount: number;
}

function asSet(values: string[] | undefined, map: (value: string) => string): Set<string> {
  return new Set((values || []).map(map).filter(Boolean));
}

function allows(set: Set<string>, value: string): boolean {
  return set.size === 0 || set.has(value);
}

function serieKey(value: string): string {
  return value.trim().toUpperCase() || '(SIN SERIE)';
}

export function summarizeCarga(carga: Carga | null, filters: CargaFilters = {}): CargaSummary {
  const empty: CargaSummary = {
    total: 0,
    importe: 0,
    estadoCounts: [],
    serieCounts: [],
    monthCounts: [],
    estadoMonthCounts: [],
    estadoCount: 0,
    serieCount: 0,
  };
  if (!carga) return empty;

  const series = asSet(filters.series, serieKey);
  const estados = asSet(filters.estados, normKey);
  const agentes = asSet(filters.agentes, normKey);
  const almacenes = asSet(filters.almacenes, normKey);
  const rowFilters = agentes.size > 0 || almacenes.size > 0;
  const hasFilters = rowFilters || series.size > 0 || estados.size > 0;
  const needsMonthDetail = hasFilters || !(carga.monthCounts && carga.monthCounts.length);
  const detail = needsMonthDetail
    ? ((carga.rows && carga.rows.length > 0) ? carga.rows : listingAsRows(carga.listing || []))
    : [];
  const filteredDetail = detail.filter((row) => {
    if (!allows(series, serieKey(row.serie))) return false;
    if (!allows(estados, normKey(row.estado))) return false;
    if (!allows(agentes, normKey(row.agente))) return false;
    if (!allows(almacenes, normKey(row.almacenOrigen))) return false;
    return true;
  });
  const months = filteredDetail.length > 0
    ? {
        monthCounts: tallyMonths(filteredDetail, (row) => row.fechaAlbaran),
        estadoMonthCounts: tallyMonths(filteredDetail, (row) => row.fechaEstado),
      }
    : {
        monthCounts: sortMonths(carga.monthCounts || []),
        estadoMonthCounts: sortMonths(carga.estadoMonthCounts || []),
      };

  const rows = carga.rows || [];
  if (rowFilters && rows.length > 0) {
    const filteredRows = rows.filter((row) => {
      if (!allows(series, serieKey(row.serie))) return false;
      if (!allows(estados, normKey(row.estado))) return false;
      if (!allows(agentes, normKey(row.agente))) return false;
      if (!allows(almacenes, normKey(row.almacenOrigen))) return false;
      return true;
    });
    const estadoCounts = tally(filteredRows, (row) => row.estado || '(sin estado)');
    const serieCounts = tally(filteredRows, (row) => row.serie || '(sin serie)');
    return {
      total: filteredRows.length,
      importe: filteredRows.reduce((sum, row) => sum + (row.importe || 0), 0),
      estadoCounts,
      serieCounts,
      ...months,
      estadoCount: estadoCounts.length,
      serieCount: serieCounts.length,
    };
  }

  const buckets = cargaBuckets(carga).filter((item) => {
    if (!allows(series, serieKey(item.serie))) return false;
    if (!allows(estados, normKey(item.estado))) return false;
    return true;
  });

  if (buckets.length > 0) {
    const estadoCounts = tallyNamed(buckets.map((item) => ({ name: item.estado, count: item.count, importe: item.importe })));
    const serieCounts = tallyNamed(buckets.map((item) => ({ name: item.serie, count: item.count, importe: item.importe })));
    return {
      total: buckets.reduce((sum, item) => sum + item.count, 0),
      importe: buckets.reduce((sum, item) => sum + item.importe, 0),
      estadoCounts,
      serieCounts,
      ...months,
      estadoCount: estadoCounts.length,
      serieCount: serieCounts.length,
    };
  }

  let estadoCounts = sortCounts(carga.estadoCounts || []);
  let serieCounts = sortCounts(carga.serieCounts || []);
  if (estados.size) estadoCounts = estadoCounts.filter((item) => allows(estados, normKey(item.name)));
  if (series.size) serieCounts = serieCounts.filter((item) => allows(series, serieKey(item.name)));
  const fromEstados = estadoCounts.reduce((sum, item) => sum + item.count, 0);
  const fromSeries = serieCounts.reduce((sum, item) => sum + item.count, 0);
  const fromEstadoImporte = estadoCounts.reduce((sum, item) => sum + item.importe, 0);
  const fromSerieImporte = serieCounts.reduce((sum, item) => sum + item.importe, 0);
  return {
    total: series.size && !estados.size ? fromSeries : fromEstados || fromSeries,
    importe: series.size && !estados.size ? fromSerieImporte : fromEstadoImporte || fromSerieImporte,
    estadoCounts,
    serieCounts,
    ...months,
    estadoCount: estadoCounts.length,
    serieCount: serieCounts.length,
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function normKey(value: string): string {
  return value.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function displayDash(value: string | null | undefined): string {
  const text = String(value || '').trim();
  return text || '—';
}

export function isInternetAgent(agente: string): boolean {
  return normKey(agente) === INTERNET_AGENT;
}

export function extractSerie(albaran: string, serieCol = ''): string {
  const fromCol = serieCol.replace(/\u00a0/g, ' ').trim().toUpperCase();
  if (fromCol) return fromCol.replace(/[^A-Z0-9]/g, '') || fromCol;
  const match = albaran.replace(/\u00a0/g, ' ').trim().match(/^([A-Za-z]{2,8})\b/);
  return match ? match[1].toUpperCase() : '';
}

export function splitColectivoCodes(value: string): string[] {
  return value
    .split(/[;,|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function nextRuleId(rules: Regla[]): string {
  const max = rules.reduce((acc, rule) => {
    const n = Number(rule.id.replace(/^R/i, ''));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `R${String(max + 1).padStart(3, '0')}`;
}

export function defaultRules(now = nowIso()): Regla[] {
  return [
    {
      id: 'R001',
      nombre: 'En proceso más de 5 días',
      activa: true,
      series: [...DEFAULT_SERIES],
      estado: STATE_EN_PROCESO,
      plazoDias: 5,
      metodo: 'agente-o-colectivo',
      frecuencia: 'diaria',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'R002',
      nombre: 'Pte. pago transferencia más de 14 días',
      activa: true,
      series: [...DEFAULT_SERIES],
      estado: STATE_PTE_PAGO,
      plazoDias: 14,
      metodo: 'agente-o-colectivo',
      frecuencia: 'diaria',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function seedAlbaranesState(): AlbaranesState {
  return { ...EMPTY_ALBARANES_STATE, rules: defaultRules() };
}

export function peopleKey(value: string): string {
  return normKey(value)
    .replace(/\b(eqi|eqk|eoi|www|b2b|dvc)\b/g, ' ')
    .replace(/[^a-z0-9ñáéíóúü ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesMatch(left: string, right: string): boolean {
  const a = peopleKey(left);
  const b = peopleKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) return true;
  const at = a.split(' ');
  const bt = b.split(' ');
  return Boolean(at[0] && bt[0] && at[at.length - 1] && bt[bt.length - 1] && at[0] === bt[0] && at[at.length - 1] === bt[bt.length - 1]);
}

export function uniqueAgentes(state: AlbaranesState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const key = peopleKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  state.colectivos.forEach((item) => push(item.agente || item.idAgente));
  state.agents.forEach((item) => {
    push(item.agenteErp);
    push(item.nombre);
  });
  latestCarga(state)?.listing?.forEach((row) => push(row.agente));
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

export function mergeAgentEmails(
  state: AlbaranesState,
  contacts: Array<{ nombre: string; email: string; idioma?: string }>,
): { state: AlbaranesState; matched: number; unmatched: string[] } {
  const names = uniqueAgentes(state);
  const unmatched: string[] = [];
  const emailByName = new Map<string, string>();
  const idiomaByName = new Map<string, string>();
  contacts.forEach((item) => {
    if (!item.email.includes('@')) return;
    const hit = names.find((name) => namesMatch(name, item.nombre) || namesMatch(name, item.email.split('@')[0].replace(/[._]/g, ' ')));
    if (!hit) {
      unmatched.push(item.nombre || item.email);
      return;
    }
    const key = peopleKey(hit);
    emailByName.set(key, item.email.trim());
    if (item.idioma) idiomaByName.set(key, item.idioma);
  });
  const agents = names.map((name) => {
    const key = peopleKey(name);
    const prior = state.agents.find((item) => namesMatch(item.agenteErp, name) || namesMatch(item.nombre, name));
    return {
      id: prior?.id || newId('ag'),
      agenteErp: prior?.agenteErp || name,
      nombre: prior?.nombre || name,
      email: emailByName.get(key) || prior?.email || '',
      idioma: idiomaByName.get(key) || prior?.idioma || '',
      supervisor: prior?.supervisor || '',
      activo: prior?.activo ?? true,
    };
  });
  return {
    state: { ...state, agents },
    matched: emailByName.size,
    unmatched: unmatched.slice(0, 20),
  };
}

export function knownEstados(state: AlbaranesState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const key = normKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  push(STATE_EN_PROCESO);
  push(STATE_PTE_PAGO);
  state.rules.forEach((rule) => push(rule.estado));
  state.cargas.forEach((carga) => (carga.estadoCounts || []).forEach((item) => push(item.name)));
  latestCarga(state)?.listing?.forEach((row) => push(row.estado));
  latestCarga(state)?.rows.forEach((row) => push(row.estado));
  return out;
}

export function knownSeries(state: AlbaranesState): string[] {
  const seen = new Set<string>(DEFAULT_SERIES);
  const out: string[] = [...DEFAULT_SERIES];
  const push = (value: string) => {
    const text = value.trim().toUpperCase();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  state.rules.forEach((rule) => rule.series.forEach(push));
  state.cargas.forEach((carga) => (carga.serieCounts || []).forEach((item) => push(item.name)));
  latestCarga(state)?.listing?.forEach((row) => push(row.serie));
  latestCarga(state)?.rows.forEach((row) => push(row.serie));
  return out;
}

export function latestCarga(state: AlbaranesState): Carga | null {
  return state.cargas[state.cargas.length - 1] || null;
}

export function findAgentByErp(agents: Agent[], agenteErp: string): Agent[] {
  const key = normKey(agenteErp);
  return agents.filter((agent) => normKey(agent.agenteErp) === key);
}

export function findColectivos(colectivos: Colectivo[], codigo: string): Colectivo[] {
  return findColectivosFromIndex(indexColectivos(colectivos), codigo);
}

export function indexColectivos(colectivos: Colectivo[]): Map<string, Colectivo[]> {
  const map = new Map<string, Colectivo[]>();
  colectivos.forEach((item) => {
    const key = normKey(item.codigo);
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  });
  return map;
}

export function findColectivosFromIndex(index: Map<string, Colectivo[]>, codigo: string): Colectivo[] {
  return index.get(normKey(codigo)) || [];
}

export function toListing(row: AlbaranRow): ListingRow {
  return {
    albaran: row.albaran,
    serie: row.serie,
    estado: row.estado,
    fechaAlbaran: row.fechaAlbaran,
    fechaEstado: row.fechaEstado,
    agente: row.agente,
    colectivo: row.colectivo,
  };
}

export function listingAsRows(listing: ListingRow[]): AlbaranRow[] {
  return listing.map((row) => ({
    id: row.albaran,
    albaran: row.albaran,
    serie: row.serie,
    estado: row.estado,
    fechaAlbaran: row.fechaAlbaran,
    fechaEstado: row.fechaEstado,
    agente: row.agente,
    colectivo: row.colectivo,
    almacenOrigen: '',
    idEstado: '',
  }));
}

export function lookupAgenteColectivo(codigo: string, colectivos: Colectivo[]): string {
  return lookupAgenteColectivoFromIndex(codigo, colectivoAgenteIndex(colectivos));
}

export function colectivoAgenteIndex(colectivos: Colectivo[]): Map<string, string> {
  const map = new Map<string, string>();
  colectivos.forEach((item) => {
    const name = (item.agente || item.idAgente).trim();
    if (name) map.set(normKey(item.codigo), name);
  });
  return map;
}

export function lookupAgenteColectivoFromIndex(codigo: string, index: Map<string, string>): string {
  return splitColectivoCodes(codigo)
    .map((item) => index.get(normKey(item)))
    .filter((item): item is string => Boolean(item))
    .join(', ');
}

export function packListing(rows: ListingRow[]): Array<[string, string, string, string, string, string, string]> {
  return rows.map((row) => [
    row.albaran,
    row.serie,
    row.estado,
    row.fechaAlbaran || '',
    row.fechaEstado || '',
    row.agente,
    row.colectivo,
  ]);
}

export function unpackListing(value: unknown): ListingRow[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0] as unknown;
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return (value as ListingRow[]).filter((row) => row?.albaran);
  }
  return (value as unknown[]).flatMap((item) => {
    if (!Array.isArray(item) || !item[0]) return [];
    return [{
      albaran: String(item[0] || ''),
      serie: String(item[1] || ''),
      estado: String(item[2] || ''),
      fechaAlbaran: item[3] ? String(item[3]) : null,
      fechaEstado: item[4] ? String(item[4]) : null,
      agente: String(item[5] || ''),
      colectivo: String(item[6] || ''),
    }];
  });
}

export function attachListing(
  state: AlbaranesState,
  payload: { cargaId?: string; loadDate?: string; listing?: unknown; incidents?: unknown } | null,
): AlbaranesState {
  const last = latestCarga(state);
  if (!last || !payload) return state;
  const listing = unpackListing(payload.listing);
  if (listing.length === 0) return state;
  return {
    ...state,
    cargas: state.cargas.map((carga) => (
      carga.id === last.id
        ? {
            ...carga,
            listing,
            incidents: Array.isArray(payload.incidents) ? payload.incidents : carga.incidents,
          }
        : carga
    )),
  };
}

export function listingSnapshot(state: AlbaranesState): {
  cargaId: string;
  loadDate: string;
  fileName: string;
  listing: ReturnType<typeof packListing>;
  incidents: DataIncident[];
} | null {
  const last = latestCarga(state);
  if (!last) return null;
  const listing = last.listing?.length ? last.listing : (last.rows || []).map(toListing);
  if (listing.length === 0) return null;
  return {
    cargaId: last.id,
    loadDate: last.loadDate,
    fileName: last.fileName,
    listing: packListing(listing),
    incidents: last.incidents || [],
  };
}

export function currentListing(state: AlbaranesState): ListingRow[] {
  const last = latestCarga(state);
  if (!last) return [];
  if (last.listing && last.listing.length > 0) return last.listing;
  return (last.rows || []).map(toListing);
}

export function buildDataIncidents(rows: AlbaranRow[], colectivos: Colectivo[]): DataIncident[] {
  const hasMaster = colectivos.length > 0;
  const colectivoIndex = hasMaster ? indexColectivos(colectivos) : new Map<string, Colectivo[]>();
  const out: DataIncident[] = [];
  const push = (row: AlbaranRow, reason: DataIncidentReason) => {
    out.push({
      key: `${row.id}|${reason}`,
      albaranId: row.id,
      albaran: row.albaran,
      serie: row.serie,
      estado: row.estado,
      agente: row.agente,
      codigoColectivo: row.colectivo,
      reason,
    });
  };

  rows.forEach((row) => {
    if (!row.serie.trim()) push(row, 'Sin serie');
    const codes = splitColectivoCodes(row.colectivo);
    if (row.serie.trim().toUpperCase() === 'WWW' && codes.length === 0) {
      push(row, 'WWW sin colectivo');
    }
    if (codes.length > 1) push(row, 'Varios códigos de colectivo');
    if (!hasMaster || codes.length !== 1) return;
    const mapped = findColectivosFromIndex(colectivoIndex, codes[0]);
    if (mapped.length === 0) {
      push(row, 'Colectivo desconocido');
      return;
    }
    const active = mapped.filter((item) => item.activo);
    if (active.length === 0) {
      push(row, 'Colectivo inactivo');
      return;
    }
    if (!active.some((item) => (item.agente || item.idAgente).trim())) {
      push(row, 'Colectivo sin agente');
    }
  });
  return out;
}

export function currentDataIncidents(state: AlbaranesState): DataIncident[] {
  const last = latestCarga(state);
  const fromCarga = last?.incidents && last.incidents.length > 0
    ? last.incidents.filter((item) => item.reason !== 'Agente sin email')
    : (() => {
        const rows = last?.rows?.length ? last.rows : listingAsRows(last?.listing || []);
        return rows.length ? buildDataIncidents(rows, state.colectivos) : [];
      })();
  return [...fromCarga, ...agentEmailIncidents(state)];
}

export function agentEmailIncidents(state: AlbaranesState): DataIncident[] {
  return uniqueAgentes(state)
    .filter((name) => !isInternetAgent(name) && peopleKey(name) !== 'internet')
    .filter((name) => {
      const agent = state.agents.find((item) => namesMatch(item.agenteErp, name) || namesMatch(item.nombre, name));
      return !agent?.email.includes('@');
    })
    .map((name) => ({
      key: `agente|${peopleKey(name)}|Agente sin email`,
      albaranId: peopleKey(name),
      albaran: '',
      serie: '',
      estado: '',
      agente: name,
      codigoColectivo: '',
      reason: 'Agente sin email' as const,
    }));
}

export function withLatestIncidents(state: AlbaranesState, colectivos: Colectivo[]): AlbaranesState {
  const last = latestCarga(state);
  const rows = last?.rows?.length ? last.rows : listingAsRows(last?.listing || []);
  if (!last || rows.length === 0) return { ...state, colectivos };
  const incidents = buildDataIncidents(rows, colectivos);
  return {
    ...state,
    colectivos,
    cargas: state.cargas.map((carga) => (carga.id === last.id ? { ...carga, incidents } : carga)),
  };
}

export function resolveAssignment(
  row: AlbaranRow,
  agents: Agent[],
  colectivos: Colectivo[],
  colectivoIndex = indexColectivos(colectivos),
): Assignment {
  const fail = (reason: AssignmentReason, action: string): Assignment => ({
    ok: false,
    agenteResuelto: '',
    email: '',
    reason,
    action,
  });

  const agente = row.agente.trim();
  if (!agente) return fail('Agente vacío', 'Completa el agente en el ERP o asigna un comercial en el directorio.');

  const finish = (agent: Agent | undefined, fallbackName: string): Assignment => {
    if (!agent) return fail('Agente desconocido', `Añade “${fallbackName}” en el directorio de agentes, con su correo.`);
    if (!agent.activo) return fail('Agente inactivo', `Activa a ${agent.nombre || agent.agenteErp} en el directorio.`);
    if (!agent.email.trim() || !agent.email.includes('@')) {
      return fail('Agente sin correo', `Pon el email de ${agent.nombre || agent.agenteErp} en el directorio.`);
    }
    return {
      ok: true,
      agenteResuelto: agent.nombre || agent.agenteErp,
      email: agent.email.trim(),
      reason: null,
      action: '',
    };
  };

  if (!isInternetAgent(agente)) {
    const matches = findAgentByErp(agents, agente);
    return finish(matches[0], agente);
  }

  const codes = splitColectivoCodes(row.colectivo);
  if (codes.length === 0) return fail('Colectivo vacío', 'El albarán es Internet y no trae código de colectivo. Complétalo en el ERP.');
  if (codes.length > 1) {
    return fail('Varios códigos de colectivo en el mismo campo', `Separa o deja un único código. Ahora mismo: ${codes.join(', ')}.`);
  }

  const mapped = findColectivosFromIndex(colectivoIndex, codes[0]).filter((item) => item.activo);
  if (mapped.length === 0) {
    const any = findColectivosFromIndex(colectivoIndex, codes[0]);
    if (any.length === 0) return fail('Colectivo desconocido', `Añade el colectivo “${codes[0]}” y su comercial responsable.`);
    return fail('Colectivo desconocido', `El colectivo “${codes[0]}” está inactivo. Actívalo o asigna otro responsable.`);
  }
  const uniqueAgents = Array.from(new Set(mapped.map((item) => item.idAgente)));
  if (uniqueAgents.length > 1) {
    return fail('Varios responsables para el mismo colectivo', `Deja un solo responsable activo para “${codes[0]}”.`);
  }

  const wanted = uniqueAgents[0];
  const agent = agents.find((item) => (
    item.id === wanted
    || normKey(item.agenteErp) === normKey(wanted)
    || normKey(item.nombre) === normKey(wanted)
  ));
  return finish(agent, mapped[0].nombre || codes[0]);
}

export function ruleMatches(rule: Regla, row: AlbaranRow, loadDate: string): boolean {
  if (!rule.activa) return false;
  if (!rule.series.map((item) => item.toUpperCase()).includes(row.serie.toUpperCase())) return false;
  if (normKey(rule.estado) !== normKey(row.estado)) return false;
  if (!row.fechaEstado) return false;
  return daysBetween(row.fechaEstado, loadDate) > rule.plazoDias;
}

export function countRuleHits(rule: Pick<Regla, 'series' | 'estado' | 'plazoDias'>, rows: AlbaranRow[], loadDate: string): number {
  const probe: Regla = {
    id: 'probe',
    nombre: '',
    activa: true,
    series: rule.series,
    estado: rule.estado,
    plazoDias: rule.plazoDias,
    metodo: 'agente-o-colectivo',
    frecuencia: 'diaria',
    createdAt: '',
    updatedAt: '',
  };
  return rows.filter((row) => ruleMatches(probe, row, loadDate)).length;
}

function previousFirstBreach(state: AlbaranesState, albaranId: string, reglaId: string): string | null {
  for (let i = state.evaluations.length - 1; i >= 0; i -= 1) {
    const row = state.evaluations[i];
    if (row.albaranId === albaranId && row.reglaId === reglaId) return row.primeraFechaIncumplimiento;
  }
  return null;
}

function previousNotification(state: AlbaranesState, albaranId: string, reglaId: string): { count: number; last: string | null } {
  for (let i = state.evaluations.length - 1; i >= 0; i -= 1) {
    const row = state.evaluations[i];
    if (row.albaranId === albaranId && row.reglaId === reglaId) {
      return { count: row.numeroNotificaciones, last: row.ultimaNotificacion };
    }
  }
  return { count: 0, last: null };
}

export function alreadyMailed(state: AlbaranesState, loadDate: string, email: string): boolean {
  const clave = `${loadDate}|${normKey(email)}`;
  return state.communications.some((item) => item.clave === clave && item.enviar);
}

function evaluateRules(
  state: AlbaranesState,
  input: { cargaId: string; loadDate: string; rows: AlbaranRow[] },
  options: { bumpMail: boolean; previousCargaId?: string | null },
): Evaluacion[] {
  const previousKeys = new Set(
    state.evaluations
      .filter((item) => item.cargaId === options.previousCargaId)
      .map((item) => `${item.albaranId}|${item.reglaId}`),
  );
  const prevEvalByKey = new Map<string, Evaluacion>();
  for (let i = state.evaluations.length - 1; i >= 0; i -= 1) {
    const row = state.evaluations[i];
    const key = `${row.albaranId}|${row.reglaId}`;
    if (!prevEvalByKey.has(key)) prevEvalByKey.set(key, row);
  }
  const mailedToday = new Set(
    state.communications
      .filter((item) => item.loadDate === input.loadDate && item.enviar)
      .map((item) => item.clave),
  );
  const colectivoIndex = indexColectivos(state.colectivos);
  const nextEvaluations: Evaluacion[] = [];
  state.rules.filter((rule) => rule.activa).forEach((rule) => {
    input.rows.forEach((row) => {
      if (!ruleMatches(rule, row, input.loadDate)) return;
      const assignment = resolveAssignment(row, state.agents, state.colectivos, colectivoIndex);
      const evalKey = `${row.id}|${rule.id}`;
      const priorEval = prevEvalByKey.get(evalKey);
      const first = priorEval?.primeraFechaIncumplimiento || input.loadDate;
      const prior = priorEval
        ? { count: priorEval.numeroNotificaciones, last: priorEval.ultimaNotificacion }
        : { count: 0, last: null as string | null };
      const mailKey = `${input.loadDate}|${normKey(assignment.email)}`;
      const mailed = mailedToday.has(mailKey);
      const willMail = options.bumpMail && assignment.ok && !mailed;
      const envio: MailStatus = !assignment.ok
        ? 'incidencia'
        : mailed
          ? 'omitido-duplicado'
          : options.bumpMail
            ? 'pendiente'
            : (priorEval?.envio || 'pendiente');
      nextEvaluations.push({
        key: `${input.cargaId}|${evalKey}`,
        cargaId: input.cargaId,
        loadDate: input.loadDate,
        reglaId: rule.id,
        albaranId: row.id,
        albaran: row.albaran,
        serie: row.serie,
        estado: row.estado,
        fechaAlbaran: row.fechaAlbaran,
        fechaEstado: row.fechaEstado,
        diasEstado: row.fechaEstado ? daysBetween(row.fechaEstado, input.loadDate) : 0,
        plazoDias: rule.plazoDias,
        agenteOriginal: row.agente,
        codigoColectivo: row.colectivo,
        agenteResuelto: assignment.agenteResuelto,
        email: assignment.email,
        primeraFechaIncumplimiento: first,
        diasIncumpliendo: daysBetween(first, input.loadDate),
        ultimaNotificacion: willMail ? input.loadDate : prior.last,
        numeroNotificaciones: willMail ? prior.count + 1 : prior.count,
        envio,
        assignmentOk: assignment.ok,
        assignmentReason: assignment.reason,
        assignmentAction: assignment.action,
        nuevo: !previousKeys.has(evalKey),
      });
    });
  });
  return nextEvaluations;
}

function replaceCargaEvaluations(
  state: AlbaranesState,
  carga: Carga,
  evaluations: Evaluacion[],
  previousCargaId?: string | null,
): AlbaranesState {
  const previousKeys = new Set(
    state.evaluations
      .filter((item) => item.cargaId === previousCargaId)
      .map((item) => `${item.albaranId}|${item.reglaId}`),
  );
  const currentKeys = new Set(evaluations.map((item) => `${item.albaranId}|${item.reglaId}`));
  const resolvedBreaches = Array.from(previousKeys).filter((key) => !currentKeys.has(key)).length;
  const newBreaches = evaluations.filter((item) => item.nuevo).length;
  const continuingBreaches = evaluations.filter((item) => !item.nuevo).length;
  return {
    ...state,
    cargas: state.cargas.map((item) => (
      item.id === carga.id
        ? { ...item, newBreaches, continuingBreaches, resolvedBreaches }
        : item
    )),
    evaluations: [
      ...state.evaluations.filter((item) => item.cargaId !== carga.id),
      ...evaluations,
    ],
  };
}

export function reapplyRulesToLatestCarga(state: AlbaranesState): AlbaranesState {
  const last = latestCarga(state);
  if (!last) return state;
  const rows = last.rows?.length ? last.rows : listingAsRows(last.listing || []);
  if (rows.length === 0) {
    return {
      ...state,
      evaluations: state.evaluations.flatMap((item) => {
        if (item.cargaId !== last.id) return [item];
        const rule = state.rules.find((row) => row.id === item.reglaId);
        if (!rule?.activa) return [];
        return [{ ...item, plazoDias: rule.plazoDias }];
      }),
    };
  }
  const previous = state.cargas[state.cargas.length - 2];
  const evaluations = evaluateRules(state, {
    cargaId: last.id,
    loadDate: last.loadDate,
    rows,
  }, { bumpMail: false, previousCargaId: previous?.id });
  return replaceCargaEvaluations(state, last, evaluations, previous?.id);
}

export function ingestCarga(state: AlbaranesState, input: {
  id: string;
  loadedAt: string;
  loadDate: string;
  fileName: string;
  fileHash: string;
  rows: AlbaranRow[];
}): { state: AlbaranesState; duplicate: boolean; carga: Carga | null } {
  const sameDay = state.cargas.filter((item) => item.loadDate === input.loadDate);
  if (sameDay.some((item) => item.fileHash === input.fileHash)) {
    const target = sameDay[sameDay.length - 1] || latestCarga(state);
    if (!target) return { state, duplicate: true, carga: null };
    const listing = input.rows.map(toListing);
    const incidents = buildDataIncidents(input.rows, state.colectivos);
    const monthCounts = tallyMonths(input.rows, (row) => row.fechaAlbaran);
    const estadoMonthCounts = tallyMonths(input.rows, (row) => row.fechaEstado);
    return {
      duplicate: true,
      carga: { ...target, listing, incidents, rows: [], monthCounts, estadoMonthCounts },
      state: {
        ...state,
        cargas: state.cargas.map((carga) => (
          carga.id === target.id
            ? { ...carga, rows: [], listing, incidents, monthCounts, estadoMonthCounts }
            : carga
        )),
      },
    };
  }

  const previous = latestCarga(state);
  const prevRows = previous?.rows || [];
  const canDiff = prevRows.length > 0;
  const prevById = new Map(canDiff ? prevRows.map((row) => [row.id, row]) : []);
  const nextById = new Map(input.rows.map((row) => [row.id, row]));

  let newCount = 0;
  let sameCount = 0;
  let stateChangeCount = 0;
  let agentChangeCount = 0;
  if (canDiff) {
    input.rows.forEach((row) => {
      const prev = prevById.get(row.id);
      if (!prev) {
        newCount += 1;
        return;
      }
      const estadoChanged = normKey(prev.estado) !== normKey(row.estado);
      const agenteChanged = normKey(prev.agente) !== normKey(row.agente);
      if (estadoChanged) stateChangeCount += 1;
      if (agenteChanged) agentChangeCount += 1;
      if (!estadoChanged && !agenteChanged) sameCount += 1;
    });
  }

  const disappearedCount = canDiff ? prevRows.filter((row) => !nextById.has(row.id)).length : 0;

  const previousKeys = new Set(
    state.evaluations
      .filter((item) => item.cargaId === previous?.id)
      .map((item) => `${item.albaranId}|${item.reglaId}`)
  );
  const nextEvaluations = evaluateRules(state, {
    cargaId: input.id,
    loadDate: input.loadDate,
    rows: input.rows,
  }, { bumpMail: true, previousCargaId: previous?.id });

  const currentKeys = new Set(nextEvaluations.map((item) => `${item.albaranId}|${item.reglaId}`));
  const resolvedBreaches = Array.from(previousKeys).filter((key) => !currentKeys.has(key)).length;
  const newBreaches = nextEvaluations.filter((item) => item.nuevo).length;
  const continuingBreaches = nextEvaluations.filter((item) => !item.nuevo).length;

  const carga: Carga = {
    id: input.id,
    loadedAt: input.loadedAt,
    loadDate: input.loadDate,
    fileName: input.fileName,
    fileHash: input.fileHash,
    recordCount: input.rows.length,
    totalImporte: input.rows.reduce((sum, row) => sum + (row.importe || 0), 0),
    rows: [],
    estadoCounts: tally(input.rows, (row) => row.estado || '(sin estado)'),
    serieCounts: tally(input.rows, (row) => row.serie || '(sin serie)'),
    buckets: tallyBuckets(input.rows),
    monthCounts: tallyMonths(input.rows, (row) => row.fechaAlbaran),
    estadoMonthCounts: tallyMonths(input.rows, (row) => row.fechaEstado),
    listing: input.rows.map(toListing),
    incidents: buildDataIncidents(input.rows, state.colectivos),
    newCount,
    sameCount,
    stateChangeCount,
    agentChangeCount,
    disappearedCount,
    newBreaches,
    continuingBreaches,
    resolvedBreaches,
    averageAgeDays: averageAge(input.rows, input.loadDate),
  };

  const mailable = nextEvaluations.filter((item) => item.assignmentOk);
  const byEmail = new Map<string, Evaluacion[]>();
  mailable.forEach((item) => {
    const key = normKey(item.email);
    const list = byEmail.get(key) || [];
    list.push(item);
    byEmail.set(key, list);
  });

  const communications: Comunicacion[] = [...state.communications];
  let enviados = 0;
  let omitidos = 0;
  byEmail.forEach((items) => {
    const first = items[0];
    const duplicate = alreadyMailed(state, input.loadDate, first.email);
    const clave = `${input.loadDate}|${normKey(first.email)}`;
    communications.push({
      clave,
      loadDate: input.loadDate,
      email: first.email,
      agenteResuelto: first.agenteResuelto,
      asunto: `Albaranes pendientes de revisión - ${formatIsoDate(input.loadDate)}`,
      cuerpoHtml: buildMailHtml(first.agenteResuelto, input.loadDate, items),
      numeroAlbaranes: items.length,
      enviar: !duplicate,
      generatedAt: input.loadedAt,
    });
    if (duplicate) omitidos += 1;
    else enviados += 1;
  });

  const lot: LoteCorreo = {
    id: input.id,
    generatedAt: input.loadedAt,
    loadDate: input.loadDate,
    cargaId: input.id,
    fileName: `albaranes_acciones_${input.loadDate}.xlsx`,
    destinatarios: byEmail.size,
    albaranes: mailable.length,
    enviados,
    omitidos,
    incidencias: nextEvaluations.filter((item) => !item.assignmentOk).length,
  };

  const marked = nextEvaluations.map((item) => {
    if (item.envio !== 'pendiente') return item;
    return { ...item, envio: 'generado' as const };
  });

  return {
    duplicate: false,
    carga,
    state: {
      ...state,
      cargas: [...state.cargas, carga],
      disappeared: [],
      evaluations: [...state.evaluations, ...marked],
      lots: [...state.lots, lot],
      communications,
    },
  };
}

export function currentActions(state: AlbaranesState): Evaluacion[] {
  const last = latestCarga(state);
  if (!last) return [];
  return state.evaluations.filter((item) => item.cargaId === last.id);
}

export interface AccionRow {
  key: string;
  reglaId: string;
  albaran: string;
  serie: string;
  estado: string;
  fechaAlbaran: string | null;
  fechaEstado: string | null;
  diasCreacion: number | null;
  diasEstado: number;
  plazoDias: number;
  agente: string;
  email: string;
  idioma: string;
}

export function presentActions(state: AlbaranesState, today: string): AccionRow[] {
  const last = latestCarga(state);
  if (!last) return [];
  const listing = new Map((last.listing || []).map((row) => [row.albaran, row]));
  const colectivoIndex = colectivoAgenteIndex(state.colectivos);
  const rules = new Map(state.rules.map((rule) => [rule.id, rule]));
  return currentActions(state).map((item) => {
    const listed = listing.get(item.albaran);
    const fechaAlbaran = item.fechaAlbaran || listed?.fechaAlbaran || null;
    const www = item.serie.trim().toUpperCase() === 'WWW';
    const agente = www
      ? (lookupAgenteColectivoFromIndex(item.codigoColectivo, colectivoIndex) || item.agenteResuelto)
      : (item.agenteOriginal || item.agenteResuelto);
    const agent = agente
      ? state.agents.find((row) => namesMatch(row.agenteErp, agente) || namesMatch(row.nombre, agente))
      : undefined;
    return {
      key: item.key,
      reglaId: item.reglaId,
      albaran: item.albaran,
      serie: item.serie,
      estado: item.estado,
      fechaAlbaran,
      fechaEstado: item.fechaEstado,
      diasCreacion: fechaAlbaran ? daysBetween(fechaAlbaran, today) : null,
      diasEstado: item.diasEstado,
      plazoDias: rules.get(item.reglaId)?.plazoDias ?? item.plazoDias ?? 0,
      agente,
      email: item.email || agent?.email || '',
      idioma: agent?.idioma || '',
    };
  });
}

export function currentIncidents(state: AlbaranesState): Evaluacion[] {
  const last = latestCarga(state);
  if (!last) return [];
  return state.evaluations.filter((item) => item.cargaId === last.id && !item.assignmentOk);
}

export function currentAlbaranes(state: AlbaranesState): AlbaranRow[] {
  const last = latestCarga(state);
  if (!last) return [];
  if (last.rows && last.rows.length > 0) return last.rows;
  return listingAsRows(last.listing || []);
}

export function albaranTimeline(state: AlbaranesState, albaranId: string): Array<{
  loadDate: string;
  fileName: string;
  estado: string;
  agente: string;
  fechaEstado: string | null;
  diasEstado: number;
}> {
  return state.cargas
    .map((carga) => {
      const row = carga.rows.find((item) => item.id === albaranId);
      if (!row) return null;
      return {
        loadDate: carga.loadDate,
        fileName: carga.fileName,
        estado: row.estado,
        agente: row.agente,
        fechaEstado: row.fechaEstado,
        diasEstado: row.fechaEstado ? daysBetween(row.fechaEstado, carga.loadDate) : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function historyByEstado(state: AlbaranesState): Array<{ loadDate: string; estado: string; count: number; importe: number }> {
  const out: Array<{ loadDate: string; estado: string; count: number; importe: number }> = [];
  state.cargas.forEach((carga) => {
    const source = carga.estadoCounts?.length
      ? carga.estadoCounts
      : tally(carga.rows || [], (row) => row.estado || '(sin estado)');
    source.forEach((item) => out.push({ loadDate: carga.loadDate, estado: item.name, count: item.count, importe: item.importe || 0 }));
  });
  return out;
}

export function historyBySerie(state: AlbaranesState): Array<{ loadDate: string; serie: string; count: number; importe: number }> {
  const out: Array<{ loadDate: string; serie: string; count: number; importe: number }> = [];
  state.cargas.forEach((carga) => {
    const source = carga.serieCounts?.length
      ? carga.serieCounts
      : tally(carga.rows || [], (row) => row.serie || '(sin serie)');
    source.forEach((item) => out.push({ loadDate: carga.loadDate, serie: item.name, count: item.count, importe: item.importe || 0 }));
  });
  return out;
}

export function trendByBucket(
  state: AlbaranesState,
  kind: 'estado' | 'serie',
  name: string,
): Array<{ loadDate: string; count: number; importe: number; delta: number | null }> {
  const key = kind === 'serie' ? name.trim().toUpperCase() : normKey(name);
  const points = state.cargas.map((carga) => {
    const source = kind === 'serie' ? carga.serieCounts : carga.estadoCounts;
    const hit = (source || []).find((item) => (
      kind === 'serie' ? item.name.toUpperCase() === key : normKey(item.name) === key
    ));
    return {
      loadDate: carga.loadDate,
      count: hit?.count || 0,
      importe: hit?.importe || 0,
    };
  });
  return points.map((point, index) => ({
    ...point,
    delta: index === 0 ? null : point.count - points[index - 1].count,
  }));
}

export function photoCarga(carga: Carga): Carga {
  return { ...carga, rows: [], listing: undefined, incidents: undefined };
}

export function dailyPhotos(state: AlbaranesState): Carga[] {
  const byDay = new Map<string, Carga>();
  state.cargas.forEach((carga) => {
    if (!carga.loadDate) return;
    byDay.set(carga.loadDate, carga);
  });
  return Array.from(byDay.values()).sort((a, b) => a.loadDate.localeCompare(b.loadDate));
}

export function historyEstadoMatrix(state: AlbaranesState): {
  dates: string[];
  rows: Array<{ estado: string; values: Array<{ count: number; importe: number }> }>;
  totals: Array<{ count: number; importe: number }>;
} {
  const photos = dailyPhotos(state);
  const dates = photos.map((item) => item.loadDate);
  const names = new Set<string>();
  photos.forEach((carga) => {
    (carga.estadoCounts || []).forEach((item) => names.add(item.name || '(sin estado)'));
  });
  const last = photos[photos.length - 1];
  const lastCount = new Map((last?.estadoCounts || []).map((item) => [item.name || '(sin estado)', item.count]));
  const estados = Array.from(names).sort(
    (a, b) => (lastCount.get(b) || 0) - (lastCount.get(a) || 0) || a.localeCompare(b, 'es'),
  );
  const rows = estados.map((estado) => ({
    estado,
    values: photos.map((carga) => {
      const hit = (carga.estadoCounts || []).find((item) => (item.name || '(sin estado)') === estado);
      return { count: hit?.count || 0, importe: hit?.importe || 0 };
    }),
  }));
  const totals = photos.map((carga) => ({
    count: carga.recordCount || (carga.estadoCounts || []).reduce((sum, item) => sum + item.count, 0),
    importe: carga.totalImporte || (carga.estadoCounts || []).reduce((sum, item) => sum + (item.importe || 0), 0),
  }));
  return { dates, rows, totals };
}

export function averageAge(rows: AlbaranRow[], loadDate: string): number {
  const ages = rows
    .filter((row) => row.fechaEstado)
    .map((row) => daysBetween(row.fechaEstado as string, loadDate));
  if (ages.length === 0) return 0;
  return Math.round(ages.reduce((sum, n) => sum + n, 0) / ages.length);
}

export function resumenKpis(state: AlbaranesState, filters: CargaFilters = {}) {
  const last = latestCarga(state);
  const summary = summarizeCarga(last, filters);
  const baseline = summarizeCarga(last);
  const matchEval = (item: Evaluacion) => {
    const series = asSet(filters.series, serieKey);
    const estados = asSet(filters.estados, normKey);
    const agentes = asSet(filters.agentes, normKey);
    if (!allows(series, serieKey(item.serie))) return false;
    if (!allows(estados, normKey(item.estado))) return false;
    if (!allows(agentes, normKey(item.agenteOriginal))) return false;
    return true;
  };
  const actions = currentActions(state).filter(matchEval);
  const dataIncidents = currentDataIncidents(state).filter((item) => {
    const series = asSet(filters.series, serieKey);
    const estados = asSet(filters.estados, normKey);
    const agentes = asSet(filters.agentes, normKey);
    if (!allows(series, serieKey(item.serie))) return false;
    if (!allows(estados, normKey(item.estado))) return false;
    if (!allows(agentes, normKey(item.agente))) return false;
    return true;
  });
  const filtered = Boolean(
    (filters.series && filters.series.length)
    || (filters.estados && filters.estados.length)
    || (filters.agentes && filters.agentes.length)
    || (filters.almacenes && filters.almacenes.length),
  );
  return {
    lastLoadDate: last?.loadDate || null,
    lastLoadedAt: last?.loadedAt || null,
    lastFileName: last?.fileName || null,
    activeCount: summary.total,
    baselineCount: baseline.total,
    shareOfTotal: filtered && baseline.total > 0 ? summary.total / baseline.total : null,
    totalImporte: summary.importe,
    actionCount: actions.length,
    incidentCount: dataIncidents.length,
    estadoCount: summary.estadoCount,
    serieCount: summary.serieCount,
    estadoCounts: summary.estadoCounts,
    serieCounts: summary.serieCounts,
    monthCounts: summary.monthCounts,
    estadoMonthCounts: summary.estadoMonthCounts,
    newBreaches: last?.newBreaches || 0,
    continuingBreaches: last?.continuingBreaches || 0,
    resolvedBreaches: last?.resolvedBreaches || 0,
  };
}

export function buildMailHtml(nombre: string, loadDate: string, items: Evaluacion[]): string {
  const rows = items.map((item) => (
    `<tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(item.albaran)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(item.serie)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(item.estado)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;">${item.diasEstado}</td>
    </tr>`
  )).join('');
  return `<p>Hola, ${escapeHtml(nombre)}:</p>
<p>Los siguientes albaranes continúan pendientes y requieren revisión:</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,sans-serif;font-size:13px;">
  <thead>
    <tr>
      <th style="padding:6px 10px;border:1px solid #ddd;background:#f4f1ea;text-align:left;">Albarán</th>
      <th style="padding:6px 10px;border:1px solid #ddd;background:#f4f1ea;text-align:left;">Serie</th>
      <th style="padding:6px 10px;border:1px solid #ddd;background:#f4f1ea;text-align:left;">Estado</th>
      <th style="padding:6px 10px;border:1px solid #ddd;background:#f4f1ea;text-align:left;">Días en estado</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p>${REVIEW_MESSAGE}</p>
<p>Este aviso se repetirá diariamente mientras los albaranes continúen en el mismo estado.</p>
<p style="color:#888;font-size:12px;">Carga ${escapeHtml(formatIsoDate(loadDate))}</p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function exportPayload(state: AlbaranesState, carga: Carga) {
  const actions = state.evaluations.filter((item) => item.cargaId === carga.id);
  const detalle = actions.filter((item) => item.assignmentOk).map((item) => ({
    FechaEjecucion: item.loadDate,
    ReglaId: item.reglaId,
    IdAlbaran: item.albaranId,
    Albaran: item.albaran,
    Serie: item.serie,
    Estado: item.estado,
    FechaEstado: item.fechaEstado || '',
    DiasEstado: item.diasEstado,
    AgenteOriginal: item.agenteOriginal,
    CodigoColectivo: item.codigoColectivo,
    AgenteResuelto: item.agenteResuelto,
    Email: item.email,
    PrimeraFechaIncumplimiento: item.primeraFechaIncumplimiento,
    DiasIncumpliendo: item.diasIncumpliendo,
    NumeroNotificaciones: item.numeroNotificaciones,
    Mensaje: REVIEW_MESSAGE,
    ClaveUnicaAccion: `${item.loadDate}|${item.reglaId}|${item.albaranId}`,
  }));
  const correos = state.communications
    .filter((item) => item.loadDate === carga.loadDate)
    .map((item) => ({
      FechaEjecucion: item.loadDate,
      AgenteResuelto: item.agenteResuelto,
      Email: item.email,
      Asunto: item.asunto,
      CuerpoHTML: item.cuerpoHtml,
      NumeroAlbaranes: item.numeroAlbaranes,
      ClaveUnicaEnvio: item.clave,
      Enviar: item.enviar ? 'Sí' : 'No',
    }));
  return { detalle, correos };
}
