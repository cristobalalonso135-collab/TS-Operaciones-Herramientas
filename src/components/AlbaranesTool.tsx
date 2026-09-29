'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  AGENTES_TEMPLATE,
  COLECTIVOS_TEMPLATE,
  parseAgentesSheet,
  parseAlbaranesSheet,
  parseColectivosSheet,
  parseEmailsSheet,
  pickSheet,
} from '@/lib/albaranes-excel';
import {
  ALCANCE_ALBARANES,
  DEFAULT_SERIES,
  countRuleHits,
  currentAlbaranes,
  currentDataIncidents,
  currentListing,
  presentActions,
  daysBetween,
  DATA_INCIDENT_DETAIL,
  DATA_INCIDENT_REASONS,
  displayDash,
  exportPayload,
  formatIsoDate,
  formatIsoDateTime,
  formatEuro,
  formatInt,
  formatMonthKey,
  formatShare,
  monthsBetween,
  ingestCarga,
  reapplyRulesToLatestCarga,
  knownEstados,
  knownSeries,
  historyEstadoMatrix,
  latestCarga,
  mergeAgentEmails,
  uniqueAgentes,
  agentEmailIncidents,
  newId,
  nextRuleId,
  nowIso,
  resumenKpis,
  todayIso,
  withLatestIncidents,
  type Agent,
  type AccionRow,
  type AlbaranesState,
  type Colectivo,
  type DataIncident,
  type Regla,
} from '@/lib/albaranes-model';
import { loadAlbaranesState, saveAlbaranesState, type AlbaranesBackend } from '@/lib/albaranes-store';
import { ChevronDown, ChevronUp, Download, Plus, Search, Trash2 } from 'lucide-react';

type ActSortKey = 'plazoDias' | 'albaran' | 'serie' | 'estado' | 'fechaAlbaran' | 'fechaEstado' | 'diasCreacion' | 'diasEstado' | 'agente' | 'email' | 'idioma';
const ACT_COLUMNS: Array<{ key: ActSortKey; label: string }> = [
  { key: 'albaran', label: 'Albarán' },
  { key: 'serie', label: 'Serie' },
  { key: 'estado', label: 'Estado' },
  { key: 'agente', label: 'Agente' },
  { key: 'email', label: 'Email' },
  { key: 'idioma', label: 'Idioma' },
  { key: 'fechaAlbaran', label: 'Fecha albarán' },
  { key: 'diasCreacion', label: 'Días albarán' },
  { key: 'fechaEstado', label: 'Fecha estado' },
  { key: 'diasEstado', label: 'Días estado' },
  { key: 'plazoDias', label: 'Máximos días' },
];
const ACCIONES_XLSX_FILE = 'albaranes_acciones.xlsx';
const ACCIONES_XLSX_SHEET = 'Acciones';
const ACCIONES_XLSX_TABLE = 'AlbaranesAcciones';

function actionCell(row: AccionRow, key: ActSortKey): string | number {
  if (key === 'plazoDias') return row.plazoDias;
  if (key === 'albaran') return row.albaran;
  if (key === 'serie') return row.serie;
  if (key === 'estado') return row.estado;
  if (key === 'agente') return row.agente;
  if (key === 'email') return row.email;
  if (key === 'idioma') return row.idioma;
  if (key === 'fechaAlbaran') return formatIsoDate(row.fechaAlbaran);
  if (key === 'fechaEstado') return formatIsoDate(row.fechaEstado);
  if (key === 'diasCreacion') return row.diasCreacion ?? '';
  return row.diasEstado;
}

const TABS = [
  { id: 'carga', label: 'Carga' },
  { id: 'reglas', label: 'Reglas' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'incidencias', label: 'Incidencias' },
  { id: 'listado', label: 'Listado' },
  { id: 'acciones', label: 'Acciones' },
  { id: 'historico', label: 'Histórico' },
] as const;

type TabId = (typeof TABS)[number]['id'] | 'acciones' | 'directorios' | 'comunicaciones';

const LIST_PAGE = 120;
type ListSortKey = 'albaran' | 'serie' | 'estado' | 'fechaAlbaran' | 'fechaEstado' | 'diasCreacion' | 'diasEstado' | 'agente';
const LIST_COLUMNS: Array<{ key: ListSortKey; label: string }> = [
  { key: 'albaran', label: 'Albarán' },
  { key: 'serie', label: 'Serie' },
  { key: 'estado', label: 'Estado' },
  { key: 'fechaAlbaran', label: 'Fecha albarán' },
  { key: 'fechaEstado', label: 'Fecha estado' },
  { key: 'diasCreacion', label: 'Días creación' },
  { key: 'diasEstado', label: 'Días estado' },
  { key: 'agente', label: 'Agente' },
];

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadAoa(sheets: Record<string, unknown[][]>, fileName: string) {
  void import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    });
    XLSX.writeFile(wb, fileName);
  });
}

async function downloadNamedExcelTable(input: {
  fileName: string;
  sheetName: string;
  tableName: string;
  header: string[];
  rows: Array<Array<string | number>>;
}): Promise<void> {
  const response = await fetch('/api/albaranes-acciones-xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('export');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, hint, amount, ok }: { label: string; value: string | number; hint?: string; amount?: string; ok?: boolean }) {
  const shown = typeof value === 'number' ? formatInt(value) : value;
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${ok ? 'border-[var(--success)] bg-[var(--success-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
      <p className={`text-xs ${ok ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold tabular-nums leading-tight ${ok ? 'text-[var(--success)]' : ''}`}>{shown}</p>
      {hint ? <p className={`mt-1 text-[11px] ${ok ? 'text-[var(--success)]/80' : 'text-[var(--text-secondary)]'}`}>{hint}</p> : null}
      {amount ? <p className={`mt-0.5 text-[10px] leading-tight ${ok ? 'text-[var(--success)]/70' : 'text-[var(--text-muted)]'}`}>{amount}</p> : null}
    </div>
  );
}

function Ack({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
        <button type="button" onClick={onClose} className="mt-4 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">
          Aceptar
        </button>
      </div>
    </div>
  );
}

export default function AlbaranesTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('carga');
  const [state, setState] = useState<AlbaranesState | null>(null);
  const [backend, setBackend] = useState<AlbaranesBackend>('local');
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const [ack, setAck] = useState<{ title: string; message: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filterRule, setFilterRule] = useState('');
  const [filterSerie, setFilterSerie] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [filterEnvio, setFilterEnvio] = useState('');
  const [filterNuevo, setFilterNuevo] = useState('');
  const [filterAge, setFilterAge] = useState('');
  const [incReason, setIncReason] = useState<string[]>([]);
  const [incSerie, setIncSerie] = useState<string[]>([]);
  const [incQuery, setIncQuery] = useState('');
  const [listSerie, setListSerie] = useState<string[]>([]);
  const [listEstado, setListEstado] = useState<string[]>([]);
  const [listAgente, setListAgente] = useState<string[]>([]);
  const [listQuery, setListQuery] = useState('');
  const [listPage, setListPage] = useState(0);
  const [listSort, setListSort] = useState<{ key: ListSortKey; dir: 'asc' | 'desc' }>({ key: 'fechaAlbaran', dir: 'desc' });
  const [actPage, setActPage] = useState(0);
  const [actSort, setActSort] = useState<{ key: ActSortKey; dir: 'asc' | 'desc' }>({ key: 'diasEstado', dir: 'desc' });
  const [vistaSerie, setVistaSerie] = useState<string[]>([]);
  const [vistaEstado, setVistaEstado] = useState<string[]>([]);
  const [vistaAgente, setVistaAgente] = useState<string[]>([]);
  const [histMetric, setHistMetric] = useState<'count' | 'importe'>('count');
  const [vintageField, setVintageField] = useState<'albaran' | 'estado'>('albaran');
  const [incPage, setIncPage] = useState(0);
  const [editingRule, setEditingRule] = useState<Regla | null>(null);
  const [dirTab, setDirTab] = useState<'agentes' | 'colectivos'>('agentes');
  const [busy, setBusy] = useState<string | null>(null);

  const persist = useCallback(async (next: AlbaranesState, currentBackend: AlbaranesBackend) => {
    setError(null);
    try {
      await saveAlbaranesState(next, currentBackend);
      setState(next);
    } catch (err) {
      setState(next);
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAlbaranesState()
      .then((result) => {
        if (cancelled) return;
        setState(reapplyRulesToLatestCarga(result.state));
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar albaranes.');
      });
    return () => { cancelled = true; };
  }, []);

  const vistaFilters = useMemo(
    () => ({ series: vistaSerie, estados: vistaEstado, agentes: vistaAgente }),
    [vistaAgente, vistaEstado, vistaSerie],
  );
  const kpis = useMemo(() => (state ? resumenKpis(state, vistaFilters) : null), [state, vistaFilters]);
  const last = state ? latestCarga(state) : null;
  const actions = useMemo(() => (state && tab === 'acciones' ? presentActions(state, todayIso()) : []), [state, tab]);
  const incidents = useMemo(() => (state ? currentDataIncidents(state) : []), [state]);
  const incidentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    incidents.forEach((item) => counts.set(item.reason, (counts.get(item.reason) || 0) + 1));
    return DATA_INCIDENT_REASONS.map((reason) => ({ reason, count: counts.get(reason) || 0 })).filter((item) => item.count > 0);
  }, [incidents]);
  const filteredIncidents = useMemo(() => {
    return incidents.filter((row) => {
      if (incReason.length && !incReason.includes(row.reason)) return false;
      if (incSerie.length) {
        const keys = new Set(incSerie.map((item) => item.toUpperCase()));
        if (!keys.has((row.serie || '(sin serie)').toUpperCase())) return false;
      }
      if (incQuery) {
        const hay = `${row.albaran} ${row.agente} ${row.codigoColectivo} ${row.estado}`.toLocaleLowerCase('es');
        if (!hay.includes(incQuery.toLocaleLowerCase('es'))) return false;
      }
      return true;
    });
  }, [incQuery, incReason, incSerie, incidents]);
  const masterSinAgente = useMemo(
    () => (state ? state.colectivos.filter((item) => item.activo && !(item.agente || item.idAgente).trim()) : []),
    [state],
  );
  const listing = useMemo(() => (state && tab === 'listado' ? currentListing(state) : []), [state, tab]);
  const filteredListing = useMemo(() => {
    const hoy = todayIso();
    const rows = listing.filter((row) => {
      if (listSerie.length) {
        const keys = new Set(listSerie.map((item) => item.toUpperCase()));
        if (!keys.has((row.serie || '(sin serie)').toUpperCase())) return false;
      }
      if (listEstado.length) {
        const keys = new Set(listEstado.map((item) => item.toLocaleLowerCase('es')));
        if (!keys.has(row.estado.trim().toLocaleLowerCase('es'))) return false;
      }
      if (listAgente.length) {
        const keys = new Set(listAgente.map((item) => item.toLocaleLowerCase('es')));
        if (!keys.has(row.agente.trim().toLocaleLowerCase('es'))) return false;
      }
      if (listQuery) {
        const hay = `${row.albaran} ${row.agente} ${row.colectivo} ${row.estado}`.toLocaleLowerCase('es');
        if (!hay.includes(listQuery.toLocaleLowerCase('es'))) return false;
      }
      return true;
    });
    const dir = listSort.dir === 'asc' ? 1 : -1;
    const valueOf = (row: (typeof rows)[number]): string | number => {
      if (listSort.key === 'fechaAlbaran') return row.fechaAlbaran || '';
      if (listSort.key === 'fechaEstado') return row.fechaEstado || '';
      if (listSort.key === 'diasCreacion') return row.fechaAlbaran ? daysBetween(row.fechaAlbaran, hoy) : -1;
      if (listSort.key === 'diasEstado') return row.fechaEstado ? daysBetween(row.fechaEstado, hoy) : -1;
      if (listSort.key === 'albaran') return row.albaran;
      if (listSort.key === 'serie') return row.serie;
      if (listSort.key === 'estado') return row.estado;
      return row.agente;
    };
    return [...rows].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      if (left === '' || left === -1) return 1;
      if (right === '' || right === -1) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right), 'es', { numeric: true }) * dir;
    });
  }, [listAgente, listEstado, listQuery, listSerie, listSort, listing]);
  const listPages = Math.max(1, Math.ceil(filteredListing.length / LIST_PAGE));
  const listingPage = filteredListing.slice(listPage * LIST_PAGE, listPage * LIST_PAGE + LIST_PAGE);
  const incPages = Math.max(1, Math.ceil(filteredIncidents.length / LIST_PAGE));
  const incidentsPage = filteredIncidents.slice(incPage * LIST_PAGE, incPage * LIST_PAGE + LIST_PAGE);
  const history = useMemo(() => (state ? historyEstadoMatrix(state) : { dates: [], rows: [], totals: [] }), [state]);

  useEffect(() => {
    setListPage(0);
  }, [listAgente, listEstado, listQuery, listSerie, listSort]);
  useEffect(() => {
    setIncPage(0);
  }, [incQuery, incReason, incSerie]);
  const actuales = useMemo(() => {
    if (!state || tab !== 'reglas') return [];
    return currentAlbaranes(state);
  }, [state, tab]);
  const series = state ? knownSeries(state) : [...DEFAULT_SERIES];
  const estados = state ? knownEstados(state) : [];
  const agentesVista = useMemo(() => {
    if (!state || (tab !== 'resumen' && tab !== 'listado')) return [];
    const names = new Set<string>();
    currentListing(state).forEach((row) => {
      const name = row.agente.trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [state, tab]);

  const filteredActions = useMemo(() => {
    const rows = actions.filter((row) => {
      if (filterRule && row.reglaId !== filterRule) return false;
      if (filterSerie && row.serie !== filterSerie) return false;
      if (filterEstado && row.estado !== filterEstado) return false;
      if (filterResp && row.agente !== filterResp) return false;
      if (query) {
        const hay = `${row.albaran} ${row.agente} ${row.email} ${row.idioma} ${row.estado}`.toLocaleLowerCase('es');
        if (!hay.includes(query.toLocaleLowerCase('es'))) return false;
      }
      return true;
    });
    const dir = actSort.dir === 'asc' ? 1 : -1;
    const valueOf = (row: AccionRow): string | number => {
      if (actSort.key === 'plazoDias') return row.plazoDias;
      if (actSort.key === 'fechaAlbaran') return row.fechaAlbaran || '';
      if (actSort.key === 'fechaEstado') return row.fechaEstado || '';
      if (actSort.key === 'diasCreacion') return row.diasCreacion ?? -1;
      if (actSort.key === 'diasEstado') return row.diasEstado;
      if (actSort.key === 'albaran') return row.albaran;
      if (actSort.key === 'serie') return row.serie;
      if (actSort.key === 'estado') return row.estado;
      if (actSort.key === 'email') return row.email;
      if (actSort.key === 'idioma') return row.idioma;
      return row.agente;
    };
    return [...rows].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      if (left === '' || left === -1) return 1;
      if (right === '' || right === -1) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right), 'es', { numeric: true }) * dir;
    });
  }, [actSort, actions, filterEstado, filterResp, filterRule, filterSerie, query]);
  const actPages = Math.max(1, Math.ceil(filteredActions.length / LIST_PAGE));
  const actionsPage = filteredActions.slice(actPage * LIST_PAGE, actPage * LIST_PAGE + LIST_PAGE);

  useEffect(() => {
    setActPage(0);
  }, [actSort, filterEstado, filterResp, filterRule, filterSerie, query]);

  const ingestRows = async (rows: ReturnType<typeof parseAlbaranesSheet>, fileName: string, hash: string) => {
    if (!state) return;
    if (rows.length === 0) {
      setAck({ title: 'Archivo vacío', message: 'No he encontrado albaranes. Revisa que el Excel tenga columna Albarán.' });
      return;
    }
    setBusy(`Preparando ${formatInt(rows.length)} albaranes…`);
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    const result = ingestCarga(state, {
      id: newId('carga'),
      loadedAt: nowIso(),
      loadDate: todayIso(),
      fileName,
      fileHash: hash || `${fileName}-${rows.length}`,
      rows,
    });
    setBusy('Guardando listado…');
    await persist(result.state, backend);
    setBusy(null);
    if (result.duplicate) {
      setAck({
        title: 'Carga actualizada',
        message: `Este archivo ya se subió hoy. Hay ${formatInt(rows.length)} albaranes. Si falta, sube ahora Colectivos.csv.`,
      });
      return;
    }
    setAck({
      title: 'Carga guardada',
      message: `${formatInt(rows.length)} albaranes. Si falta, sube ahora Colectivos.csv. ${formatInt(result.carga?.newBreaches || 0)} incumplimientos nuevos, ${formatInt(result.carga?.continuingBreaches || 0)} que continúan.`,
    });
  };

  const handleAlbaranesFile = async (data: unknown[][], fileName: string) => {
    try {
      setBusy('Leyendo archivo…');
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      const file = lastFileRef.current;
      const hash = file ? await sha256(file) : `${fileName}-${data.length}`;
      lastFileRef.current = null;
      const rows = parseAlbaranesSheet(data);
      await ingestRows(rows, fileName, hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido cargar el CSV.');
    } finally {
      setBusy(null);
    }
  };

  const handleColectivosFile = (data: unknown[][], fileName: string) => {
    if (!state) return;
    const colectivos = parseColectivosSheet(data);
    if (colectivos.length === 0) {
      setAck({
        title: 'Sin colectivos',
        message: 'No he encontrado la columna Código. Usa el CSV del ERP: Nombre, Código, Agente, Comercial, Act.',
      });
      return;
    }
    const next = withLatestIncidents(state, colectivos);
    void persist({
      ...next,
      colectivosFileName: fileName,
      colectivosLoadedAt: nowIso(),
    }, backend);
    const agentes = new Set(colectivos.map((item) => item.agente || item.idAgente).filter(Boolean));
    setAck({
      title: 'Colectivos guardados',
      message: `${formatInt(colectivos.length)} colectivos y ${formatInt(agentes.size)} agentes distintos. Sube ahora el Excel de correos del grupo si lo tienes.`,
    });
  };

  const handleEmailsFile = (data: unknown[][], fileName: string) => {
    if (!state) return;
    const contacts = parseEmailsSheet(data);
    if (contacts.length === 0) {
      setAck({
        title: 'Sin correos',
        message: 'No he encontrado una columna Email / Mail / Correo. Exporta el grupo desde Outlook o Entra con nombre y correo.',
      });
      return;
    }
    const result = mergeAgentEmails(state, contacts);
    void persist({
      ...result.state,
      emailsFileName: fileName,
      emailsLoadedAt: nowIso(),
    }, backend);
    const missing = agentEmailIncidents(result.state).length;
    setAck({
      title: 'Correos cruzados',
      message: `He emparejado ${formatInt(result.matched)} agentes con email.${missing ? ` ${formatInt(missing)} agentes siguen sin correo: salen en Incidencias.` : ''}${result.unmatched.length ? ` Sin cruce del Excel: ${result.unmatched.slice(0, 8).join(', ')}.` : ''}`,
    });
  };

  const importDirectories = (sheets: Record<string, unknown[][]>) => {
    if (!state) return;
    const agentRows = pickSheet(sheets, ['agente']) || (Object.keys(sheets).length === 1 ? Object.values(sheets)[0] : null);
    const colectivoRows = pickSheet(sheets, ['colectivo']);
    const agents = parseAgentesSheet(agentRows || []);
    const colectivos = parseColectivosSheet(colectivoRows || []);
    if (agents.length === 0 && colectivos.length === 0) {
      setAck({ title: 'Sin directorio', message: 'Usa las hojas Agentes y Colectivos, o elige la plantilla.' });
      return;
    }
    const nextAgents = agents.length > 0 ? agents : state.agents;
    let nextColectivos = state.colectivos;
    if (colectivos.length > 0) {
      nextColectivos = colectivos.map((item) => {
        const byId = nextAgents.find((agent) => agent.id === item.idAgente);
        const byErp = nextAgents.find((agent) => agent.agenteErp.toLocaleLowerCase('es') === item.idAgente.toLocaleLowerCase('es'));
        return { ...item, idAgente: byId?.id || byErp?.id || item.idAgente };
      });
    }
    void persist({ ...state, agents: nextAgents, colectivos: nextColectivos }, backend);
    setAck({
      title: 'Directorio actualizado',
      message: `${nextAgents.length} agentes y ${nextColectivos.length} colectivos.`,
    });
  };

  const saveRule = (rule: Regla) => {
    if (!state) return;
    const exists = state.rules.some((item) => item.id === rule.id);
    const rules = exists
      ? state.rules.map((item) => (item.id === rule.id ? { ...rule, updatedAt: nowIso() } : item))
      : [...state.rules, { ...rule, createdAt: nowIso(), updatedAt: nowIso() }];
    void persist(reapplyRulesToLatestCarga({ ...state, rules }), backend);
    setEditingRule(null);
    setAck({
      title: 'Regla guardada',
      message: 'He vuelto a calcular Acciones con el máximo de días actual. No hace falta subir otra vez el CSV.',
    });
  };

  const downloadExport = async () => {
    if (!state || !last) return;
    const payload = exportPayload(state, last);
    const response = await fetch('/api/albaranes-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, fileName: last.fileName.replace(/\.[^.]+$/, '') + '_acciones.xlsx' }),
    });
    if (!response.ok) {
      setAck({ title: 'No se ha podido exportar', message: 'Revisa que exceljs esté instalado y vuelve a generar el Excel.' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = ACCIONES_XLSX_FILE;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!state) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]">Cargando control de albaranes…</p>;
  }

  return (
    <div className="space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />

      {setupSql && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Falta la tabla en Supabase. Pégalo en el SQL Editor:</p>
          <textarea readOnly className="mt-2 h-28 w-full rounded-md border border-amber-200 bg-white p-2 font-mono text-[11px]" value={setupSql} />
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-5 text-sm shadow-lg">
            <p className="font-display text-base font-semibold">Cargando albaranes</p>
            <p className="mt-1 text-[var(--text-secondary)]">{busy}</p>
          </div>
        </div>
      )}

      {tab === 'carga' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Sube el CSV diario de albaranes, el maestro de colectivos y, si lo tienes, el Excel de correos del grupo de Teams/Outlook.
          </p>
          <p className="text-xs text-[var(--text-muted)]">{ALCANCE_ALBARANES}</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <FileUpload
              inputId="albaranes-erp"
              label="Albaranes no facturados"
              hint="CSV del ERP con punto y coma. Misma estructura cada día."
              keepDropzone
              compact
              loaded={Boolean(last?.recordCount)}
              loadedName={last?.fileName}
              onRawFile={(file) => {
                lastFileRef.current = file;
                setBusy('Leyendo archivo…');
              }}
              onFileLoaded={handleAlbaranesFile}
            />
            <FileUpload
              inputId="albaranes-colectivos"
              label="Maestro de colectivos"
              hint="CSV del ERP: Nombre, Código, Agente, Comercial, Act."
              keepDropzone
              compact
              loaded={state.colectivos.length > 0}
              loadedName={state.colectivosFileName}
              onFileLoaded={handleColectivosFile}
            />
            <FileUpload
              inputId="albaranes-emails"
              label="Correos del grupo"
              hint="Excel/CSV con Nombre, Email e Idioma (vale el de Outlook, Teams admin o Entra)."
              keepDropzone
              compact
              loaded={Boolean(state.emailsFileName) || state.agents.some((item) => item.email.includes('@'))}
              loadedName={state.emailsFileName}
              onFileLoaded={handleEmailsFile}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              label="Albaranes cargados"
              value={last?.recordCount || 0}
              hint={last?.fileName || 'Aún no hay fichero'}
              amount={last ? formatIsoDateTime(last.loadedAt) : undefined}
              ok={Boolean(last?.recordCount)}
            />
            <Kpi
              label="Colectivos cargados"
              value={state.colectivos.length}
              hint={state.colectivosFileName || 'Aún no hay fichero'}
              amount={state.colectivosLoadedAt ? formatIsoDateTime(state.colectivosLoadedAt) : undefined}
              ok={state.colectivos.length > 0}
            />
            <Kpi
              label="Agentes con email"
              value={`${formatInt(state.agents.filter((item) => item.email.includes('@')).length)} / ${formatInt(uniqueAgentes(state).length)}`}
              hint={state.emailsFileName || (uniqueAgentes(state).length ? 'Cruce con el maestro de colectivos' : 'Sube colectivos primero')}
              amount={state.emailsLoadedAt ? formatIsoDateTime(state.emailsLoadedAt) : undefined}
              ok={Boolean(state.emailsFileName) || state.agents.some((item) => item.email.includes('@'))}
            />
          </div>
        </div>
      )}

      {tab === 'resumen' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">{ALCANCE_ALBARANES}</p>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelect label="Serie" values={vistaSerie} onChange={setVistaSerie} options={series.map((item) => [item, item])} />
            <MultiSelect label="Estado" values={vistaEstado} onChange={setVistaEstado} options={estados.map((item) => [item, item])} />
            {agentesVista.length > 0 && (
              <MultiSelect label="Agente" values={vistaAgente} onChange={setVistaAgente} options={agentesVista.map((item) => [item, item])} />
            )}
            {(vistaSerie.length || vistaEstado.length || vistaAgente.length) ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => {
                  setVistaSerie([]);
                  setVistaEstado([]);
                  setVistaAgente([]);
                }}
              >
                Quitar filtros
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Kpi label="Última carga" value={formatIsoDateTime(kpis?.lastLoadedAt || kpis?.lastLoadDate)} hint={kpis?.lastFileName || 'Aún no hay fichero'} />
            <Kpi
              label="Total albaranes"
              value={kpis?.activeCount || 0}
              hint={kpis?.shareOfTotal != null ? `${formatShare(kpis.activeCount, kpis.baselineCount)} del total` : undefined}
              amount={kpis?.totalImporte ? formatEuro(kpis.totalImporte) : undefined}
            />
            <Kpi label="Cumplen reglas" value={kpis?.actionCount || 0} />
            <Kpi label="Nº estados" value={kpis?.estadoCount || 0} />
            <Kpi label="Nº series" value={kpis?.serieCount || 0} />
            <Kpi label="Incidencias" value={kpis?.incidentCount || 0} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <HistoryTable
              title="Por estado"
              caption={shareCaption(vistaSerie, vistaEstado, vistaAgente)}
              baseTotal={kpis?.activeCount || 0}
              rows={kpis?.estadoCounts || []}
            />
            <HistoryTable
              title="Por serie"
              caption={shareCaption(vistaSerie, vistaEstado, vistaAgente)}
              baseTotal={kpis?.activeCount || 0}
              rows={kpis?.serieCounts || []}
            />
          </div>
          <MonthAgeTable
            field={vintageField}
            onField={setVintageField}
            caption={shareCaption(vistaSerie, vistaEstado, vistaAgente)}
            baseTotal={kpis?.activeCount || 0}
            rows={vintageField === 'albaran' ? (kpis?.monthCounts || []) : (kpis?.estadoMonthCounts || [])}
          />
        </div>
      )}

      {tab === 'listado' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Todos los albaranes de la última subida. Pulsa una columna para ordenar (fechas y días de mayor a menor al primer clic).
          </p>
          {listing.length === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {last && last.recordCount > 0
                ? `El resumen tiene ${formatInt(last.recordCount)} albaranes, pero el listado aún no está guardado. Vuelve a Carga y sube otra vez Albaranes.csv (aunque sea el mismo archivo).`
                : 'Sube el CSV de albaranes en Carga para ver el listado completo.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={listQuery} onChange={setListQuery} />
            <MultiSelect label="Serie" values={listSerie} onChange={setListSerie} options={series.map((item) => [item, item])} />
            <MultiSelect label="Estado" values={listEstado} onChange={setListEstado} options={estados.map((item) => [item, item])} />
            {agentesVista.length > 0 && (
              <MultiSelect label="Agente" values={listAgente} onChange={setListAgente} options={agentesVista.map((item) => [item, item])} />
            )}
            {(listSerie.length || listEstado.length || listAgente.length || listQuery) ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => {
                  setListSerie([]);
                  setListEstado([]);
                  setListAgente([]);
                  setListQuery('');
                }}
              >
                Quitar filtros
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                const hoy = todayIso();
                const header = ['Albarán', 'Serie', 'Estado', 'Fecha albarán', 'Fecha estado', 'Días creación', 'Días estado', 'Agente'];
                const rows = filteredListing.map((row) => [
                  row.albaran,
                  row.serie,
                  row.estado,
                  formatIsoDate(row.fechaAlbaran),
                  formatIsoDate(row.fechaEstado),
                  row.fechaAlbaran ? daysBetween(row.fechaAlbaran, hoy) : '',
                  row.fechaEstado ? daysBetween(row.fechaEstado, hoy) : '',
                  row.agente,
                ]);
                downloadAoa({ Listado: [header, ...rows] }, `albaranes_listado_${last?.loadDate || todayIso()}.xlsx`);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {formatInt(filteredListing.length)} albaranes
            {filteredListing.length !== listing.length ? ` de ${formatInt(listing.length)}` : ''}.
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {LIST_COLUMNS.map((col) => {
                    const active = listSort.key === col.key;
                    return (
                      <th key={col.key} className="whitespace-nowrap px-2 py-2 font-semibold">
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 ${active ? 'text-[var(--text-primary)]' : ''}`}
                          onClick={() => setListSort((current) => (
                            current.key === col.key
                              ? { key: col.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: col.key, dir: col.key.startsWith('fecha') || col.key.startsWith('dias') ? 'desc' : 'asc' }
                          ))}
                        >
                          {col.label}
                          {active ? (listSort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 opacity-30" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {listingPage.length === 0 && (
                  <tr><td className="px-3 py-6 text-sm text-[var(--text-muted)]" colSpan={8}>Sin albaranes con este filtro.</td></tr>
                )}
                {listingPage.map((row, index) => {
                  const hoy = todayIso();
                  return (
                    <tr key={`${row.albaran}-${listPage * LIST_PAGE + index}`} className="border-t border-[var(--border)]">
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{row.albaran}</td>
                      <td className="px-2 py-2">{displayDash(row.serie)}</td>
                      <td className="px-2 py-2">{row.estado}</td>
                      <td className="px-2 py-2">{formatIsoDate(row.fechaAlbaran)}</td>
                      <td className="px-2 py-2">{formatIsoDate(row.fechaEstado)}</td>
                      <td className="px-2 py-2 tabular-nums">{row.fechaAlbaran ? formatInt(daysBetween(row.fechaAlbaran, hoy)) : '—'}</td>
                      <td className="px-2 py-2 tabular-nums">{row.fechaEstado ? formatInt(daysBetween(row.fechaEstado, hoy)) : '—'}</td>
                      <td className="px-2 py-2">{displayDash(row.agente)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {listPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={listPage === 0} onClick={() => setListPage((n) => Math.max(0, n - 1))}>Anterior</button>
              <span className="text-[var(--text-muted)]">Página {listPage + 1} de {formatInt(listPages)}</span>
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={listPage >= listPages - 1} onClick={() => setListPage((n) => Math.min(listPages - 1, n + 1))}>Siguiente</button>
            </div>
          )}
        </div>
      )}

      {tab === 'acciones' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Albaranes de la última subida que cumplen una regla activa. Este es el listado que se exporta.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={query} onChange={setQuery} />
            <Select value={filterRule} onChange={setFilterRule} label="Regla" options={state.rules.map((rule) => [rule.id, `${rule.id} · ${rule.nombre}`])} />
            <Select value={filterSerie} onChange={setFilterSerie} label="Serie" options={series.map((item) => [item, item])} />
            <Select value={filterEstado} onChange={setFilterEstado} label="Estado" options={estados.map((item) => [item, item])} />
            <Select value={filterResp} onChange={setFilterResp} label="Responsable" options={Array.from(new Set(actions.map((row) => row.agente).filter(Boolean))).map((item) => [item, item])} />
            {(filterRule || filterSerie || filterEstado || filterResp || query) ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => {
                  setFilterRule('');
                  setFilterSerie('');
                  setFilterEstado('');
                  setFilterResp('');
                  setQuery('');
                }}
              >
                Quitar filtros
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                const header = ACT_COLUMNS.map((col) => col.label);
                const rows = filteredActions.map((row) => ACT_COLUMNS.map((col) => actionCell(row, col.key)));
                void downloadNamedExcelTable({
                  fileName: ACCIONES_XLSX_FILE,
                  sheetName: ACCIONES_XLSX_SHEET,
                  tableName: ACCIONES_XLSX_TABLE,
                  header,
                  rows,
                }).catch(() => setAck({
                  title: 'No se ha podido exportar',
                  message: 'No he podido generar la tabla de Excel. Reinténtalo.',
                }));
              }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {formatInt(filteredActions.length)} albaranes
            {filteredActions.length !== actions.length ? ` de ${formatInt(actions.length)}` : ''}.
            El Excel se descarga siempre como {ACCIONES_XLSX_FILE}: hoja {ACCIONES_XLSX_SHEET}, tabla {ACCIONES_XLSX_TABLE}.
          </p>
          <ActionTable
            rows={actionsPage}
            sort={actSort}
            onSort={(key) => setActSort((current) => (
              current.key === key
                ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: key.startsWith('fecha') || key.startsWith('dias') || key === 'plazoDias' ? 'desc' : 'asc' }
            ))}
          />
          {actPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={actPage === 0} onClick={() => setActPage((n) => Math.max(0, n - 1))}>Anterior</button>
              <span className="text-[var(--text-muted)]">Página {actPage + 1} de {formatInt(actPages)}</span>
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={actPage >= actPages - 1} onClick={() => setActPage((n) => Math.min(actPages - 1, n + 1))}>Siguiente</button>
            </div>
          )}
        </div>
      )}

      {tab === 'incidencias' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Albaranes de la última subida que hay que revisar: sin serie, WWW sin colectivo, o colectivo desconocido, inactivo, sin agente o con varios códigos. También aparecen los agentes del maestro que siguen sin email.
          </p>
          {state.colectivos.length === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sube el maestro de colectivos en Carga para detectar códigos desconocidos, inactivos o sin agente.
            </p>
          )}
          {incidents.length === 0 && last && last.recordCount > 0 && !(last.listing && last.listing.length) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              El resumen tiene {formatInt(last.recordCount)} albaranes, pero el detalle aún no está guardado. Vuelve a Carga y sube otra vez Albaranes.csv.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Albaranes con incidencia" value={incidents.filter((item) => item.reason !== 'Agente sin email').length} />
            <Kpi label="Agentes sin email" value={incidents.filter((item) => item.reason === 'Agente sin email').length} />
            <Kpi label="Colectivos activos sin agente" value={masterSinAgente.length} hint="En el maestro" />
            {incidentCounts.map((item) => (
              <Kpi key={item.reason} label={item.reason} value={item.count} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={incQuery} onChange={setIncQuery} />
            <MultiSelect label="Serie" values={incSerie} onChange={setIncSerie} options={series.map((item) => [item, item])} />
            <MultiSelect
              label="Motivo"
              values={incReason}
              onChange={setIncReason}
              options={incidentCounts.map((item) => [item.reason, `${item.reason} (${formatInt(item.count)})`])}
            />
            {(incReason.length || incSerie.length || incQuery) ? (
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => {
                  setIncReason([]);
                  setIncSerie([]);
                  setIncQuery('');
                }}
              >
                Quitar filtros
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                const header = ['Albarán', 'Serie', 'Estado', 'Agente', 'Colectivo', 'Motivo', 'Qué hacer'];
                const rows = filteredIncidents.map((row) => [
                  row.albaran,
                  row.serie,
                  row.estado,
                  row.agente,
                  row.codigoColectivo,
                  row.reason,
                  DATA_INCIDENT_DETAIL[row.reason],
                ]);
                downloadAoa({ Incidencias: [header, ...rows] }, `albaranes_incidencias_${last?.loadDate || todayIso()}.xlsx`);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {formatInt(filteredIncidents.length)} incidencias
            {filteredIncidents.length !== incidents.length ? ` de ${formatInt(incidents.length)}` : ''}.
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Albarán', 'Serie', 'Estado', 'Agente', 'Colectivo', 'Motivo', 'Qué hacer'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidentsPage.length === 0 && (
                  <tr><td className="px-3 py-6 text-[var(--text-muted)]" colSpan={7}>Sin incidencias con este filtro.</td></tr>
                )}
                {incidentsPage.map((row: DataIncident) => (
                  <tr key={row.key} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium">{displayDash(row.albaran)}</td>
                    <td className="px-3 py-2">{displayDash(row.serie)}</td>
                    <td className="px-3 py-2">{row.estado}</td>
                    <td className="px-3 py-2">{displayDash(row.agente)}</td>
                    <td className="px-3 py-2">{displayDash(row.codigoColectivo)}</td>
                    <td className="px-3 py-2 text-[var(--danger)]">{row.reason}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{DATA_INCIDENT_DETAIL[row.reason]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {incPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={incPage === 0} onClick={() => setIncPage((n) => Math.max(0, n - 1))}>Anterior</button>
              <span className="text-[var(--text-muted)]">Página {incPage + 1} de {formatInt(incPages)}</span>
              <button type="button" className="rounded-md border border-[var(--border)] px-2 py-1 disabled:opacity-40" disabled={incPage >= incPages - 1} onClick={() => setIncPage((n) => Math.min(incPages - 1, n + 1))}>Siguiente</button>
            </div>
          )}
        </div>
      )}

      {tab === 'reglas' && (
        <RulesPanel
          state={state}
          actuales={actuales}
          loadDate={last?.loadDate || todayIso()}
          editing={editingRule}
          onEdit={setEditingRule}
          onSave={saveRule}
          onToggle={(rule) => saveRule({ ...rule, activa: !rule.activa })}
        />
      )}

      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--text-secondary)]">
                Filas = estado. Columnas = día de subida. Si hay varias cargas el mismo día, cuenta la última.
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {formatInt(history.dates.length)} {history.dates.length === 1 ? 'día' : 'días'} con foto.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${histMetric === 'count' ? 'bg-[var(--text-primary)] text-white' : ''}`}
                onClick={() => setHistMetric('count')}
              >
                Nº albaranes
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${histMetric === 'importe' ? 'bg-[var(--text-primary)] text-white' : ''}`}
                onClick={() => setHistMetric('importe')}
              >
                Importe
              </button>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold"
              onClick={() => {
                const header = ['Estado', ...history.dates.map((date) => formatIsoDate(date)), 'Total'];
                const rows = history.rows.map((row) => {
                  const cells = row.values.map((item) => (histMetric === 'count' ? item.count : Math.round(item.importe * 100) / 100));
                  const total = row.values.reduce((sum, item) => sum + (histMetric === 'count' ? item.count : item.importe), 0);
                  return [row.estado, ...cells, histMetric === 'count' ? total : Math.round(total * 100) / 100];
                });
                const totalRow = [
                  'Total',
                  ...history.totals.map((item) => (histMetric === 'count' ? item.count : Math.round(item.importe * 100) / 100)),
                  histMetric === 'count'
                    ? history.totals.reduce((sum, item) => sum + item.count, 0)
                    : Math.round(history.totals.reduce((sum, item) => sum + item.importe, 0) * 100) / 100,
                ];
                downloadAoa({ Historico: [header, ...rows, totalRow] }, `albaranes_historico_${histMetric}.xlsx`);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
          {history.dates.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Aún no hay fotos. Sube Albaranes.csv en Carga.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="sticky left-0 z-20 whitespace-nowrap bg-[var(--bg-soft)] px-3 py-2 font-semibold">Estado</th>
                    {history.dates.map((date) => (
                      <th key={date} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{formatIsoDate(date)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr key={row.estado} className="border-t border-[var(--border)]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-3 py-2 font-medium">{row.estado}</td>
                      {row.values.map((item, index) => (
                        <td key={`${row.estado}-${history.dates[index]}`} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                          {histMetric === 'count' ? formatInt(item.count) : formatEuro(item.importe)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--border)] font-semibold">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--bg-card)] px-3 py-2">Total</td>
                    {history.totals.map((item, index) => (
                      <td key={`total-${history.dates[index]}`} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                        {histMetric === 'count' ? formatInt(item.count) : formatEuro(item.importe)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'directorios' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDirTab('agentes')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dirTab === 'agentes' ? 'bg-[var(--text-primary)] text-white' : 'border border-[var(--border)]'}`}>Agentes</button>
            <button type="button" onClick={() => setDirTab('colectivos')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${dirTab === 'colectivos' ? 'bg-[var(--text-primary)] text-white' : 'border border-[var(--border)]'}`}>Colectivos</button>
            <button
              type="button"
              className="ml-auto rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
              onClick={() => downloadAoa({ Agentes: AGENTES_TEMPLATE, Colectivos: COLECTIVOS_TEMPLATE }, 'directorio_albaranes.xlsx')}
            >
              Descargar plantilla
            </button>
          </div>
          <FileUpload
            inputId="albaranes-dir"
            label="Excel maestro de responsables"
            hint="Hojas Agentes y Colectivos. Coincidencias exactas, sin adivinar códigos."
            keepDropzone
            onFileLoaded={() => {}}
            onWorkbookLoaded={(sheets) => importDirectories(sheets)}
          />
          {dirTab === 'agentes' ? (
            <AgentTable
              agents={state.agents}
              onChange={(agents) => void persist({ ...state, agents }, backend)}
            />
          ) : (
            <ColectivoTable
              colectivos={state.colectivos}
              agents={state.agents}
              onChange={(colectivos) => void persist({ ...state, colectivos }, backend)}
            />
          )}
        </div>
      )}

      {tab === 'comunicaciones' && (
        <div className="space-y-4">
          <button type="button" onClick={() => void downloadExport()} className="flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> Generar Excel del día
          </button>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Fecha', 'Archivo', 'Destinatarios', 'Albaranes', 'A enviar', 'Omitidos', 'Incidencias'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...state.lots].reverse().map((lot) => (
                  <tr key={lot.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{formatIsoDate(lot.loadDate)}</td>
                    <td className="px-3 py-2">{lot.fileName}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.destinatarios)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.albaranes)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.enviados)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.omitidos)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(lot.incidencias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {['Fecha', 'Responsable', 'Email', 'Albaranes', 'Enviar', 'Asunto'].map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...state.communications].reverse().slice(0, 80).map((item) => (
                  <tr key={`${item.clave}-${item.generatedAt}`} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{formatIsoDate(item.loadDate)}</td>
                    <td className="px-3 py-2">{item.agenteResuelto}</td>
                    <td className="px-3 py-2">{item.email}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInt(item.numeroAlbaranes)}</td>
                    <td className="px-3 py-2">{item.enviar ? 'Sí' : 'No'}</td>
                    <td className="px-3 py-2">{item.asunto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ack && <Ack title={ack.title} message={ack.message} onClose={() => setAck(null)} />}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs">
      <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar" className="w-36 bg-transparent outline-none" />
    </label>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <label className="relative inline-flex">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-md border border-[var(--border)] bg-white py-1.5 pl-2.5 pr-8 text-xs">
        <option value="">{label}</option>
        {options.filter((item) => item[0]).map(([id, name]) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
    </label>
  );
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const shown = values.length === 0
    ? label
    : values.length === 1
      ? (options.find((item) => item[0] === values[0])?.[1] || values[0])
      : `${values.length} ${label.toLocaleLowerCase('es')}`;
  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex min-w-[8.5rem] max-w-[16rem] items-center rounded-md border border-[var(--border)] bg-white py-1.5 pl-2.5 pr-8 text-left text-xs"
      >
        <span className="truncate">{shown}</span>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 min-w-[16rem] overflow-auto rounded-md border border-[var(--border)] bg-white py-1 shadow-lg">
          {options.filter((item) => item[0]).map(([id, name]) => {
            const on = values.includes(id);
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-soft)]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? values.filter((item) => item !== id) : [...values, id])}
                />
                <span>{name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shareCaption(series: string[], estados: string[], agentes: string[]): string {
  const bits: string[] = [];
  if (series.length === 1) bits.push(series[0]);
  else if (series.length > 1) bits.push(`${series.length} series`);
  if (estados.length === 1) bits.push(estados[0]);
  else if (estados.length > 1) bits.push(`${estados.length} estados`);
  if (agentes.length === 1) bits.push(agentes[0]);
  else if (agentes.length > 1) bits.push(`${agentes.length} agentes`);
  if (bits.length === 0) return '% sobre el total';
  return `% sobre ${bits.join(' · ')}`;
}

function MonthAgeTable({
  field,
  onField,
  caption,
  rows,
  baseTotal,
}: {
  field: 'albaran' | 'estado';
  onField: (value: 'albaran' | 'estado') => void;
  caption: string;
  rows: Array<{ name: string; count: number; importe: number }>;
  baseTotal: number;
}) {
  const hoy = todayIso();
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Por mes-año</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            De más antiguo a más reciente. Así ves qué albaranes llevan más tiempo. {caption}.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${field === 'albaran' ? 'bg-[var(--text-primary)] text-white' : ''}`}
            onClick={() => onField('albaran')}
          >
            Fecha albarán
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${field === 'estado' ? 'bg-[var(--text-primary)] text-white' : ''}`}
            onClick={() => onField('estado')}
          >
            Fecha estado
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Sube otra vez Albaranes.csv en Carga para calcular el corte por mes.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                {['Mes', 'Albaranes', '%', 'Importe', 'Antigüedad'].map((col) => (
                  <th key={col} className="px-2 py-2 font-semibold first:pl-0 last:pr-0 last:text-right">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const age = monthsBetween(row.name, hoy);
                return (
                  <tr key={row.name} className="border-t border-[var(--border)]">
                    <td className="px-2 py-2 pl-0 font-medium">{formatMonthKey(row.name)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatInt(row.count)}</td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-secondary)]">{formatShare(row.count, baseTotal)}</td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-muted)]">{row.importe ? formatEuro(row.importe) : '—'}</td>
                    <td className="px-2 py-2 pr-0 text-right tabular-nums">
                      {age == null ? '—' : age === 0 ? 'Este mes' : `${formatInt(age)} ${age === 1 ? 'mes' : 'meses'}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoryTable({
  title,
  caption,
  rows,
  baseTotal,
}: {
  title: string;
  caption: string;
  rows: Array<{ name: string; count: number; importe: number }>;
  baseTotal: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{caption}</p>
      </div>
      <div className="mt-2 space-y-1.5 text-sm">
        {rows.length === 0 && <p className="text-[var(--text-muted)]">Sin datos de carga.</p>}
        {rows.map((row) => (
          <div key={row.name} className="flex items-start justify-between gap-3">
            <span className="min-w-0 pr-2">{row.name}</span>
            <span className="shrink-0 text-right">
              <span className="tabular-nums">
                {formatInt(row.count)}
                <span className="ml-2 text-[var(--text-secondary)]">{formatShare(row.count, baseTotal)}</span>
              </span>
              {row.importe ? (
                <span className="mt-0.5 block text-[10px] leading-tight tabular-nums text-[var(--text-muted)]">
                  {formatEuro(row.importe)}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionTable({
  rows,
  sort,
  onSort,
}: {
  rows: AccionRow[];
  sort: { key: ActSortKey; dir: 'asc' | 'desc' };
  onSort: (key: ActSortKey) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-[var(--bg-soft)] uppercase tracking-wide text-[var(--text-muted)]">
          <tr>
            {ACT_COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th key={col.key} className="whitespace-nowrap px-2 py-2 font-semibold">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 ${active ? 'text-[var(--text-primary)]' : ''}`}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                    {active ? (sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 opacity-30" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="px-3 py-6 text-sm text-[var(--text-muted)]" colSpan={10}>Nadie cumple una regla activa.</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--border)]">
              {ACT_COLUMNS.map((col) => (
                <td key={col.key} className={`px-2 py-2 ${col.key === 'albaran' ? 'font-medium' : ''} ${col.key.includes('dias') || col.key === 'plazoDias' ? 'tabular-nums' : ''}`}>
                  {displayDash(String(actionCell(row, col.key)))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesPanel({
  state,
  actuales,
  loadDate,
  editing,
  onEdit,
  onSave,
  onToggle,
}: {
  state: AlbaranesState;
  actuales: ReturnType<typeof currentAlbaranes>;
  loadDate: string;
  editing: Regla | null;
  onEdit: (rule: Regla | null) => void;
  onSave: (rule: Regla) => void;
  onToggle: (rule: Regla) => void;
}) {
  const draft = editing || {
    id: nextRuleId(state.rules),
    nombre: '',
    activa: false,
    series: [...DEFAULT_SERIES],
    estado: '',
    plazoDias: 5,
    metodo: 'agente-o-colectivo' as const,
    frecuencia: 'diaria' as const,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const preview = countRuleHits(draft, actuales, loadDate);
  const seriesOptions = knownSeries(state);
  const estadoOptions = knownEstados(state);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-2">
        {state.rules.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{rule.id}</p>
                <p className="font-semibold">{rule.nombre}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {rule.series.join(', ')} · {rule.estado} · más de {rule.plazoDias} días
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Cumplirían ahora: {countRuleHits(rule, actuales, loadDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onToggle(rule)} className={`rounded-md px-2 py-1 text-xs font-semibold ${rule.activa ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--bg-soft)] text-[var(--text-muted)]'}`}>
                  {rule.activa ? 'Activa' : 'Inactiva'}
                </button>
                <button type="button" onClick={() => onEdit(rule)} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">Editar</button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onEdit({
            id: nextRuleId(state.rules),
            nombre: '',
            activa: false,
            series: [...DEFAULT_SERIES],
            estado: estadoOptions[0] || '',
            plazoDias: 5,
            metodo: 'agente-o-colectivo',
            frecuencia: 'diaria',
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })}
          className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Nueva regla
        </button>
      </div>
      {editing && (
      <form
        className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, updatedAt: nowIso() });
        }}
      >
        <p className="font-semibold">{editing ? `Editar ${draft.id}` : `Nueva ${draft.id}`}</p>
        <label className="block text-xs">
          Nombre
          <input required value={draft.nombre} onChange={(e) => onEdit({ ...draft, nombre: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs">
          Estado
          <input list="albaranes-estados" required value={draft.estado} onChange={(e) => onEdit({ ...draft, estado: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          <datalist id="albaranes-estados">
            {estadoOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
        </label>
        <label className="block text-xs">
          Plazo en días
          <input type="number" min={1} required value={draft.plazoDias} onChange={(e) => onEdit({ ...draft, plazoDias: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </label>
        <fieldset className="text-xs">
          <legend className="mb-1">Series</legend>
          <div className="flex flex-wrap gap-2">
            {seriesOptions.map((serie) => {
              const on = draft.series.includes(serie);
              return (
                <button
                  key={serie}
                  type="button"
                  onClick={() => onEdit({ ...draft, series: on ? draft.series.filter((item) => item !== serie) : [...draft.series, serie] })}
                  className={`rounded-full border px-3 py-1 ${on ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white' : 'border-[var(--border)]'}`}
                >
                  {serie}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.activa} onChange={(e) => onEdit({ ...draft, activa: e.target.checked })} />
          Activa
        </label>
        <p className="text-sm text-[var(--text-secondary)]">Con la carga actual cumplirían esta regla <strong>{preview}</strong> albaranes, aunque esté inactiva.</p>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-semibold text-white">Guardar</button>
          <button type="button" onClick={() => onEdit(null)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Cerrar</button>
        </div>
      </form>
      )}
    </div>
  );
}

function AgentTable({ agents, onChange }: { agents: Agent[]; onChange: (agents: Agent[]) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--bg-soft)] text-xs uppercase text-[var(--text-muted)]">
          <tr>
            {['Id', 'Agente ERP', 'Nombre', 'Email', 'Idioma', 'Supervisor', 'Activo', ''].map((col) => <th key={col || 'x'} className="px-2 py-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => (
            <tr key={agent.id} className="border-t border-[var(--border)]">
              <td className="px-2 py-1"><input value={agent.id} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, id: e.target.value } : item))} className="w-24 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.agenteErp} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, agenteErp: e.target.value } : item))} className="w-36 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.nombre} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, nombre: e.target.value } : item))} className="w-36 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.email} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, email: e.target.value } : item))} className="w-48 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.idioma || ''} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, idioma: e.target.value.toUpperCase() } : item))} className="w-16 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={agent.supervisor} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, supervisor: e.target.value } : item))} className="w-28 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input type="checkbox" checked={agent.activo} onChange={(e) => onChange(agents.map((item, i) => i === index ? { ...item, activo: e.target.checked } : item))} /></td>
              <td className="px-2 py-1"><button type="button" onClick={() => onChange(agents.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-[var(--text-muted)]" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="m-3 flex items-center gap-2 text-sm"
        onClick={() => onChange([...agents, { id: newId('ag'), agenteErp: '', nombre: '', email: '', idioma: '', supervisor: '', activo: true }])}
      >
        <Plus className="h-4 w-4" /> Agente
      </button>
    </div>
  );
}

function ColectivoTable({ colectivos, agents, onChange }: { colectivos: Colectivo[]; agents: Agent[]; onChange: (rows: Colectivo[]) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--bg-soft)] text-xs uppercase text-[var(--text-muted)]">
          <tr>
            {['Código', 'Nombre', 'Responsable', 'Activo', ''].map((col) => <th key={col || 'x'} className="px-2 py-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {colectivos.map((row, index) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="px-2 py-1"><input value={row.codigo} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, codigo: e.target.value } : item))} className="w-32 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1"><input value={row.nombre} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, nombre: e.target.value } : item))} className="w-48 rounded border border-[var(--border)] px-2 py-1 text-xs" /></td>
              <td className="px-2 py-1">
                <select value={row.idAgente} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, idAgente: e.target.value } : item))} className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                  <option value="">Elegir</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.nombre || agent.agenteErp}</option>)}
                </select>
              </td>
              <td className="px-2 py-1"><input type="checkbox" checked={row.activo} onChange={(e) => onChange(colectivos.map((item, i) => i === index ? { ...item, activo: e.target.checked } : item))} /></td>
              <td className="px-2 py-1"><button type="button" onClick={() => onChange(colectivos.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4 text-[var(--text-muted)]" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="m-3 flex items-center gap-2 text-sm"
        onClick={() => onChange([...colectivos, { id: newId('col'), codigo: '', nombre: '', idAgente: '', agente: '', comercial: '', activo: true }])}
      >
        <Plus className="h-4 w-4" /> Colectivo
      </button>
    </div>
  );
}
