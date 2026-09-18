'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  ABONO_ORIGINS,
  ABONO_SOURCES,
  ABONO_STATUSES,
  ABONO_AMOUNT_KINDS,
  ABONOS_PEOPLE,
  addDaysIso,
  abonoRequiredGaps,
  amountKindLabel,
  caseLabel,
  claimKindLabel,
  claimsForCase,
  computeAll,
  DEFAULT_NEW_AUTHOR,
  displayDash,
  formatIsoDate,
  formatMoney,
  formatMoneyInput,
  formatRequiredGaps,
  groupWeeklyTasks,
  linkedCases,
  makeClaim,
  mergeCatalog,
  nextRegistro,
  parseMoney,
  receiptsForCase,
  shortPersonName,
  statusAfterReceipts,
  taskName,
  termRollup,
  todayIso,
  upcomingCash,
  weeklyTasks,
  type AbonoAttachment,
  type AbonoCase,
  type AbonoComputed,
  type AbonoOrigin,
  type AbonoReceipt,
  type AbonoSource,
  type AbonoStatus,
  type AbonosState,
  type TradeTerm,
  type WeeklyTask,
  type WeeklyTaskKind,
} from '@/lib/abonos-model';
import {
  abonosExportRows,
  abonosTemplateRows,
  ABONOS_TEMPLATE_INSTRUCTIONS,
  buildImportPreview,
  detectAbonosHeaderRow,
  guessColumnMap,
  importPreviewError,
  previewToRecords,
  receiptsExportRows,
  type ImportColumnMap,
  type ImportPreviewRow,
} from '@/lib/abonos-excel';
import { addCatalogValue, loadAbonosState, saveAbonosState, type AbonosBackend } from '@/lib/abonos-store';
import { AlertTriangle, Check, ChevronRight, Download, FileText, GripVertical, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Revisión' },
  { id: 'seguimiento', label: 'Abonos' },
  { id: 'terms', label: 'Trade Terms' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SortKey =
  | 'responsible'
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
  { key: 'dueDate', label: 'Cuándo', width: 120 },
  { key: 'brand', label: 'Empresa', width: 108 },
  { key: 'type', label: 'Tipo', width: 120 },
  { key: 'area', label: 'Área', width: 108 },
  { key: 'teamMotivo', label: 'Equipo', width: 150 },
  { key: 'expectedAmount', label: 'Importe previsto', width: 118 },
  { key: 'receivedTotal', label: 'Importe liquidado', width: 118 },
  { key: 'pending', label: 'Importe pendiente', width: 118 },
  { key: 'status', label: 'Estado', width: 140 },
  { key: 'comment', label: 'Comentario', width: 180 },
  { key: 'responsible', label: 'Responsable', width: 108 },
];

const COL_STORAGE = 'ts-abonos-cols-v7';
const BLANK = '__blank__';
const MAX_EVIDENCE = 10;
const MAX_DOC_BYTES = 1_200_000;
const DEFAULT_ORDER = COLUMN_DEFS.map((col) => col.key);
const DEFAULT_WIDTHS = Object.fromEntries(COLUMN_DEFS.map((col) => [col.key, col.width])) as Record<SortKey, number>;
const COLUMN_BY_KEY = Object.fromEntries(COLUMN_DEFS.map((col) => [col.key, col])) as Record<SortKey, (typeof COLUMN_DEFS)[number]>;

function loadColLayout(): { order: SortKey[]; widths: Record<SortKey, number> } {
  if (typeof window === 'undefined') return { order: DEFAULT_ORDER, widths: DEFAULT_WIDTHS };
  try {
    const raw = window.localStorage.getItem(COL_STORAGE);
    if (!raw) return { order: DEFAULT_ORDER, widths: { ...DEFAULT_WIDTHS } };
    const parsed = JSON.parse(raw) as { order?: SortKey[]; widths?: Partial<Record<SortKey, number>> };
    const saved = (parsed.order || []).filter((key): key is SortKey => DEFAULT_ORDER.includes(key as SortKey));
    const missing = DEFAULT_ORDER.filter((key) => !saved.includes(key));
    const order = saved.length > 0 ? [...saved, ...missing] : [...DEFAULT_ORDER];
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

function matchesPersonFilter(selected: string, actual: string): boolean {
  if (!selected) return true;
  if (selected === BLANK) return !actual.trim();
  const a = actual.trim().toLocaleLowerCase('es');
  const s = selected.trim().toLocaleLowerCase('es');
  if (!a) return false;
  return a === s || a.startsWith(`${s} `) || s.startsWith(`${a} `) || a.startsWith(s) || s.startsWith(a);
}

function renderAbonoCell(row: AbonoComputed, key: SortKey) {
  switch (key) {
    case 'responsible':
      return displayDash(row.responsible);
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
  responsible: '',
  source: '',
  search: '',
};

const emptyForm = (): Partial<AbonoCase> => ({
  addedBy: DEFAULT_NEW_AUTHOR,
  responsible: DEFAULT_NEW_AUTHOR,
  dueDate: '',
  brand: '',
  type: 'Credit Notes',
  area: '',
  teamMotivo: '',
  origin: 'Puntual',
  source: '',
  tradeTermId: null,
  informedBy: '',
  expectedAmount: null,
  communicatedAmount: null,
  status: 'Pendiente',
  nextReview: '',
  comment: '',
  estimated: null,
  attachments: [],
});

async function compressEvidenceImage(file: Blob, name: string): Promise<AbonoAttachment> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('No he podido leer la imagen.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  if (dataUrl.length > 900_000) {
    throw new Error('La captura pesa demasiado. Recórtala o baja un poco la resolución.');
  }
  return {
    id: crypto.randomUUID(),
    name: name.replace(/\.[^.]+$/, '') || 'captura',
    mime: 'image/jpeg',
    dataUrl,
    addedAt: new Date().toISOString(),
  };
}

function isImageFile(blob: Blob, name: string): boolean {
  return blob.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function isAllowedEvidence(blob: Blob, name: string): boolean {
  if (isImageFile(blob, name)) return true;
  if (blob.type === 'application/pdf' || blob.type === 'text/csv') return true;
  if (blob.type.includes('spreadsheet') || blob.type.includes('excel') || blob.type.includes('word') || blob.type === 'application/msword') return true;
  return /\.(pdf|xlsx?|csv|docx?)$/i.test(name);
}

function isImageAttachment(item: { mime?: string; dataUrl?: string }): boolean {
  return String(item.mime || '').startsWith('image/') || String(item.dataUrl || '').startsWith('data:image/');
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No he podido leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}

async function fileToAttachment(file: Blob, name: string): Promise<AbonoAttachment> {
  const fileName = name.trim() || 'documento';
  if (isImageFile(file, fileName)) return compressEvidenceImage(file, fileName);
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`"${fileName}" pesa más de 1,2 MB. Súbelo más ligero.`);
  }
  const dataUrl = await readAsDataUrl(file);
  return {
    id: crypto.randomUUID(),
    name: fileName,
    mime: file.type || 'application/octet-stream',
    dataUrl,
    addedAt: new Date().toISOString(),
  };
}

function AckDialog({
  title,
  message,
  onAccept,
}: {
  title: string;
  message: string;
  onAccept: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') onAccept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAccept]);

  return (
    <div
      className="abonos-modal-backdrop"
      style={{ zIndex: 70, alignItems: 'center' }}
      onClick={onAccept}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="abonos-ack-title"
        aria-describedby="abonos-ack-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p id="abonos-ack-title" className="font-display text-lg font-semibold tracking-tight">{title}</p>
            <p id="abonos-ack-message" className="mt-1 text-sm text-[var(--text-secondary)]">{message}</p>
          </div>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onAccept}
          className="mt-5 h-10 w-full rounded-md bg-[var(--text-primary)] text-sm font-semibold text-white hover:bg-black"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}

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
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const viewerRef = useRef<string | null>(null);
  const addEvidenceRef = useRef<(files: Array<{ blob: Blob; name: string }>) => Promise<void>>(async () => {});
  const [editing, setEditing] = useState<AbonoCase | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelNote, setPanelNote] = useState<string | null>(null);
  const [ack, setAck] = useState<{ title: string; message: string } | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AbonoCase>>(emptyForm());
  const [expectedAmountText, setExpectedAmountText] = useState('');
  const [communicatedAmountText, setCommunicatedAmountText] = useState('');
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
  const [claimDraft, setClaimDraft] = useState({ claimedAt: todayIso(), nextReview: addDaysIso(todayIso(), 7), note: '' });
  const [reviewResponsible, setReviewResponsible] = useState(DEFAULT_NEW_AUTHOR);

  const persist = useCallback(async (next: AbonosState, currentBackend: AbonosBackend) => {
    setState(next);
    try {
      await saveAbonosState(next, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar en el servidor. Queda en este navegador.');
    }
  }, []);

  viewerRef.current = viewerImage;

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
      if (viewerRef.current) {
        setViewerImage(null);
        return;
      }
      setEditing(null);
      setForm(emptyForm());
      setExpectedAmountText('');
      setCommunicatedAmountText('');
      setPanelNote(null);
      setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const items = Array.from(event.clipboardData?.items || []);
      const images = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (images.length === 0) return;
      event.preventDefault();
      void addEvidenceRef.current(images.map((file) => ({ blob: file, name: file.name || 'captura.png' })));
    };
    window.addEventListener('paste', onPaste);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      document.body.style.overflow = previous;
    };
  }, [panelOpen]);

  useEffect(() => {
    if (!panelNote) return;
    const timer = window.setTimeout(() => setPanelNote(null), 4000);
    return () => window.clearTimeout(timer);
  }, [panelNote]);

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
      if (filters.addedBy && !matchesPersonFilter(filters.addedBy, row.addedBy)) return false;
      if (filters.responsible && !matchesPersonFilter(filters.responsible, row.responsible)) return false;
      if (filters.source && !matchesFilter(filters.source, row.source)) return false;
      if (filters.year && !matchesFilter(filters.year, (row.dueDate || '').slice(0, 4))) return false;
      if (search) {
        const blob = [row.registro, row.brand, row.type, row.area, row.teamMotivo, row.comment, row.informedBy, row.source, row.tradeTermName, row.addedBy, row.responsible].join(' ').toLocaleLowerCase('es');
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }, [computed, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort.key === 'dueDate') {
        const leftUnknown = !a.dueDate;
        const rightUnknown = !b.dueDate;
        if (leftUnknown !== rightUnknown) return sort.dir === 'asc' ? (leftUnknown ? 1 : -1) : (leftUnknown ? -1 : 1);
      }
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

  const reviewRows = useMemo(
    () => reviewResponsible ? computed.filter((row) => matchesPersonFilter(reviewResponsible, row.responsible)) : computed,
    [computed, reviewResponsible],
  );
  const taskClaims = state?.claims || [];
  const tasks = useMemo(() => weeklyTasks(computed, todayIso(), reviewResponsible, taskClaims), [computed, reviewResponsible, taskClaims]);
  const taskGroups = useMemo(() => groupWeeklyTasks(tasks), [tasks]);
  const cash = useMemo(() => upcomingCash(reviewRows), [reviewRows]);
  const openTaskGroup = taskGroups.find((group) => group.kind === openTaskKind) || null;

  useEffect(() => {
    if (openTaskKind && !taskGroups.some((group) => group.kind === openTaskKind)) {
      setOpenTaskKind(null);
    }
  }, [openTaskKind, taskGroups]);

  const kpis = useMemo(() => {
    const claim = tasks.filter((task) => task.kind === 'reclamar');
    const review = tasks.filter((task) => task.kind === 'seguir');
    return {
      taskCount: tasks.length,
      overdueCount: claim.length,
      overduePending: claim.reduce((sum, task) => sum + task.row.pending, 0),
      reviewCount: review.length,
      reviewPending: review.reduce((sum, task) => sum + task.row.pending, 0),
    };
  }, [tasks]);

  const peopleOptions = useMemo(() => {
    if (!state) return [...ABONOS_PEOPLE];
    return mergeCatalog(
      [...ABONOS_PEOPLE],
      state.cases.flatMap((row) => [shortPersonName(row.addedBy), shortPersonName(row.responsible)]),
    );
  }, [state]);

  const filterOptions = useMemo(() => {
    const brands = uniquePresent(computed.map((row) => row.brand));
    const types = uniquePresent(computed.map((row) => row.type));
    const areas = uniquePresent(computed.map((row) => row.area));
    const teams = uniquePresent(computed.map((row) => row.teamMotivo));
    const origins = uniquePresent(computed.map((row) => row.origin));
    const statuses = uniquePresent(computed.map((row) => row.status));
    const addedBy = uniquePresent(computed.map((row) => shortPersonName(row.addedBy)));
    const responsibles = uniquePresent(computed.map((row) => shortPersonName(row.responsible)));
    const sources = uniquePresent(computed.map((row) => row.source));
    const years = uniquePresent(computed.map((row) => (row.dueDate || '').slice(0, 4)));
    return { brands, types, areas, teams, origins, statuses, addedBy, responsibles, sources, years };
  }, [computed]);

  if (!state) {
    return (
      <div className="abonos-shell rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-secondary)]">
        Cargando abonos…
      </div>
    );
  }

  const openNew = (preset?: Partial<AbonoCase>, keepTab = false) => {
    const next = { ...emptyForm(), ...preset };
    setEditing(null);
    setForm(next);
    setExpectedAmountText(formatMoneyInput(next.expectedAmount ?? null));
    setCommunicatedAmountText(formatMoneyInput(next.communicatedAmount ?? null));
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(true);
    if (!keepTab) setTab('seguimiento');
  };

  const openNewFromTerm = (term: TradeTerm) => {
    openNew({
      brand: term.brand,
      origin: 'Acuerdo',
      tradeTermId: term.id,
    }, true);
  };

  const closePanel = () => {
    setEditing(null);
    setForm(emptyForm());
    setExpectedAmountText('');
    setCommunicatedAmountText('');
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(false);
  };

  const openEdit = (row: AbonoCase) => {
    setEditing(row);
    setForm({
      ...row,
      dueDate: row.dueDate || '',
      nextReview: row.nextReview || '',
      attachments: row.attachments || [],
      estimated: typeof row.estimated === 'boolean' ? row.estimated : null,
    });
    setExpectedAmountText(formatMoneyInput(row.expectedAmount));
    setCommunicatedAmountText(formatMoneyInput(row.communicatedAmount));
    setClaimDraft({ claimedAt: todayIso(), nextReview: addDaysIso(todayIso(), 7), note: '' });
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(true);
  };

  const applyWeeklyTasks = async (list: WeeklyTask[], note = claimNote) => {
    const actionable = list.filter((task) => task.kind === 'reclamar' || task.kind === 'seguir');
    if (actionable.length === 0) return;
    const ids = new Set(actionable.map((task) => task.row.id));
    const nextReview = addDaysIso(todayIso(), 7);
    const cases = state.cases.map((row) => ids.has(row.id) ? { ...row, nextReview } : row);
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
    if (task.kind === 'fecha') {
      openEdit(task.row);
      return;
    }
    if (task.kind === 'cobro') {
      openEdit(task.row);
      return;
    }
    openEdit(task.row);
  };

  const saveForm = async () => {
    const expectedAmount = parseMoney(expectedAmountText);
    const communicatedAmount = parseMoney(communicatedAmountText);
    const gaps = abonoRequiredGaps({
      brand: form.brand,
      area: form.area,
      teamMotivo: form.teamMotivo,
      type: form.type,
      expectedAmount,
      dueDate: form.dueDate || null,
      addedBy: form.addedBy,
      responsible: form.responsible,
      source: form.source,
      informedBy: form.informedBy,
      status: form.status,
      estimated: typeof form.estimated === 'boolean' ? form.estimated : null,
      origin: form.origin || '',
      tradeTermId: form.tradeTermId || null,
    });
    if (gaps.length > 0) {
      setError(formatRequiredGaps(gaps));
      return;
    }
    setError(null);
    const estimated = form.estimated === true;
    const received = editing
      ? receiptsForCase(state.receipts, editing.id).reduce((sum, item) => sum + item.amount, 0)
      : 0;
    const status = statusAfterReceipts(
      (form.status || '') as AbonoStatus | '',
      expectedAmount,
      received,
      estimated,
    );
    const row: AbonoCase = {
      id: editing?.id || crypto.randomUUID(),
      registro: editing?.registro || nextRegistro(state.cases),
      createdAt: editing ? (editing.createdAt || '') : new Date().toISOString(),
      addedBy: shortPersonName(form.addedBy || ''),
      responsible: shortPersonName(form.responsible || form.addedBy || ''),
      dueDate: form.dueDate || null,
      brand: form.brand || '',
      type: form.type || '',
      area: form.area || '',
      teamMotivo: form.teamMotivo || '',
      origin: (form.origin || '') as AbonoOrigin | '',
      source: (form.source || '') as AbonoSource | '',
      tradeTermId: form.origin === 'Acuerdo' ? (form.tradeTermId || null) : null,
      informedBy: form.informedBy || '',
      expectedAmount,
      communicatedAmount,
      status,
      nextReview: form.nextReview || null,
      comment: form.comment || '',
      estimated,
      attachments: form.attachments || [],
    };
    const cases = editing
      ? state.cases.map((item) => item.id === row.id ? row : item)
      : [row, ...state.cases];
    const catalogs = addCatalogValue(
      addCatalogValue(addCatalogValue(addCatalogValue(state.catalogs, 'brand', row.brand), 'type', row.type), 'area', row.area),
      'team',
      row.teamMotivo,
    );
    void persist({ ...state, cases, catalogs }, backend);
    closePanel();
    setAck({
      title: 'Guardado',
      message: 'El abono ya está en la lista.',
    });
  };

  const addEvidenceBlobs = async (files: Array<{ blob: Blob; name: string }>) => {
    const current = form.attachments || [];
    const remaining = MAX_EVIDENCE - current.length;
    if (remaining <= 0) {
      setError(`Máximo ${MAX_EVIDENCE} documentos por abono.`);
      return;
    }
    const allowed = files.filter((file) => isAllowedEvidence(file.blob, file.name));
    if (allowed.length === 0) {
      setError('Elige una imagen, PDF, Excel u otro documento.');
      return;
    }
    setError(null);
    try {
      const added: AbonoAttachment[] = [];
      for (const file of allowed.slice(0, remaining)) {
        added.push(await fileToAttachment(file.blob, file.name));
      }
      const attachments = [...current, ...added];
      setForm((currentForm) => ({ ...currentForm, attachments }));
      setPanelNote(added.length === 1 ? 'Documento añadido. Pulsa Guardar si es un abono nuevo.' : `${added.length} documentos añadidos.`);
      if (editing && state) {
        const cases = state.cases.map((row) => (row.id === editing.id ? { ...row, attachments } : row));
        await persist({ ...state, cases }, backend);
        setEditing((row) => (row ? { ...row, attachments } : row));
        setPanelNote(added.length === 1 ? 'Documento guardado.' : `${added.length} documentos guardados.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido añadir el documento.');
    }
  };
  addEvidenceRef.current = addEvidenceBlobs;

  const removeEvidence = async (id: string) => {
    const attachments = (form.attachments || []).filter((item) => item.id !== id);
    setForm((currentForm) => ({ ...currentForm, attachments }));
    if (editing && state) {
      const cases = state.cases.map((row) => (row.id === editing.id ? { ...row, attachments } : row));
      await persist({ ...state, cases }, backend);
      setEditing((row) => (row ? { ...row, attachments } : row));
    }
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
    const estimated = form.estimated === true;
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received, estimated);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus, estimated } : row);
    await persist({ ...state, receipts, cases }, backend);
    setEditing({ ...editing, status: nextStatus, estimated });
    setForm((current) => ({ ...current, status: nextStatus, estimated }));
    setReceiptDraft({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
    setNote('Recepción añadida.');
    setPanelNote('Pago registrado.');
  };

  const addClaimFromModal = async () => {
    if (!editing) return;
    const nextReview = claimDraft.nextReview || addDaysIso(todayIso(), 7);
    const hasPriorClaim = claimsForCase(state.claims, editing.id).some((claim) => claim.kind === 'reclamar' || claim.kind === 'seguir');
    const kind = hasPriorClaim ? 'seguir' as const : 'reclamar' as const;
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, nextReview } : row);
    const claims = [...state.claims, makeClaim(editing.id, kind, claimDraft.note, claimDraft.claimedAt || todayIso())];
    await persist({ ...state, cases, claims }, backend);
    setEditing({ ...editing, nextReview });
    setForm((current) => ({ ...current, nextReview }));
    setClaimDraft({ claimedAt: todayIso(), nextReview: addDaysIso(todayIso(), 7), note: '' });
    setNote(`Gestión guardada. Volverá a aparecer el ${formatIsoDate(nextReview)}.`);
    setPanelNote(`Gestión guardada. Vuelve a salir el ${formatIsoDate(nextReview)}.`);
  };

  const addResponseFromModal = async () => {
    if (!editing || !claimDraft.note.trim()) {
      setError('Escribe la respuesta recibida.');
      return;
    }
    const nextReview = claimDraft.nextReview || null;
    const cases = state.cases.map((row) => (
      row.id === editing.id ? { ...row, nextReview } : row
    ));
    const claims = [...state.claims, makeClaim(editing.id, 'respuesta', claimDraft.note, claimDraft.claimedAt || todayIso())];
    await persist({ ...state, cases, claims }, backend);
    setEditing({ ...editing, nextReview });
    setForm((current) => ({ ...current, nextReview }));
    setClaimDraft({ claimedAt: todayIso(), nextReview: addDaysIso(todayIso(), 7), note: '' });
    setError(null);
    setNote(nextReview ? `Respuesta guardada. Volverá a aparecer el ${formatIsoDate(nextReview)}.` : 'Respuesta guardada.');
    setPanelNote(nextReview ? `Respuesta guardada. Vuelve a salir el ${formatIsoDate(nextReview)}.` : 'Respuesta guardada.');
  };

  const deleteReceipt = async (id: string) => {
    if (!editing) return;
    const receipts = state.receipts.filter((row) => row.id !== id);
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const estimated = form.estimated === true;
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received, estimated);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus, estimated } : row);
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

  const unlinkCaseFromTerm = async (caseId: string) => {
    await persist({
      ...state,
      cases: state.cases.map((row) => row.id === caseId ? { ...row, tradeTermId: null } : row),
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
    setExpectedAmountText('');
    setCommunicatedAmountText('');
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

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(abonosTemplateRows()), 'Abonos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(ABONOS_TEMPLATE_INSTRUCTIONS), 'Instrucciones');
    XLSX.writeFile(workbook, 'Plantilla_abonos.xlsx');
  };

  const currentComputed = editing ? computed.find((row) => row.id === editing.id) : null;
  const caseReceipts = editing ? receiptsForCase(state.receipts, editing.id) : [];
  const caseClaims = editing ? claimsForCase(state.claims, editing.id) : [];
  const brandTerms = state.tradeTerms.filter((term) => term.brand === form.brand && (term.active !== false || term.id === form.tradeTermId));
  const formTerm = state.tradeTerms.find((term) => term.id === form.tradeTermId) || null;
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
          <div className="flex justify-end">
            <label className="w-full sm:w-64">
              <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Responsable</span>
              <select
                value={reviewResponsible}
                onChange={(event) => setReviewResponsible(event.target.value)}
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
              >
                <option value="">Todos</option>
                {mergeCatalog(filterOptions.responsibles.options, peopleOptions).map((responsible) => (
                  <option key={responsible} value={responsible}>{responsible}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Tareas esta semana" value={String(kpis.taskCount)} />
            <Kpi label="Vencidos" value={`${kpis.overdueCount} · ${formatMoney(kpis.overduePending)}`} tone={kpis.overdueCount ? 'danger' : undefined} />
            <Kpi label="Pendientes de revisión" value={`${kpis.reviewCount} · ${formatMoney(kpis.reviewPending)}`} tone={kpis.reviewCount ? 'warning' : undefined} />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Tareas de la revisión</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {reviewResponsible
                ? `Solo aparecen los compromisos asignados a ${reviewResponsible}.`
                : 'Aparecen los compromisos de todos los responsables.'}{' '}
              Abre una tarea para registrar la gestión y elegir cuándo revisarla.
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
                      {openTaskGroup.kind !== 'fecha' && (
                        <input
                          value={claimNote}
                          onChange={(event) => setClaimNote(event.target.value)}
                          placeholder="Nota (opcional)"
                          className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                        />
                      )}
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
                      <p className="text-sm font-medium">{taskName(task.row)}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {[task.row.brand, task.row.area].filter(Boolean).join(' · ')} · {task.reason}
                        {task.kind === 'cuadrar' && task.row.pending <= 0.009
                          ? ` · cobrado ${formatMoney(task.row.receivedTotal)}`
                          : ` · ${formatMoney(task.row.pending)}`}
                      </p>
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
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Semanas de lunes a domingo. Solo lo que todavía está pendiente.</p>
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
                            <span className="text-sm font-medium">{caseLabel(row)}</span>
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
            <FilterSelect value={filters.teamMotivo} options={filterOptions.teams.options} includeBlank={filterOptions.teams.hasBlank} placeholder="Equipo" onChange={(teamMotivo) => setFilters({ ...filters, teamMotivo })} />
            <FilterSelect value={filters.origin} options={filterOptions.origins.options} includeBlank={filterOptions.origins.hasBlank} placeholder="Origen" onChange={(origin) => setFilters({ ...filters, origin })} />
            <FilterSelect value={filters.status} options={filterOptions.statuses.options} includeBlank={filterOptions.statuses.hasBlank} placeholder="Estado" onChange={(status) => setFilters({ ...filters, status })} />
            <FilterSelect value={filters.year} options={filterOptions.years.options} includeBlank={filterOptions.years.hasBlank} placeholder="Año" onChange={(year) => setFilters({ ...filters, year })} />
            <FilterSelect value={filters.addedBy} options={filterOptions.addedBy.options} includeBlank={filterOptions.addedBy.hasBlank} placeholder="Añadido por" onChange={(addedBy) => setFilters({ ...filters, addedBy })} />
            <FilterSelect value={filters.responsible} options={filterOptions.responsibles.options} includeBlank={filterOptions.responsibles.hasBlank} placeholder="Responsable" onChange={(responsible) => setFilters({ ...filters, responsible })} />
            <FilterSelect value={filters.source} options={filterOptions.sources.options} includeBlank={filterOptions.sources.hasBlank} placeholder="Canal" onChange={(source) => setFilters({ ...filters, source })} />
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
              <p className="text-[11px] text-[var(--text-secondary)]">Liquidado</p>
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
                  <tr key={row.id} onClick={() => openEdit(row)} className="cursor-pointer">
                    {columnOrder.map((key) => (
                      <td
                        key={key}
                        className={`border-b border-[var(--border)] px-1.5 py-1.5 ${MONEY_COLS.has(key) ? 'font-mono tabular-nums' : ''}`}
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
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Aquí viven los acuerdos. Desde cada uno generas el abono ya vinculado. Completa en la ficha el importe, si es real o estimado y el resto de campos.
            </p>
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
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Compensación</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2">Abonos</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.tradeTerms.map((term) => {
                  const linked = linkedCases(computed, term.id);
                  const rollup = termRollup(linked);
                  return (
                    <tr key={term.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-2">{term.brand}</td>
                      <td className="px-3 py-2 font-medium">{term.name}</td>
                      <td className="px-3 py-2">{term.compensation}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{term.triggerText || '—'}</td>
                      <td className="px-3 py-2">{term.period || '—'}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggleTerm(term.id)} className="text-xs font-semibold">{term.active ? 'Sí' : 'No'}</button>
                      </td>
                      <td className="px-3 py-2">
                        {linked.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">Sin abono</p>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium">
                              {rollup.status} · {linked.length} · {formatMoney(rollup.pending)}
                            </p>
                            {linked.map((row) => (
                              <div key={row.id} className="flex items-start justify-between gap-2 rounded-md bg-[var(--bg-soft)] px-2 py-1.5">
                                <button type="button" onClick={() => openEdit(row)} className="min-w-0 text-left">
                                  <span className="block text-xs font-medium">{taskName(row)}</span>
                                  <span className="mt-0.5 flex items-center gap-1">
                                    <StatusPill row={row} />
                                    <span className="font-mono text-[11px] text-[var(--text-secondary)]">{formatMoney(row.pending)}</span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => unlinkCaseFromTerm(row.id)}
                                  className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)]"
                                  aria-label="Quitar del acuerdo"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openNewFromTerm(term)}
                          className="mr-3 inline-flex h-8 items-center rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white hover:bg-black"
                        >
                          Crear abono
                        </button>
                        <button type="button" onClick={() => deleteTerm(term.id)} className="text-xs text-[var(--danger)]">Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'importar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Plantilla Excel</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Descárgala, rellena filas y súbela aquí. El número de registro lo pone la herramienta.</p>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold hover:bg-[var(--bg-soft)]"
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
            </div>
            <FileUpload
              inputId="abonos-import"
              label="Importar Excel de abonos"
              hint="Una sola carga. Área: B2B, Grassroots, Pro Clubs o Teamsports. Las filas incompletas no se importan."
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
                <p className="text-sm font-semibold">{preview.length} filas · Revisa área, responsable y posibles errores antes de confirmar.</p>
                <select value={bulkArea} onChange={(event) => setBulkArea(event.target.value)} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm">
                  {state.catalogs.areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setPreview(preview.map((row) => {
                    const next = row.area ? row : { ...row, area: bulkArea };
                    return { ...next, error: importPreviewError(next) };
                  }))}
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
                      <th className="px-2 py-2">Equipo</th>
                      <th className="px-2 py-2">Área</th>
                      <th className="px-2 py-2">Responsable</th>
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
                        <td className="px-2 py-1">{displayDash(row.type)}</td>
                        <td className="px-2 py-1">{displayDash(row.teamMotivo)}</td>
                        <td className="px-2 py-1">
                          <select
                            value={row.area}
                            onChange={(event) => {
                              const next = [...preview];
                              const updated = { ...row, area: event.target.value };
                              next[index] = { ...updated, error: importPreviewError(updated) };
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
                            value={row.responsible}
                            onChange={(event) => {
                              const next = [...preview];
                              const updated = { ...row, responsible: event.target.value };
                              next[index] = { ...updated, error: importPreviewError(updated) };
                              setPreview(next);
                            }}
                            list="abonos-import-people"
                            className="h-8 w-full min-w-[140px] rounded border border-[var(--border)] px-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={row.addedBy}
                            onChange={(event) => {
                              const next = [...preview];
                              const updated = { ...row, addedBy: event.target.value };
                              next[index] = { ...updated, error: importPreviewError(updated) };
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
                  {editing ? caseLabel({ brand: form.brand || editing.brand, area: form.area || editing.area, teamMotivo: form.teamMotivo || editing.teamMotivo }) : 'Nuevo abono'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formTerm ? `${formTerm.brand} · ${formTerm.name}${formTerm.compensation ? ` · ${formTerm.compensation}` : ''}` : null}
                  {formTerm ? ' · ' : ''}
                  {formatIsoDate(form.dueDate || null)} · {formatMoney(form.expectedAmount ?? null)}
                  {editing ? ` · #${editing.registro}` : ''}
                </p>
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{editing ? 'Editar' : 'Datos del abono'}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <CatalogField
                    label="Marca"
                    value={form.brand || ''}
                    options={state.catalogs.brands}
                    required
                    onChange={(brand) => {
                      const linked = state.tradeTerms.find((term) => term.id === form.tradeTermId);
                      setForm({
                        ...form,
                        brand,
                        tradeTermId: linked && linked.brand === brand ? form.tradeTermId : null,
                      });
                    }}
                    onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)}
                  />
                  <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                  <CatalogField label="Equipo" value={form.teamMotivo || ''} options={state.catalogs.teams} allowFree required onChange={(teamMotivo) => setForm({ ...form, teamMotivo })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'team', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Origen</span>
                    <select value={form.origin || ''} onChange={(event) => setForm({ ...form, origin: event.target.value as AbonoOrigin | '', tradeTermId: event.target.value === 'Acuerdo' ? form.tradeTermId : null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                    </select>
                  </label>
                  <CatalogField label="Tipo" value={form.type || ''} options={state.catalogs.types} required onChange={(type) => setForm({ ...form, type })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'type', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Importe previsto *</span>
                    <input
                      inputMode="decimal"
                      placeholder="300,44"
                      value={expectedAmountText}
                      onChange={(event) => {
                        const text = event.target.value;
                        setExpectedAmountText(text);
                        setForm({ ...form, expectedAmount: parseMoney(text) });
                      }}
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Real o estimado *</span>
                    <select
                      value={form.estimated === true ? 'Estimado' : form.estimated === false ? 'Real' : ''}
                      onChange={(event) => {
                        const estimated = event.target.value === 'Estimado' ? true : event.target.value === 'Real' ? false : null;
                        const received = currentComputed?.receivedTotal ?? 0;
                        setForm({
                          ...form,
                          estimated,
                          status: estimated === null
                            ? form.status
                            : statusAfterReceipts(form.status || '', form.expectedAmount ?? null, received, estimated),
                        });
                      }}
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    >
                      <option value="">—</option>
                      {ABONO_AMOUNT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha prevista *</span>
                    <input
                      type="date"
                      value={form.dueDate || ''}
                      onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    />
                  </label>
                  {form.origin === 'Acuerdo' && (
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Trade Term *</span>
                      <select value={form.tradeTermId || ''} onChange={(event) => setForm({ ...form, tradeTermId: event.target.value || null })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                        <option value="">Selecciona</option>
                        {brandTerms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.compensation}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Añadido por *</span>
                    <select value={form.addedBy || ''} onChange={(event) => setForm({ ...form, addedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Responsable de seguimiento *</span>
                    <select value={form.responsible || ''} onChange={(event) => setForm({ ...form, responsible: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <p className="md:col-span-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Confirmación de la marca</p>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Canal *</span>
                    <select value={form.source || ''} onChange={(event) => setForm({ ...form, source: event.target.value as AbonoSource | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {ABONO_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Persona *</span>
                    <input
                      value={form.informedBy || ''}
                      onChange={(event) => setForm({ ...form, informedBy: event.target.value })}
                      placeholder="Quién te lo dijo o de la marca"
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    />
                  </label>
                  <div className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Documentos</span>
                    <p className="text-[11px] text-[var(--text-secondary)]">Imagen, PDF o Excel. Hasta {MAX_EVIDENCE}. Pega una captura con Ctrl+V.</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(form.attachments || []).map((item) => (
                        <div key={item.id} className="relative">
                          <button
                            type="button"
                            onClick={() => openAttachment(item, setViewerImage)}
                            className="flex h-20 w-28 flex-col items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-white px-1 text-center"
                            title={item.name}
                          >
                            {isImageAttachment(item) ? (
                              <img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <>
                                <FileText className="h-5 w-5 text-[var(--text-muted)]" />
                                <span className="mt-1 w-full truncate text-[10px] text-[var(--text-secondary)]">{item.name}</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEvidence(item.id)}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] hover:text-[var(--danger)]"
                            aria-label="Quitar documento"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {(form.attachments || []).length < MAX_EVIDENCE && (
                        <button
                          type="button"
                          onClick={() => evidenceInputRef.current?.click()}
                          className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                        >
                          <ImagePlus className="h-4 w-4" />
                          <span className="text-[11px] font-medium">Añadir</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={evidenceInputRef}
                      type="file"
                      accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = '';
                        void addEvidenceBlobs(files.map((file) => ({ blob: file, name: file.name })));
                      }}
                    />
                  </div>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado *</span>
                    <select
                      value={form.status || ''}
                      onChange={(event) => {
                        const status = event.target.value as AbonoStatus | '';
                        setForm({ ...form, status, estimated: status === 'A cuenta' ? true : form.estimated });
                      }}
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    >
                      <option value="">—</option>
                      {ABONO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  {form.status === 'Pago comunicado' && (
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Importe comunicado por la marca</span>
                      <input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={communicatedAmountText}
                        onChange={(event) => {
                          const text = event.target.value;
                          setCommunicatedAmountText(text);
                          setForm({ ...form, communicatedAmount: parseMoney(text) });
                        }}
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-right font-mono text-sm"
                      />
                      {form.communicatedAmount !== null && form.communicatedAmount !== undefined
                        && Math.abs(form.communicatedAmount - (currentComputed?.pending ?? Math.max(0, form.expectedAmount ?? 0))) > 0.009 && (
                        <span className="block text-xs font-medium text-[var(--warning)]">No coincide con el importe pendiente.</span>
                      )}
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Próxima revisión</span>
                    <input type="date" value={form.nextReview || ''} onChange={(event) => setForm({ ...form, nextReview: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                    <textarea
                      value={form.comment || ''}
                      onChange={(event) => setForm({ ...form, comment: event.target.value })}
                      rows={3}
                      placeholder="Nombre del correo, día de la conversación, nº de pedido…"
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                {panelNote && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-[var(--success-soft)] px-3 py-2.5 text-sm font-medium text-[var(--success)]" role="status">
                    <Check className="h-4 w-4 shrink-0" />
                    {panelNote}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={saveForm}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                  >
                    Guardar
                  </button>
                  {editing && (
                    <button type="button" onClick={() => deleteCase(editing.id)} className="rounded-md px-4 py-2 text-sm text-[var(--danger)]">Eliminar</button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Resumen</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{form.estimated === true ? 'Previsto (estimado)' : 'Previsto'}</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(currentComputed?.expectedAmount ?? form.expectedAmount ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Liquidado</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--success)]">{formatMoney(currentComputed?.receivedTotal ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Pendiente</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold">{formatMoney(currentComputed?.pending ?? Math.max(0, (form.expectedAmount ?? 0)))}</p>
                    </div>
                  </div>
                  {currentComputed && (
                    <div className="mt-3">
                      <StatusPill row={{
                        ...currentComputed,
                        estimated: form.estimated === true,
                        status: (form.status || currentComputed.status) as AbonoComputed['status'],
                      }} />
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {caseReceipts.length === 0
                      ? 'Sin pagos registrados.'
                      : `${caseReceipts.length} pago${caseReceipts.length === 1 ? '' : 's'} · último ${formatIsoDate(caseReceipts[caseReceipts.length - 1]?.receivedAt || null)}`}
                  </p>
                  {form.estimated === true && currentComputed && currentComputed.pending > 0.009 && (
                    <p className="mt-2 text-sm font-medium text-[var(--warning)]">
                      Quedan {formatMoney(currentComputed.pending)}. Reclama el resto o baja el previsto cuando sepas el importe real.
                    </p>
                  )}
                  {form.estimated === true && currentComputed && currentComputed.pending <= 0.009 && currentComputed.receivedTotal > 0.009 && (
                    <p className="mt-2 text-sm font-medium text-[var(--account)]">
                      Han pagado el estimado. Cuando sepas el importe real, ajústalo y márcalo como Real.
                    </p>
                  )}
                  {form.estimated !== true && currentComputed?.overdueDays !== null && currentComputed?.overdueDays !== undefined && (
                    <p className="mt-2 text-sm font-medium text-[var(--danger)]">Vencido hace {currentComputed.overdueDays} días</p>
                  )}
                  {currentComputed?.reviewOverdue && (
                    <p className="mt-1 text-sm font-medium text-[var(--warning)]">Revisar hoy</p>
                  )}
                  {form.estimated !== true && currentComputed && currentComputed.excessAmount > 0.009 && (
                    <p className="mt-2 text-sm font-medium text-[var(--excess)]">Han pagado {formatMoney(currentComputed.excessAmount)} de más.</p>
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
                      <dt className="text-[11px] text-[var(--text-secondary)]">Responsable</dt>
                      <dd>{displayDash(form.responsible)}</dd>
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
                      <dt className="text-[11px] text-[var(--text-secondary)]">Real o estimado</dt>
                      <dd>{displayDash(amountKindLabel(form.estimated ?? null))}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Origen</dt>
                      <dd>{displayDash(form.origin)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Trade Term</dt>
                      <dd>{displayDash(currentComputed?.tradeTermName)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Canal</dt>
                      <dd>{displayDash(form.source)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Persona</dt>
                      <dd>{displayDash(form.informedBy)}</dd>
                    </div>
                  </dl>
                  {(form.attachments || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(form.attachments || []).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openAttachment(item, setViewerImage)}
                          className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-white"
                          title={item.name}
                        >
                          {isImageAttachment(item) ? (
                            <img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
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
                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">Fecha de la gestión</span>
                        <input type="date" value={claimDraft.claimedAt} onChange={(event) => setClaimDraft({ ...claimDraft, claimedAt: event.target.value })} className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
                      </label>
                      <input value={claimDraft.note} onChange={(event) => setClaimDraft({ ...claimDraft, note: event.target.value })} placeholder="Reclamación o respuesta recibida" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <label className="space-y-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">Volver a revisar</span>
                        <input type="date" value={claimDraft.nextReview} onChange={(event) => setClaimDraft({ ...claimDraft, nextReview: event.target.value })} className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={addClaimFromModal} className="rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-black">He reclamado</button>
                        <button type="button" onClick={addResponseFromModal} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-soft)]">Añadir respuesta</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Pagos recibidos</p>
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
                      <input inputMode="decimal" value={receiptDraft.amount} onChange={(event) => setReceiptDraft({ ...receiptDraft, amount: event.target.value })} placeholder="Importe" className="h-9 rounded-md border border-[var(--border)] px-3 text-right font-mono text-sm" />
                      <input value={receiptDraft.reference} onChange={(event) => setReceiptDraft({ ...receiptDraft, reference: event.target.value })} placeholder="Referencia" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <input value={receiptDraft.comment} onChange={(event) => setReceiptDraft({ ...receiptDraft, comment: event.target.value })} placeholder="Comentario" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" />
                      <button type="button" onClick={addReceipt} className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Registrar pago</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ack && (
        <AckDialog
          title={ack.title}
          message={ack.message}
          onAccept={() => setAck(null)}
        />
      )}

      {viewerImage && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewerImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Captura"
        >
          <button type="button" className="absolute right-4 top-4 rounded-md p-1 text-white" onClick={() => setViewerImage(null)} aria-label="Cerrar captura">
            <X className="h-6 w-6" />
          </button>
          <img src={viewerImage} alt="Captura de confirmación" className="max-h-[90vh] max-w-[90vw] rounded-md object-contain" onClick={(event) => event.stopPropagation()} />
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

function openAttachment(item: AbonoAttachment, onImage: (url: string) => void) {
  if (isImageAttachment(item)) {
    onImage(item.dataUrl);
    return;
  }
  const link = document.createElement('a');
  link.href = item.dataUrl;
  link.download = item.name || 'documento';
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  if (row.estimated === true || row.status === 'A cuenta') {
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1">
        <span className={`${pill} bg-[var(--account-soft)] text-[var(--account)]`}>
          {row.status === 'A cuenta' || row.receivedTotal > 0.009 ? 'A cuenta' : 'Estimado'}
        </span>
        {row.pending > 0.009 && (
          <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>
            {row.overdueDays !== null ? 'Vencido · ' : ''}Quedan {formatMoney(row.pending)}
          </span>
        )}
      </span>
    );
  }
  if (row.status === 'Liquidado parcialmente') {
    return <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>{row.overdueDays !== null ? 'Vencido · ' : ''}{row.status}</span>;
  }
  if (row.status === 'Pago comunicado') {
    const mismatch = row.communicatedAmount !== null && Math.abs(row.communicatedAmount - row.pending) > 0.009;
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1">
        <span className={`${pill} bg-violet-100 text-violet-700`}>Pago comunicado</span>
        {mismatch && <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>Importe no cuadra</span>}
      </span>
    );
  }
  if (row.overdueDays !== null) {
    return <span className={`${pill} bg-[var(--danger-soft)] text-[var(--danger)]`}><AlertTriangle className="mr-0.5 inline h-3 w-3 align-text-bottom" /> Vencido · {row.status}</span>;
  }
  if (row.reviewOverdue) {
    return <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>Revisar · {row.status}</span>;
  }
  if (row.status === 'Exceso') {
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1">
        <span className={`${pill} bg-[var(--excess-soft)] text-[var(--excess)]`}>Exceso</span>
        {row.excessAmount > 0.009 && (
          <span className={`${pill} bg-[var(--excess-soft)] text-[var(--excess)]`}>+{formatMoney(row.excessAmount)}</span>
        )}
      </span>
    );
  }
  if (row.status === 'Liquidado') {
    return <span className={`${pill} bg-[var(--success-soft)] text-[var(--success)]`}>{row.status}</span>;
  }
  return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-secondary)]`}>{row.status}</span>;
}
