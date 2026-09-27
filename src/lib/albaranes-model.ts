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
  supervisor: string;
  activo: boolean;
}

export interface Colectivo {
  id: string;
  codigo: string;
  nombre: string;
  idAgente: string;
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
  fechaEstado: string | null;
  diasEstado: number;
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
  serie?: string;
  estado?: string;
  agente?: string;
  almacen?: string;
}

export interface CargaSummary {
  total: number;
  importe: number;
  estadoCounts: Array<{ name: string; count: number; importe: number }>;
  serieCounts: Array<{ name: string; count: number; importe: number }>;
  estadoCount: number;
  serieCount: number;
}

export function summarizeCarga(carga: Carga | null, filters: CargaFilters = {}): CargaSummary {
  const empty: CargaSummary = {
    total: 0,
    importe: 0,
    estadoCounts: [],
    serieCounts: [],
    estadoCount: 0,
    serieCount: 0,
  };
  if (!carga) return empty;

  const serieFilter = (filters.serie || '').trim().toUpperCase();
  const estadoFilter = (filters.estado || '').trim();
  const agenteFilter = (filters.agente || '').trim();
  const almacenFilter = (filters.almacen || '').trim();
  const rowFilters = Boolean(agenteFilter || almacenFilter);

  const rows = carga.rows || [];
  if (rowFilters && rows.length > 0) {
    const filteredRows = rows.filter((row) => {
      if (serieFilter && row.serie.toUpperCase() !== serieFilter) return false;
      if (estadoFilter && normKey(row.estado) !== normKey(estadoFilter)) return false;
      if (agenteFilter && normKey(row.agente) !== normKey(agenteFilter)) return false;
      if (almacenFilter && normKey(row.almacenOrigen) !== normKey(almacenFilter)) return false;
      return true;
    });
    const estadoCounts = tally(filteredRows, (row) => row.estado || '(sin estado)');
    const serieCounts = tally(filteredRows, (row) => row.serie || '(sin serie)');
    return {
      total: filteredRows.length,
      importe: filteredRows.reduce((sum, row) => sum + (row.importe || 0), 0),
      estadoCounts,
      serieCounts,
      estadoCount: estadoCounts.length,
      serieCount: serieCounts.length,
    };
  }

  const buckets = cargaBuckets(carga).filter((item) => {
    if (serieFilter && item.serie.toUpperCase() !== serieFilter) return false;
    if (estadoFilter && normKey(item.estado) !== normKey(estadoFilter)) return false;
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
      estadoCount: estadoCounts.length,
      serieCount: serieCounts.length,
    };
  }

  let estadoCounts = sortCounts(carga.estadoCounts || []);
  let serieCounts = sortCounts(carga.serieCounts || []);
  if (estadoFilter) estadoCounts = estadoCounts.filter((item) => normKey(item.name) === normKey(estadoFilter));
  if (serieFilter) serieCounts = serieCounts.filter((item) => item.name.toUpperCase() === serieFilter);
  const fromEstados = estadoCounts.reduce((sum, item) => sum + item.count, 0);
  const fromSeries = serieCounts.reduce((sum, item) => sum + item.count, 0);
  const fromEstadoImporte = estadoCounts.reduce((sum, item) => sum + item.importe, 0);
  const fromSerieImporte = serieCounts.reduce((sum, item) => sum + item.importe, 0);
  return {
    total: serieFilter && !estadoFilter ? fromSeries : fromEstados || fromSeries,
    importe: serieFilter && !estadoFilter ? fromSerieImporte : fromEstadoImporte || fromSerieImporte,
    estadoCounts,
    serieCounts,
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
  const key = normKey(codigo);
  return colectivos.filter((item) => normKey(item.codigo) === key);
}

export function resolveAssignment(row: AlbaranRow, agents: Agent[], colectivos: Colectivo[]): Assignment {
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

  const mapped = findColectivos(colectivos, codes[0]).filter((item) => item.activo);
  if (mapped.length === 0) {
    const any = findColectivos(colectivos, codes[0]);
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
    return { state, duplicate: true, carga: null };
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

  const nextEvaluations: Evaluacion[] = [];
  state.rules.filter((rule) => rule.activa).forEach((rule) => {
    input.rows.forEach((row) => {
      if (!ruleMatches(rule, row, input.loadDate)) return;
      const assignment = resolveAssignment(row, state.agents, state.colectivos);
      const evalKey = `${row.id}|${rule.id}`;
      const first = previousFirstBreach(state, row.id, rule.id) || input.loadDate;
      const prior = previousNotification(state, row.id, rule.id);
      const willMail = assignment.ok && !alreadyMailed(state, input.loadDate, assignment.email);
      const envio: MailStatus = !assignment.ok
        ? 'incidencia'
        : alreadyMailed(state, input.loadDate, assignment.email)
          ? 'omitido-duplicado'
          : 'pendiente';
      nextEvaluations.push({
        key: `${input.id}|${evalKey}`,
        cargaId: input.id,
        loadDate: input.loadDate,
        reglaId: rule.id,
        albaranId: row.id,
        albaran: row.albaran,
        serie: row.serie,
        estado: row.estado,
        fechaEstado: row.fechaEstado,
        diasEstado: row.fechaEstado ? daysBetween(row.fechaEstado, input.loadDate) : 0,
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
    rows: input.rows,
    estadoCounts: tally(input.rows, (row) => row.estado || '(sin estado)'),
    serieCounts: tally(input.rows, (row) => row.serie || '(sin serie)'),
    buckets: tallyBuckets(input.rows),
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
  return state.evaluations.filter((item) => item.cargaId === last.id && item.assignmentOk);
}

export function currentIncidents(state: AlbaranesState): Evaluacion[] {
  const last = latestCarga(state);
  if (!last) return [];
  return state.evaluations.filter((item) => item.cargaId === last.id && !item.assignmentOk);
}

export function currentAlbaranes(state: AlbaranesState): AlbaranRow[] {
  return latestCarga(state)?.rows || [];
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
  return { ...carga, rows: [] };
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
  const matchEval = (item: Evaluacion) => {
    if (filters.serie && item.serie.toUpperCase() !== filters.serie.trim().toUpperCase()) return false;
    if (filters.estado && normKey(item.estado) !== normKey(filters.estado)) return false;
    if (filters.agente && normKey(item.agenteOriginal) !== normKey(filters.agente)) return false;
    return true;
  };
  const actions = currentActions(state).filter(matchEval);
  const incidents = currentIncidents(state).filter(matchEval);
  return {
    lastLoadDate: last?.loadDate || null,
    lastLoadedAt: last?.loadedAt || null,
    lastFileName: last?.fileName || null,
    activeCount: summary.total,
    totalImporte: summary.importe,
    actionCount: actions.length,
    incidentCount: incidents.length,
    estadoCount: summary.estadoCount,
    serieCount: summary.serieCount,
    estadoCounts: summary.estadoCounts,
    serieCounts: summary.serieCounts,
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
