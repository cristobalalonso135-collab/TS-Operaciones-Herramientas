'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  ABONO_ORIGINS,
  ABONO_STATUSES,
  ABONOS_PEOPLE,
  addDaysIso,
  claimKindLabel,
  claimsForCase,
  computeAll,
  DEFAULT_NEW_AUTHOR,
  displayDash,
  formatIsoDate,
  formatMoney,
  groupWeeklyTasks,
  makeClaim,
  mergeCatalog,
  nextRegistro,
  parseMoney,
  receiptsForCase,
  statusAfterReceipts,
  todayIso,
  upcomingCash,
  weeklyTasks,
  type AbonoCase,
  type AbonoComputed,
  type AbonoOrigin,
  type AbonoReceipt,
  type AbonoStatus,
  type AbonosState,
  type TradeTerm,
  type WeeklyTask,
  type WeeklyTaskKind,
} from '@/lib/abonos-model';
import {
  abonosExportRows,
  buildImportPreview,
  detectAbonosHeaderRow,
  guessColumnMap,
  previewToRecords,
  receiptsExportRows,
  type ImportColumnMap,
  type ImportPreviewRow,
} from '@/lib/abonos-excel';
import { addCatalogValue, loadAbonosState, saveAbonosState, type AbonosBackend } from '@/lib/abonos-store';
import { AlertTriangle, ChevronRight, GripVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Revisión' },
  { id: 'seguimiento', label: 'Abonos' },
  { id: 'terms', label: 'Trade Terms' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SortKey =
  | 'registro'
  | 'addedBy'
  | 'dueDate'
  | 'brand'
  | 'type'
  | 'area'
  | 'teamMotivo'
  | 'expectedAmount'
  | 'receivedTotal'
  | 'pending'
  | 'status'
  | 'comment';

const MONEY_COLS = new Set<SortKey>(['expectedAmount', 'receivedTotal', 'pending']);

const COLUMN_DEFS: Array<{ key: SortKey; label: string; width: number }> = [
  { key: 'registro', label: 'Registro', width: 88 },
  { key: 'addedBy', label: 'Añadido por', width: 108 },
  { key: 'dueDate', label: 'Fecha prevista', width: 112 },
  { key: 'brand', label: 'Empresa', width: 108 },
  { key: 'type', label: 'Tipo', width: 120 },
  { key: 'area', label: 'Área', width: 108 },
  { key: 'teamMotivo', label: 'Equipo / Motivo', width: 140 },
  { key: 'expectedAmount', label: 'Importe previsto', width: 118 },
  { key: 'receivedTotal', label: 'Importe recibido', width: 118 },
  { key: 'pending', label: 'Importe pendiente', width: 118 },
  { key: 'status', label: 'Estado', width: 150 },
  { key: 'comment', label: 'Comentario', width: 180 },
];

const COL_STORAGE = 'ts-abonos-cols-v5';
const BLANK = '__blank__';
const DEFAULT_ORDER = COLUMN_DEFS.map((col) => col.key);
const DEFAULT_WIDTHS = Object.fromEntries(COLUMN_DEFS.map((col) => [col.key, col.width])) as Record<SortKey, number>;
const COLUMN_BY_KEY = Object.fromEntries(COLUMN_DEFS.map((col) => [col.key, col])) as Record<SortKey, (typeof COLUMN_DEFS)[number]>;

function loadColLayout(): { order: SortKey[]; widths: Record<SortKey, number> } {
  if (typeof window === 'undefined') return { order: DEFAULT_ORDER, widths: DEFAULT_WIDTHS };
  try {
    const raw = window.localStorage.getItem(COL_STORAGE);
    if (!raw) return { order: DEFAULT_ORDER, widths: { ...DEFAULT_WIDTHS } };
    const parsed = JSON.parse(raw) as { order?: SortKey[]; widths?: Partial<Record<SortKey, number>> };
    const order = DEFAULT_ORDER.filter((key) => parsed.order?.includes(key)).concat(DEFAULT_ORDER.filter((key) => !parsed.order?.includes(key)));
    const widths = { ...DEFAULT_WIDTHS };
    DEFAULT_ORDER.forEach((key) => {
      const width = parsed.widths?.[key];
      if (typeof width === 'number' && width >= 72) widths[key] = width;
    });
    return { order, widths };
  } catch {
    return { order: DEFAULT_ORDER, widths: { ...DEFAULT_WIDTHS } };
  }
}

function uniquePresent(values: Array<string | null | undefined>): { options: string[]; hasBlank: boolean } {
  const hasBlank = values.some((value) => !String(value ?? '').trim());
  return { options: mergeCatalog([], values.map((value) => String(value ?? '').trim()).filter(Boolean)), hasBlank };
}

function matchesFilter(selected: string, actual: string): boolean {
  if (!selected) return true;
  if (selected === BLANK) return !actual.trim();
  return actual === selected;
}

function renderAbonoCell(row: AbonoComputed, key: SortKey) {
  switch (key) {
    case 'registro':
      return `#${row.registro}`;
    case 'addedBy':
      return displayDash(row.addedBy);
    case 'dueDate':
      return formatIsoDate(row.dueDate);
    case 'brand':
      return displayDash(row.brand);
    case 'type':
      return displayDash(row.type);
    case 'area':
      return displayDash(row.area);
    case 'teamMotivo':
      return displayDash(row.teamMotivo);
    case 'expectedAmount':
      return formatMoney(row.expectedAmount);
    case 'receivedTotal':
      return formatMoney(row.receivedTotal);
    case 'pending':
      return formatMoney(row.pending);
    case 'status':
      return <StatusPill row={row} />;
    case 'comment':
      return displayDash(row.comment);
    default:
      return null;
  }
}

function paymentLabel(index: number): string {
  if (index === 0) return '1er pago';
  if (index === 1) return '2º pago';
  return `Pago ${index + 1}`;
}

const emptyFilters = {
  brand: '',
  type: '',
  area: '',
  teamMotivo: '',
  origin: '',
  status: '',
  year: '',
  addedBy: '',
  overdue: false,
  review: false,
  search: '',
};

const emptyForm = (): Partial<AbonoCase> => ({
  addedBy: DEFAULT_NEW_AUTHOR,
  dueDate: '',
  brand: '',
  type: 'Credit Notes',
  area: '',
  teamMotivo: '',
  origin: 'Puntual',
  tradeTermId: null,
  informedBy: '',
  expectedAmount: null,
  status: 'Pendiente',
  nextReview: '',
  comment: '',
});

function CatalogField({
  label,
  value,
  options,
  required,
  allowFree,
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  allowFree?: boolean;
  onChange: (value: string) => void;
  onAdd: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}{required ? ' *' : ''}</span>
      {adding || allowFree ? (
        <div className="flex gap-2">
          <input
            list={`${label}-list`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          <datalist id={`${label}-list`}>
            {options.map((option) => <option key={option} value={option} />)}
          </datalist>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Selecciona</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-10 shrink-0 rounded-md border border-[var(--border)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            +
          </button>
        </div>
      )}
      {adding && !allowFree && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nueva opción"
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const next = draft.trim();
              if (!next) return;
              onAdd(next);
              onChange(next);
              setDraft('');
              setAdding(false);
            }}
            className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-medium text-white"
          >
            Añadir
          </button>
        </div>
      )}
    </label>
  );
}

export default function AbonosTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [state, setState] = useState<AbonosState | null>(null);
  const [backend, setBackend] = useState<AbonosBackend>('local');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'dueDate', dir: 'asc' });
  const [columnOrder, setColumnOrder] = useState<SortKey[]>(DEFAULT_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<SortKey, number>>(DEFAULT_WIDTHS);
  const [colsReady, setColsReady] = useState(false);
  const dragCol = useRef<SortKey | null>(null);
  const resizeRef = useRef<{ key: SortKey; startX: number; startW: number } | null>(null);
  const [editing, setEditing] = useState<AbonoCase | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<Partial<AbonoCase>>(emptyForm());
  const [receiptDraft, setReceiptDraft] = useState({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
  const [importHeaders, setImportHeaders] = useState<unknown[]>([]);
  const [importRows, setImportRows] = useState<unknown[][]>([]);
  const [importMap, setImportMap] = useState<ImportColumnMap | null>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [bulkArea, setBulkArea] = useState('Grassroots');
  const [termForm, setTermForm] = useState<Partial<TradeTerm>>({ brand: 'Adidas', name: '', compensation: '', triggerText: '', period: '', active: true, comment: '' });
  const [openTaskKind, setOpenTaskKind] = useState<WeeklyTaskKind | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [claimDraft, setClaimDraft] = useState({ claimedAt: todayIso(), note: '' });

  const persist = useCallback(async (next: AbonosState, currentBackend: AbonosBackend) => {
    setState(next);
    try {
      await saveAbonosState(next, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar en el servidor. Queda en este navegador.');
    }
  }, []);

  useEffect(() => {
    const layout = loadColLayout();
    setColumnOrder(layout.order);
    setColumnWidths(layout.widths);
    setColsReady(true);
  }, []);

  useEffect(() => {
    if (!colsReady || typeof window === 'undefined') return;
    window.localStorage.setItem(COL_STORAGE, JSON.stringify({ order: columnOrder, widths: columnWidths }));
  }, [colsReady, columnOrder, columnWidths]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const session = resizeRef.current;
      if (!session) return;
      const next = Math.max(72, session.startW + (event.clientX - session.startX));
      setColumnWidths((widths) => ({ ...widths, [session.key]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAbonosState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar abonos.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEditing(null);
      setForm(emptyForm());
      setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [panelOpen]);

  const computed = useMemo(() => (state ? computeAll(state) : []), [state]);
  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase('es');
    return computed.filter((row) => {
      if (filters.brand && !matchesFilter(filters.brand, row.brand)) return false;
      if (filters.type && !matchesFilter(filters.type, row.type)) return false;
      if (filters.area && !matchesFilter(filters.area, row.area)) return false;
      if (filters.teamMotivo && !matchesFilter(filters.teamMotivo, row.teamMotivo)) return false;
      if (filters.origin && !matchesFilter(filters.origin, row.origin)) return false;
      if (filters.status && !matchesFilter(filters.status, row.status)) return false;
      if (filters.addedBy && !matchesFilter(filters.addedBy, row.addedBy)) return false;
      if (filters.year && !matchesFilter(filters.year, (row.dueDate || '').slice(0, 4))) return false;
      if (filters.overdue && row.overdueDays === null) return false;
      if (filters.review && !row.reviewOverdue) return false;
      if (search) {
        const blob = [row.registro, row.brand, row.type, row.area, row.teamMotivo, row.comment, row.informedBy, row.tradeTermName].join(' ').toLocaleLowerCase('es');
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }, [computed, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const result = String(left ?? '').localeCompare(String(right ?? ''), 'es', { numeric: true });
      return sort.dir === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort]);

  const listTotals = useMemo(() => filtered.reduce((acc, row) => ({
    expected: acc.expected + (row.expectedAmount ?? 0),
    received: acc.received + row.receivedTotal,
    pending: acc.pending + row.pending,
  }), { expected: 0, received: 0, pending: 0 }), [filtered]);

  const tasks = useMemo(() => weeklyTasks(computed), [computed]);
  const taskGroups = useMemo(() => groupWeeklyTasks(tasks), [tasks]);
  const cash = useMemo(() => upcomingCash(computed), [computed]);
  const openTaskGroup = taskGroups.find((group) => group.kind === openTaskKind) || null;

  useEffect(() => {
    if (openTaskKind && !taskGroups.some((group) => group.kind === openTaskKind)) {
      setOpenTaskKind(null);
    }
  }, [openTaskKind, taskGroups]);

  const kpis = useMemo(() => {
    const claim = tasks.filter((task) => task.kind === 'reclamar' || task.kind === 'seguir');
    return {
      taskCount: tasks.length,
      claimCount: claim.length,
      claimPending: claim.reduce((sum, task) => sum + task.row.pending, 0),
    };
  }, [tasks]);

  const peopleOptions = useMemo(() => {
    if (!state) return [...ABONOS_PEOPLE];
    return mergeCatalog([...ABONOS_PEOPLE], state.cases.map((row) => row.addedBy));
  }, [state]);

  const filterOptions = useMemo(() => {
    const brands = uniquePresent(computed.map((row) => row.brand));
    const types = uniquePresent(computed.map((row) => row.type));
    const areas = uniquePresent(computed.map((row) => row.area));
    const teams = uniquePresent(computed.map((row) => row.teamMotivo));
    const origins = uniquePresent(computed.map((row) => row.origin));
    const statuses = uniquePresent(computed.map((row) => row.status));
    const authors = uniquePresent(computed.map((row) => row.addedBy));
    const years = uniquePresent(computed.map((row) => (row.dueDate || '').slice(0, 4)));
    return { brands, types, areas, teams, origins, statuses, authors, years };
  }, [computed]);

  if (!state) {
    return (
      <div className="abonos-shell rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-secondary)]">
        Cargando abonos…
      </div>
    );
  }

  const openNew = (preset?: Partial<AbonoCase>) => {
    setEditing(null);
    setForm({ ...emptyForm(), ...preset });
    setPanelOpen(true);
    setTab('seguimiento');
  };

  const closePanel = () => {
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(false);
  };

  const openEdit = (row: AbonoCase) => {
    setEditing(row);
    setForm({ ...row, dueDate: row.dueDate || '', nextReview: row.nextReview || '' });
    setPanelOpen(true);
  };

  const applyWeeklyTasks = async (list: WeeklyTask[], note = claimNote) => {
    const actionable = list.filter((task) => task.kind === 'reclamar' || task.kind === 'seguir');
    if (actionable.length === 0) return;
    const ids = new Set(actionable.map((task) => task.row.id));
    const nextReview = addDaysIso(todayIso(), 7);
    const cases = state.cases.map((row) => (
      ids.has(row.id) ? { ...row, status: 'Reclamado' as const, nextReview } : row
    ));
    const claims = [
      ...state.claims,
      ...actionable.map((task) => makeClaim(task.row.id, task.kind === 'seguir' ? 'seguir' : 'reclamar', note)),
    ];
    await persist({ ...state, cases, claims }, backend);
    setClaimNote('');
    const bulk = actionable.length > 1;
    const follow = actionable.every((task) => task.kind === 'seguir');
    setNote(
      follow
        ? (bulk ? `Marcados ${actionable.length} como en seguimiento. En 7 días vuelven a salir.` : 'Sigue reclamado. Te lo vuelvo a sacar en 7 días.')
        : (bulk ? `Marcados ${actionable.length} como reclamados. En 7 días vuelven a salir.` : 'Marcado como reclamado. Te lo vuelvo a sacar en 7 días.'),
    );
  };

  const applyWeeklyTask = async (task: WeeklyTask) => {
    if (task.kind === 'fecha' || task.kind === 'cobro') {
      openEdit(task.row);
      return;
    }
    await applyWeeklyTasks([task]);
  };

  const saveForm = async () => {
    if (!form.brand || !form.area) {
      setError('Marca y área son obligatorios.');
      return;
    }
    setError(null);
    const row: AbonoCase = {
      id: editing?.id || crypto.randomUUID(),
      registro: editing?.registro || nextRegistro(state.cases),
      createdAt: editing ? (editing.createdAt || '') : new Date().toISOString(),
      addedBy: form.addedBy || '',
      dueDate: form.dueDate || null,
      brand: form.brand,
      type: form.type || '',
      area: form.area,
      teamMotivo: form.teamMotivo || '',
      origin: (form.origin || '') as AbonoOrigin | '',
      tradeTermId: form.origin === 'Trade Term' ? (form.tradeTermId || null) : null,
      informedBy: form.informedBy || '',
      expectedAmount: form.expectedAmount ?? null,
      status: (form.status || '') as AbonoStatus | '',
      nextReview: form.nextReview || null,
      comment: form.comment || '',
    };
    const cases = editing
      ? state.cases.map((item) => item.id === row.id ? row : item)
      : [row, ...state.cases];
    const catalogs = addCatalogValue(
      addCatalogValue(addCatalogValue(addCatalogValue(state.catalogs, 'brand', row.brand), 'type', row.type), 'area', row.area),
      'team',
      row.teamMotivo,
    );
    await persist({ ...state, cases, catalogs }, backend);
    setEditing(row);
    setForm(row);
    setPanelOpen(true);
    setNote('Guardado.');
  };

  const deleteCase = async (id: string) => {
    if (!window.confirm(`¿Eliminar el abono #${state.cases.find((row) => row.id === id)?.registro ?? ''} y sus pagos?`)) return;
    await persist({
      ...state,
      cases: state.cases.filter((row) => row.id !== id),
      receipts: state.receipts.filter((row) => row.caseId !== id),
      claims: state.claims.filter((row) => row.caseId !== id),
    }, backend);
    closePanel();
  };

  const cancelCase = async (id: string) => {
    const cases = state.cases.map((row) => row.id === id ? { ...row, status: 'Cancelado' as const } : row);
    await persist({ ...state, cases }, backend);
    if (editing?.id === id) setForm((current) => ({ ...current, status: 'Cancelado' }));
  };

  const addReceipt = async () => {
    if (!editing) return;
    const amount = parseMoney(receiptDraft.amount);
    if (!amount || amount === 0) {
      setError('El importe de la recepción es obligatorio.');
      return;
    }
    const receipt: AbonoReceipt = {
      id: crypto.randomUUID(),
      caseId: editing.id,
      receivedAt: receiptDraft.receivedAt || todayIso(),
      amount,
      reference: receiptDraft.reference.trim(),
      comment: receiptDraft.comment.trim(),
    };
    const receipts = [...state.receipts, receipt];
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus } : row);
    await persist({ ...state, receipts, cases }, backend);
    setEditing({ ...editing, status: nextStatus });
    setForm((current) => ({ ...current, status: nextStatus }));
    setReceiptDraft({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
    setNote('Recepción añadida.');
  };

  const addClaimFromModal = async () => {
    if (!editing) return;
    const nextReview = addDaysIso(todayIso(), 7);
    const kind = editing.status === 'Reclamado' ? 'seguir' as const : 'reclamar' as const;
    const cases = state.cases.map((row) => (
      row.id === editing.id ? { ...row, status: 'Reclamado' as const, nextReview } : row
    ));
    const claims = [...state.claims, makeClaim(editing.id, kind, claimDraft.note, claimDraft.claimedAt || todayIso())];
    await persist({ ...state, cases, claims }, backend);
    setEditing({ ...editing, status: 'Reclamado', nextReview });
    setForm((current) => ({ ...current, status: 'Reclamado', nextReview }));
    setClaimDraft({ claimedAt: todayIso(), note: '' });
    setNote(kind === 'seguir' ? 'Añadido al historial. Te lo vuelvo a sacar en 7 días.' : 'Reclamado y anotado. Te lo vuelvo a sacar en 7 días.');
  };

  const deleteReceipt = async (id: string) => {
    if (!editing) return;
    const receipts = state.receipts.filter((row) => row.id !== id);
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus } : row);
    await persist({ ...state, receipts, cases }, backend);
  };

  const saveTerm = async () => {
    if (!termForm.brand || !termForm.name) {
      setError('Marca y nombre del trade term son obligatorios.');
      return;
    }
    const term: TradeTerm = {
      id: crypto.randomUUID(),
      brand: termForm.brand,
      name: termForm.name,
      compensation: termForm.compensation || '',
      triggerText: termForm.triggerText || '',
      period: termForm.period || '',
      active: termForm.active !== false,
      comment: termForm.comment || '',
    };
    await persist({
      ...state,
      tradeTerms: [term, ...state.tradeTerms],
      catalogs: addCatalogValue(state.catalogs, 'brand', term.brand),
    }, backend);
    setTermForm({ brand: term.brand, name: '', compensation: '', triggerText: '', period: '', active: true, comment: '' });
  };

  const toggleTerm = async (id: string) => {
    await persist({
      ...state,
      tradeTerms: state.tradeTerms.map((term) => term.id === id ? { ...term, active: !term.active } : term),
    }, backend);
  };

  const deleteTerm = async (id: string) => {
    if (!window.confirm('¿Eliminar este trade term?')) return;
    await persist({
      ...state,
      tradeTerms: state.tradeTerms.filter((term) => term.id !== id),
      cases: state.cases.map((row) => row.tradeTermId === id ? { ...row, tradeTermId: null } : row),
    }, backend);
  };

  const handleImportFile = (rows: unknown[][]) => {
    const index = detectAbonosHeaderRow(rows);
    const header = rows[index] || [];
    const map = guessColumnMap(header);
    setHeaderIndex(index);
    setImportHeaders(header);
    setImportRows(rows);
    setImportMap(map);
    setPreview(buildImportPreview(rows, map, index));
    setTab('importar');
  };

  const applyImport = async () => {
    const { cases, receipts } = previewToRecords(preview);
    const used = new Set(state.cases.map((row) => row.registro));
    let nextReg = nextRegistro(state.cases);
    const imported = cases.map((row) => {
      if (!used.has(row.registro)) {
        used.add(row.registro);
        return row;
      }
      const next = { ...row, registro: nextReg };
      used.add(nextReg);
      nextReg += 1;
      return next;
    });
    await persist({
      ...state,
      cases: [...imported, ...state.cases],
      receipts: [...receipts, ...state.receipts],
    }, backend);
    setNote(`Importados ${imported.length} abonos.`);
    setPreview([]);
    setTab('seguimiento');
  };

  const clearAllAbonos = async () => {
    const count = state.cases.length;
    if (count === 0) {
      setNote('No hay abonos que borrar.');
      return;
    }
    if (!window.confirm(`Vas a borrar ${count} abonos y sus recepciones. Los trade terms se quedan. ¿Seguir?`)) return;
    if (!window.confirm('Última confirmación: se vacía la lista para que puedas volver a importar.')) return;
    await persist({ ...state, cases: [], receipts: [], claims: [] }, backend);
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(false);
    setPreview([]);
    setNote(`Borrados ${count} abonos.`);
  };

  const exportWorkbook = async (rows: AbonoComputed[]) => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(abonosExportRows(rows)), 'Abonos');
    const caseIds = new Set(rows.map((row) => row.id));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(receiptsExportRows(rows, state.receipts.filter((item) => caseIds.has(item.caseId)))),
      'Recepciones',
    );
    XLSX.writeFile(workbook, 'Abonos.xlsx');
  };

  const currentComputed = editing ? computed.find((row) => row.id === editing.id) : null;
  const caseReceipts = editing ? receiptsForCase(state.receipts, editing.id) : [];
  const caseClaims = editing ? claimsForCase(state.claims, editing.id) : [];
  const brandTerms = state.tradeTerms.filter((term) => term.brand === form.brand && term.active !== false);
  const tableWidth = columnOrder.reduce((sum, key) => sum + columnWidths[key], 0);

  const toggleSort = (key: SortKey) => {
    setSort((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const moveColumn = (from: SortKey, to: SortKey) => {
    if (from === to) return;
    setColumnOrder((order) => {
      const next = [...order];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return order;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  };

  return (
    <div className="abonos-shell space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">05 Abonos</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Abonos</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Entre semana: altas y cambios de estado. Un día a la semana: las tareas de abajo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Nuevo abono
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}
      {note && (
        <p className="text-xs font-medium text-[var(--success)]">{note}</p>
      )}

      {tab === 'dashboard' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Tareas esta semana" value={String(kpis.taskCount)} />
            <Kpi label="A reclamar" value={String(kpis.claimCount)} tone={kpis.claimCount ? 'warning' : undefined} />
            <Kpi label="Importe a reclamar" value={formatMoney(kpis.claimPending)} />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Tareas de la revisión</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Pincha un tipo y salen todas. Lo de Pablo no sale aquí.
            </p>
            {tasks.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Esta semana no tienes tareas.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {taskGroups.map((group) => {
                  const open = openTaskKind === group.kind;
                  return (
                    <button
                      key={group.kind}
                      type="button"
                      onClick={() => setOpenTaskKind(open ? null : group.kind)}
                      className={`rounded-md border px-3 py-3 text-left transition ${open ? 'border-[var(--text-primary)] bg-white' : 'border-[var(--border)] bg-white hover:border-[var(--border-strong)]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{group.title}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{group.tasks.length} · {formatMoney(group.pending)}</p>
                        </div>
                        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] transition ${open ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {openTaskGroup && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{openTaskGroup.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{openTaskGroup.hint}</p>
                  </div>
                  {openTaskGroup.bulkLabel && (
                    <div className="flex min-w-[240px] flex-1 flex-col gap-2 sm:max-w-sm sm:flex-row">
                      <input
                        value={claimNote}
                        onChange={(event) => setClaimNote(event.target.value)}
                        placeholder="Nota (opcional)"
                        className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => applyWeeklyTasks(openTaskGroup.tasks)}
                        className="h-9 shrink-0 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white hover:bg-black"
                      >
                        {openTaskGroup.bulkLabel}
                      </button>
                    </div>
                  )}
                </div>
                {openTaskGroup.tasks.map((task) => (
                  <div key={task.id} className="space-y-3 rounded-md border border-[var(--border)] bg-white px-3 py-3">
                    <button type="button" onClick={() => openEdit(task.row)} className="block w-full min-w-0 text-left hover:text-[var(--text-primary)]">
                      <p className="text-sm font-medium">#{task.row.registro} · {displayDash(task.row.brand)} · {displayDash(task.row.area)} · {displayDash(task.row.teamMotivo)}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{task.reason} · {formatMoney(task.row.pending)}</p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {(task.kind === 'reclamar' || task.kind === 'seguir') && (
                        <button
                          type="button"
                          onClick={() => applyWeeklyTask(task)}
                          className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white hover:bg-black"
                        >
                          {task.actionLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(task.row)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--bg-soft)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCase(task.row.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--danger-soft)] px-3 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Cobros próximas 4 semanas</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Por fecha prevista. Solo lo que todavía está pendiente.</p>
              </div>
              <p className="text-sm font-semibold">{cash.count} · {formatMoney(cash.pending)}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {cash.weeks.map((week) => (
                <div key={week.id} className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{week.label}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatIsoDate(week.start)} – {formatIsoDate(week.end)}</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{formatMoney(week.pending)}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{week.rows.length} abonos</p>
                </div>
              ))}
            </div>
            {cash.brands.length > 0 && (
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead className="text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Empresa</th>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Abonos</th>
                      <th className="border-b border-[var(--border)] px-2 py-2 text-right font-medium">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cash.brands.map((brand) => (
                      <tr key={brand.brand}>
                        <td className="border-b border-[var(--border)] px-2 py-2 font-medium">{brand.brand}</td>
                        <td className="border-b border-[var(--border)] px-2 py-2 text-[var(--text-secondary)]">{brand.count}</td>
                        <td className="border-b border-[var(--border)] px-2 py-2 text-right font-mono">{formatMoney(brand.pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cash.count === 0 && (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">En las próximas 4 semanas no hay fechas previstas con pendiente.</p>
            )}
            {cash.weeks.some((week) => week.rows.length > 0) && (
              <div className="mt-4 space-y-3">
                {cash.weeks.filter((week) => week.rows.length > 0).map((week) => (
                  <div key={`${week.id}-rows`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{week.label}</p>
                    <div className="mt-2 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-white">
                      {week.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => openEdit(row)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-soft)]"
                        >
                          <span className="min-w-0">
                            <span className="text-sm font-medium">#{row.registro} · {displayDash(row.brand)} · {displayDash(row.teamMotivo)}</span>
                            <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{formatIsoDate(row.dueDate)}</span>
                          </span>
                          <span className="shrink-0 font-mono text-sm">{formatMoney(row.pending)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'seguimiento' && (
        <section className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar" className="h-10 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm" />
            </label>
            <FilterSelect value={filters.brand} options={filterOptions.brands.options} includeBlank={filterOptions.brands.hasBlank} placeholder="Marca" onChange={(brand) => setFilters({ ...filters, brand })} />
            <FilterSelect value={filters.type} options={filterOptions.types.options} includeBlank={filterOptions.types.hasBlank} placeholder="Tipo" onChange={(type) => setFilters({ ...filters, type })} />
            <FilterSelect value={filters.area} options={filterOptions.areas.options} includeBlank={filterOptions.areas.hasBlank} placeholder="Área" onChange={(area) => setFilters({ ...filters, area })} />
            <FilterSelect value={filters.teamMotivo} options={filterOptions.teams.options} includeBlank={filterOptions.teams.hasBlank} placeholder="Equipo / Motivo" onChange={(teamMotivo) => setFilters({ ...filters, teamMotivo })} />
            <FilterSelect value={filters.origin} options={filterOptions.origins.options} includeBlank={filterOptions.origins.hasBlank} placeholder="Origen" onChange={(origin) => setFilters({ ...filters, origin })} />
            <FilterSelect value={filters.status} options={filterOptions.statuses.options} includeBlank={filterOptions.statuses.hasBlank} placeholder="Estado" onChange={(status) => setFilters({ ...filters, status })} />
            <FilterSelect value={filters.year} options={filterOptions.years.options} includeBlank={filterOptions.years.hasBlank} placeholder="Año" onChange={(year) => setFilters({ ...filters, year })} />
            <FilterSelect value={filters.addedBy} options={filterOptions.authors.options} includeBlank={filterOptions.authors.hasBlank} placeholder="Añadido por" onChange={(addedBy) => setFilters({ ...filters, addedBy })} />
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={filters.overdue} onChange={(event) => setFilters({ ...filters, overdue: event.target.checked })} />
              Vencidos
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={filters.review} onChange={(event) => setFilters({ ...filters, review: event.target.checked })} />
              Pendientes de revisión
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Abonos</p>
              <p className="mt-0.5 text-sm font-semibold">{sorted.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Previsto</p>
              <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(listTotals.expected)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Recibido</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--success)]">{formatMoney(listTotals.received)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Pendiente</p>
              <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(listTotals.pending)}</p>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="abonos-table border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
              <colgroup>
                {columnOrder.map((key) => (
                  <col key={key} style={{ width: columnWidths[key] }} />
                ))}
              </colgroup>
              <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                <tr>
                  {columnOrder.map((key) => {
                    const col = COLUMN_BY_KEY[key];
                    return (
                      <th
                        key={key}
                        className="abonos-th border-b border-[var(--border)] px-1.5 py-1.5"
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const from = dragCol.current;
                          dragCol.current = null;
                          if (from) moveColumn(from, key);
                        }}
                      >
                        <div className="flex min-w-0 items-start justify-center gap-0.5 pr-1.5">
                          <span
                            draggable
                            onDragStart={(event) => {
                              dragCol.current = key;
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', key);
                            }}
                            onDragEnd={() => {
                              dragCol.current = null;
                            }}
                            className="mt-0.5 inline-flex shrink-0 cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
                            aria-label={`Mover columna ${col.label}`}
                          >
                            <GripVertical className="h-3 w-3" />
                          </span>
                          <button type="button" onClick={() => toggleSort(key)} className="abonos-th-label hover:text-[var(--text-primary)]">
                            {col.label}
                          </button>
                        </div>
                        <span
                          className="abonos-col-resizer"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            resizeRef.current = { key, startX: event.clientX, startW: columnWidths[key] };
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} className="cursor-pointer hover:bg-white">
                    {columnOrder.map((key) => (
                      <td
                        key={key}
                        className={`border-b border-[var(--border)] px-1.5 py-1.5 ${key === 'registro' ? 'font-medium' : ''} ${MONEY_COLS.has(key) ? 'font-mono tabular-nums' : ''}`}
                      >
                        <div className="abonos-cell" title={key === 'comment' ? row.comment || undefined : undefined}>{renderAbonoCell(row, key)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No hay abonos con estos filtros.</p>}
          </div>
        </section>
      )}

      {tab === 'terms' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Nuevo trade term</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CatalogField label="Marca" value={termForm.brand || ''} options={state.catalogs.brands} required onChange={(brand) => setTermForm({ ...termForm, brand })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)} />
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Nombre / Condición</span>
                <input value={termForm.name || ''} onChange={(event) => setTermForm({ ...termForm, name: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Compensación</span>
                <input value={termForm.compensation || ''} onChange={(event) => setTermForm({ ...termForm, compensation: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Trigger / Condición</span>
                <input value={termForm.triggerText || ''} onChange={(event) => setTermForm({ ...termForm, triggerText: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha / Periodicidad</span>
                <input value={termForm.period || ''} onChange={(event) => setTermForm({ ...termForm, period: event.target.value })} placeholder="JUL, DIC, Anual…" className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                <input value={termForm.comment || ''} onChange={(event) => setTermForm({ ...termForm, comment: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
              </label>
            </div>
            <button type="button" onClick={saveTerm} className="mt-3 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar trade term</button>
          </div>
          <div className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Compensación</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.tradeTerms.map((term) => (
                  <tr key={term.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{term.brand}</td>
                    <td className="px-3 py-2 font-medium">{term.name}</td>
                    <td className="px-3 py-2">{term.compensation}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{term.triggerText || '—'}</td>
                    <td className="px-3 py-2">{term.period || '—'}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => toggleTerm(term.id)} className="text-xs font-semibold">{term.active ? 'Sí' : 'No'}</button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => openNew({ brand: term.brand, origin: 'Trade Term', tradeTermId: term.id, type: 'Credit Notes' })} className="mr-3 text-xs font-semibold text-[var(--accent)]">Crear seguimiento</button>
                      <button type="button" onClick={() => deleteTerm(term.id)} className="text-xs text-[var(--danger)]">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'importar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <FileUpload
              inputId="abonos-import"
              label="Importar Excel de abonos"
              hint="Una sola carga. Área: B2B, Grassroots, Pro Clubs o Teamsports. Los huecos (tipo, fecha, estado) entran igual."
              onFileLoaded={handleImportFile}
              keepDropzone
            />
            <button
              type="button"
              onClick={clearAllAbonos}
              disabled={state.cases.length === 0}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--danger)] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Borrar todos los abonos ({state.cases.length})
            </button>
          </div>
          {importMap && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-sm font-semibold">Relacionar columnas</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {Object.entries(importMap).map(([key, value]) => (
                  <label key={key} className="space-y-1 text-xs">
                    <span className="text-[var(--text-secondary)]">{key}</span>
                    <select
                      value={value ?? ''}
                      onChange={(event) => {
                        const next = { ...importMap, [key]: event.target.value === '' ? null : Number(event.target.value) };
                        setImportMap(next);
                        setPreview(buildImportPreview(importRows, next, headerIndex));
                      }}
                      className="h-9 w-full rounded-md border border-[var(--border)] px-2"
                    >
                      <option value="">No usar</option>
                      {importHeaders.map((header, index) => (
                        <option key={`${String(header)}-${index}`} value={index}>{String(header || `Columna ${index + 1}`)}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          {preview.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <p className="text-sm font-semibold">{preview.length} filas · Área y Añadido por salen del Excel. Completa las vacías si falta alguna.</p>
                <select value={bulkArea} onChange={(event) => setBulkArea(event.target.value)} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm">
                  {state.catalogs.areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setPreview(preview.map((row) => row.area ? row : { ...row, area: bulkArea }))}
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-xs font-medium"
                >
                  Rellenar vacías
                </button>
                <button type="button" onClick={applyImport} className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white">Confirmar importación</button>
                <datalist id="abonos-import-people">
                  {peopleOptions.map((person) => <option key={person} value={person} />)}
                </datalist>
              </div>
              <div className="max-h-[480px] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-[var(--bg-soft)] text-left text-xs">
                    <tr>
                      <th className="px-2 py-2">Reg.</th>
                      <th className="px-2 py-2">Empresa</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Equipo/Motivo</th>
                      <th className="px-2 py-2">Área</th>
                      <th className="px-2 py-2">Añadido por</th>
                      <th className="px-2 py-2">Previsto</th>
                      <th className="px-2 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={row.key} className="border-t border-[var(--border)]">
                        <td className="px-2 py-1">{row.registro ?? '—'}</td>
                        <td className="px-2 py-1">{row.brand}</td>
                        <td className="px-2 py-1">{row.type}</td>
                        <td className="px-2 py-1">{row.teamMotivo}</td>
                        <td className="px-2 py-1">
                          <select
                            value={row.area}
                            onChange={(event) => {
                              const next = [...preview];
                              next[index] = { ...row, area: event.target.value };
                              setPreview(next);
                            }}
                            className="h-8 rounded border border-[var(--border)] px-1 text-xs"
                          >
                            <option value="">Sin área</option>
                            {mergeCatalog(state.catalogs.areas, [row.area]).map((area) => <option key={area} value={area}>{area}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={row.addedBy}
                            onChange={(event) => {
                              const next = [...preview];
                              next[index] = { ...row, addedBy: event.target.value };
                              setPreview(next);
                            }}
                            list="abonos-import-people"
                            className="h-8 w-full min-w-[140px] rounded border border-[var(--border)] px-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{formatMoney(row.expectedAmount)}</td>
                        <td className="px-2 py-1 text-[var(--danger)]">{row.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'exportar' && (
        <section className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => exportWorkbook(computed)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold">Exportar todo</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Todos los abonos y una segunda hoja de recepciones.</p>
          </button>
          <button type="button" onClick={() => exportWorkbook(sorted)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold">Exportar vista actual</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Respeta los filtros de Abonos.</p>
          </button>
          <button
            type="button"
            onClick={clearAllAbonos}
            disabled={state.cases.length === 0}
            className="rounded-lg border border-red-200 bg-[var(--danger-soft)] p-5 text-left hover:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
          >
            <p className="text-sm font-semibold text-[var(--danger)]">Borrar todos los abonos</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Vacía la lista y las recepciones para volver a importar. Los trade terms se quedan.</p>
          </button>
        </section>
      )}

      {panelOpen && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div
            className="abonos-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abonos-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p id="abonos-modal-title" className="font-display text-lg font-semibold tracking-tight">
                  {editing ? `Registro #${editing.registro}` : 'Nuevo abono'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {displayDash(form.brand)} · {displayDash(form.area)} · {displayDash(form.teamMotivo)}
                </p>
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Editar</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <CatalogField label="Marca" value={form.brand || ''} options={state.catalogs.brands} required onChange={(brand) => setForm({ ...form, brand, tradeTermId: null })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)} />
                  <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                  <CatalogField label="Equipo / Motivo" value={form.teamMotivo || ''} options={state.catalogs.teams} allowFree onChange={(teamMotivo) => setForm({ ...form, teamMotivo })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'team', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Origen</span>
                    <select value={form.origin || ''} onChange={(event) => setForm({ ...form, origin: event.target.value as AbonoOrigin | '', tradeTermId: event.target.value === 'Trade Term' ? form.tradeTermId : null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                    </select>
                  </label>
                  <CatalogField label="Tipo" value={form.type || ''} options={state.catalogs.types} required onChange={(type) => setForm({ ...form, type })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'type', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Importe previsto</span>
                    <input value={form.expectedAmount ?? ''} onChange={(event) => setForm({ ...form, expectedAmount: parseMoney(event.target.value) })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha prevista</span>
                    <input type="date" value={form.dueDate || ''} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  {form.origin === 'Trade Term' && (
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Trade Term</span>
                      <select value={form.tradeTermId || ''} onChange={(event) => setForm({ ...form, tradeTermId: event.target.value || null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                        <option value="">Selecciona</option>
                        {brandTerms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.compensation}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Añadido por</span>
                    <select value={form.addedBy || ''} onChange={(event) => setForm({ ...form, addedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Informado por</span>
                    <input value={form.informedBy || ''} onChange={(event) => setForm({ ...form, informedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado</span>
                    <select value={form.status || ''} onChange={(event) => setForm({ ...form, status: event.target.value as AbonoStatus | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Próxima revisión</span>
                    <input type="date" value={form.nextReview || ''} onChange={(event) => setForm({ ...form, nextReview: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                    <textarea value={form.comment || ''} onChange={(event) => setForm({ ...form, comment: event.target.value })} rows={3} className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={saveForm} className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar</button>
                  {editing && (
                    <>
                      <button type="button" onClick={() => cancelCase(editing.id)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar caso</button>
                      <button type="button" onClick={() => deleteCase(editing.id)} className="rounded-md px-4 py-2 text-sm text-[var(--danger)]">Eliminar</button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Resumen</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Previsto</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(currentComputed?.expectedAmount ?? form.expectedAmount ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Recibido</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--success)]">{formatMoney(currentComputed?.receivedTotal ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Pendiente</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(currentComputed?.pending ?? Math.max(0, (form.expectedAmount ?? 0)))}</p>
                    </div>
                  </div>
                  {currentComputed && (
                    <div className="mt-3">
                      <StatusPill row={currentComputed} />
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {caseReceipts.length === 0
                      ? 'Sin pagos registrados.'
                      : `${caseReceipts.length} pago${caseReceipts.length === 1 ? '' : 's'} · último ${formatIsoDate(caseReceipts[caseReceipts.length - 1]?.receivedAt || null)}`}
                  </p>
                  {currentComputed?.overdueDays !== null && currentComputed?.overdueDays !== undefined && (
                    <p className="mt-2 text-sm font-medium text-[var(--danger)]">Vencido hace {currentComputed.overdueDays} días</p>
                  )}
                  {currentComputed?.reviewOverdue && (
                    <p className="mt-1 text-sm font-medium text-[var(--warning)]">Revisar hoy</p>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Información adicional</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Fecha de alta</dt>
                      <dd>{formatIsoDate(editing?.createdAt ? editing.createdAt.slice(0, 10) : null)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Añadido por</dt>
                      <dd>{displayDash(form.addedBy)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Fecha prevista</dt>
                      <dd>{formatIsoDate(form.dueDate || null)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Próx. revisión</dt>
                      <dd>{formatIsoDate(form.nextReview || null)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Origen</dt>
                      <dd>{displayDash(form.origin)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Trade Term</dt>
                      <dd>{displayDash(currentComputed?.tradeTermName)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[11px] text-[var(--text-secondary)]">Informado por</dt>
                      <dd>{displayDash(form.informedBy)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Reclamaciones</p>
                  <div className="mt-3 space-y-2">
                    {caseClaims.map((claim) => (
                      <div key={claim.id} className="rounded-md bg-[var(--bg-soft)] px-3 py-2 text-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{claimKindLabel(claim.kind)} · {formatIsoDate(claim.claimedAt)}</p>
                        <p className="mt-0.5 text-[var(--text-secondary)]">{claim.note || 'Sin nota'}</p>
                      </div>
                    ))}
                    {caseClaims.length === 0 && (
                      <p className="text-xs text-[var(--text-secondary)]">{editing ? 'Aún no hay reclamaciones anotadas.' : 'Guarda el abono para anotar reclamaciones.'}</p>
                    )}
                  </div>
                  {editing && (
                    <div className="mt-3 grid gap-2">
                      <input type="date" value={claimDraft.claimedAt} onChange={(event) => setClaimDraft({ ...claimDraft, claimedAt: event.target.value })} className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={claimDraft.note} onChange={(event) => setClaimDraft({ ...claimDraft, note: event.target.value })} placeholder="Nota corta" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <button type="button" onClick={addClaimFromModal} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-soft)]">Añadir reclamación</button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Pagos</p>
                  <div className="mt-3 space-y-2">
                    {caseReceipts.map((receipt, index) => (
                      <div key={receipt.id} className="flex items-start justify-between gap-2 rounded-md bg-[var(--bg-soft)] px-3 py-2 text-sm">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{paymentLabel(index)}</p>
                          <p className="font-medium">{formatIsoDate(receipt.receivedAt)} · {formatMoney(receipt.amount)}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{receipt.reference || receipt.comment || '—'}</p>
                        </div>
                        <button type="button" onClick={() => deleteReceipt(receipt.id)} className="text-[var(--danger)]" aria-label="Eliminar pago">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {caseReceipts.length === 0 && (
                      <p className="text-xs text-[var(--text-secondary)]">{editing ? 'Aún no hay pagos registrados.' : 'Guarda el abono para poder anotar pagos.'}</p>
                    )}
                  </div>
                  {editing && (
                    <div className="mt-3 grid gap-2">
                      <input type="date" value={receiptDraft.receivedAt} onChange={(event) => setReceiptDraft({ ...receiptDraft, receivedAt: event.target.value })} className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={receiptDraft.amount} onChange={(event) => setReceiptDraft({ ...receiptDraft, amount: event.target.value })} placeholder="Importe" className="h-9 rounded-md border border-[var(--border)] px-3 text-right font-mono text-sm" />
                      <input value={receiptDraft.reference} onChange={(event) => setReceiptDraft({ ...receiptDraft, reference: event.target.value })} placeholder="Referencia" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={receiptDraft.comment} onChange={(event) => setReceiptDraft({ ...receiptDraft, comment: event.target.value })} placeholder="Comentario" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <button type="button" onClick={addReceipt} className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Añadir pago</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-[var(--warning)]' : ''}`}>{value}</p>
    </div>
  );
}

function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
  includeBlank,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  includeBlank?: boolean;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
      <option value="">{placeholder}</option>
      {includeBlank && <option value={BLANK}>—</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function StatusPill({ row }: { row: AbonoComputed }) {
  const pill = 'inline-block max-w-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight';
  if (!row.status) {
    return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-muted)]`}>—</span>;
  }
  if (row.overdueDays !== null) {
    return <span className={`${pill} bg-[var(--danger-soft)] text-[var(--danger)]`}><AlertTriangle className="mr-0.5 inline h-3 w-3 align-text-bottom" /> Vencido · {row.status}</span>;
  }
  if (row.reviewOverdue) {
    return <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>Revisar · {row.status}</span>;
  }
  if (row.status === 'Recibido') {
    return <span className={`${pill} bg-[var(--success-soft)] text-[var(--success)]`}>{row.status}</span>;
  }
  return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-secondary)]`}>{row.status}</span>;
}
