'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import TradeArchiveView from '@/components/TradeArchiveView';
import AbonosImportPanel from '@/components/AbonosImportPanel';
import { normalizeArchive } from '@/lib/trade-archive';
import {
  ABONOS_PEOPLE,
  addDaysIso,
  abonoAlert,
  abonoRequiredGaps,
  isClosedStatus,
  MANUAL_STATUSES,
  statusLabel,
  type AbonoAlert,
  caseLabel,
  computeAll,
  DEFAULT_NEW_AUTHOR,
  displayDash,
  formatIsoDate,
  resolveAmountDetails,
  formatMoney,
  formatMoneyInput,
  formatRequiredGaps,
  groupWeeklyTasks,
  makeClaim,
  mergeCatalog,
  nextRegistro,
  parseMoney,
  receiptsForCase,
  resolveManualStatus,
  shortPersonName,
  statusAfterReceipts,
  taskName,
  todayIso,
  upcomingCash,
  weeklyTasks,
  type AbonoAttachment,
  type AbonoCase,
  type AbonoComputed,
  type AbonoAmountMode,
  type AbonoOrigin,
  type AbonoReceipt,
  type AbonoSource,
  type AbonoStatus,
  type AbonosState,
  type WeeklyTask,
  type WeeklyTaskKind,
} from '@/lib/abonos-model';
import { documentLabelsByCase, documentsForExport, zipStored } from '@/lib/abonos-export-pack';
import { buildAbonosWorkbook } from '@/lib/abonos-export-xlsx';
import { addCatalogValue, loadAbonosState, saveAbonosState, type AbonosBackend } from '@/lib/abonos-store';
import { AlertTriangle, Check, ChevronDown, Clock, ChevronRight, Download, FileText, GripVertical, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Revisión' },
  { id: 'seguimiento', label: 'Abonos' },
  { id: 'terms', label: 'Trade Terms' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SortKey =
  | 'alert'
  | 'responsible'
  | 'dueDate'
  | 'brand'
  | 'type'
  | 'area'
  | 'teamMotivo'
  | 'expectedAmount'
  | 'amountMode'
  | 'receivedTotal'
  | 'pending'
  | 'status'
  | 'concept'
  | 'attachments';

const MONEY_COLS = new Set<SortKey>(['expectedAmount', 'receivedTotal', 'pending']);

/** Only what is needed at a glance; the rest lives in the abono form. Concepto takes the spare width. */
const COLUMN_DEFS: Array<{ key: SortKey; label: string; width: number }> = [
  { key: 'brand', label: 'Marca', width: 110 },
  { key: 'type', label: 'Tipo', width: 130 },
  { key: 'concept', label: 'Concepto', width: 280 },
  { key: 'dueDate', label: 'Fecha prevista', width: 140 },
  { key: 'amountMode', label: 'Cálculo', width: 110 },
  { key: 'expectedAmount', label: 'Previsto', width: 140 },
  { key: 'receivedTotal', label: 'Cobrado', width: 140 },
  { key: 'pending', label: 'Pendiente', width: 140 },
  { key: 'status', label: 'Estado', width: 220 },
];

const COL_STORAGE = 'ts-abonos-cols-v15';
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
    const parsed = JSON.parse(raw) as { order?: string[]; widths?: Partial<Record<string, number>> };
    const saved = (parsed.order || [])
      .map((key) => (key === 'comment' ? 'concept' : key))
      .filter((key): key is SortKey => DEFAULT_ORDER.includes(key as SortKey));
    const missing = DEFAULT_ORDER.filter((key) => !saved.includes(key));
    const order = saved.length > 0 ? [...saved, ...missing] : [...DEFAULT_ORDER];
    const widths = { ...DEFAULT_WIDTHS };
    DEFAULT_ORDER.forEach((key) => {
      const width = parsed.widths?.[key] ?? (key === 'concept' ? parsed.widths?.comment : undefined);
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

function matchesAnyFilter(selected: string[], actual: string): boolean {
  if (!selected.length) return true;
  return selected.some((value) => matchesFilter(value, actual));
}

function matchesPersonFilter(selected: string, actual: string): boolean {
  if (!selected) return true;
  if (selected === BLANK) return !actual.trim();
  const a = actual.trim().toLocaleLowerCase('es');
  const s = selected.trim().toLocaleLowerCase('es');
  if (!a) return false;
  return a === s || a.startsWith(`${s} `) || s.startsWith(`${a} `) || a.startsWith(s) || s.startsWith(a);
}

function matchesAnyPersonFilter(selected: string[], actual: string): boolean {
  if (!selected.length) return true;
  return selected.some((value) => matchesPersonFilter(value, actual));
}

function matchesAttachmentFilter(selected: string[], count: number): boolean {
  if (!selected.length) return true;
  const has = count > 0;
  return selected.some((value) => (value === 'Sí' && has) || (value === 'No' && !has));
}

function MoneyCell({ value, tone, strong }: { value: number | null; tone?: 'success'; strong?: boolean }) {
  if (value === null) return <span className="text-[var(--text-muted)]">—</span>;
  if (Math.abs(value) < 0.005) return <span className="text-[#c4c4c8]">0,00 €</span>;
  const color = tone === 'success' ? 'text-[var(--success)]' : '';
  return <span className={`${color} ${strong ? 'font-semibold' : ''}`}>{formatMoney(value)}</span>;
}

function renderAbonoCell(row: AbonoComputed, key: SortKey, alert: AbonoAlert | null) {
  switch (key) {
    case 'alert':
      return <AlertChip alert={alert} />;
    case 'responsible':
      return displayDash(row.responsible);
    case 'dueDate':
      return <span className="text-[var(--text-secondary)]">{formatIsoDate(row.dueDate)}</span>;
    case 'brand':
      return <span className="font-semibold">{displayDash(row.brand)}</span>;
    case 'type':
      return <span className="text-[var(--text-secondary)]">{displayDash(row.type)}</span>;
    case 'area':
      return displayDash(row.area);
    case 'teamMotivo':
      return displayDash(row.teamMotivo);
    case 'expectedAmount':
      return <MoneyCell value={row.expectedAmount} />;
    case 'amountMode':
      return <span className="text-[var(--text-secondary)]">{row.amountModeResolved === 'Variable' ? 'Estimado' : row.amountModeResolved}</span>;
    case 'receivedTotal':
      return <MoneyCell value={row.receivedTotal} tone="success" />;
    case 'pending':
      return <MoneyCell value={row.pending} strong />;
    case 'status':
      return <StatusPill row={row} />;
    case 'concept':
      return <span className="block whitespace-normal break-words">{row.concept.trim() || '—'}</span>;
    case 'attachments': {
      const count = (row.attachments || []).length;
      return count > 0 ? String(count) : '—';
    }
    default:
      return null;
  }
}

function paymentLabel(index: number): string {
  if (index === 0) return '1er pago';
  if (index === 1) return '2º pago';
  return `Pago ${index + 1}`;
}

type FilterOption = { value: string; label: string; group?: string };

type AbonoFilters = {
  brand: string[];
  type: string[];
  area: string[];
  teamMotivo: string[];
  status: string[];
  duePeriod: string[];
  amountMode: string[];
  attachments: string[];
  origin: string[];
  responsible: string[];
  search: string;
  quick: QuickFilter;
};

type QuickFilter = '' | 'vencido' | 'revisar' | 'abiertos' | 'comunicado' | 'acuenta' | 'cobrado';

const QUICK_FILTERS: Array<{ id: Exclude<QuickFilter, ''>; label: string; tone: string }> = [
  { id: 'vencido', label: 'Vencidos', tone: 'danger' },
  { id: 'revisar', label: 'Revisar', tone: 'warning' },
  { id: 'abiertos', label: 'Pendientes de cobro', tone: 'neutral' },
  { id: 'comunicado', label: 'Pago comunicado', tone: 'violet' },
  { id: 'acuenta', label: 'A cuenta', tone: 'account' },
  { id: 'cobrado', label: 'Cobrados', tone: 'success' },
];

function matchesQuick(row: AbonoComputed, quick: QuickFilter, today: string): boolean {
  if (!quick) return true;
  const alert = abonoAlert(row, today);
  if (quick === 'vencido') return alert?.level === 'danger';
  if (quick === 'revisar') return alert?.level === 'warning';
  if (quick === 'abiertos') return Boolean(row.status) && !isClosedStatus(row.status) && (row.pending > 0.009 || row.status === 'A cuenta');
  if (quick === 'comunicado') return row.status === 'Pago comunicado';
  if (quick === 'acuenta') return row.status === 'A cuenta';
  return isClosedStatus(row.status);
}

const emptyFilters: AbonoFilters = {
  brand: [],
  type: [],
  area: [],
  teamMotivo: [],
  status: [],
  duePeriod: [],
  amountMode: [],
  attachments: [],
  origin: [],
  responsible: [],
  search: '',
  quick: '',
};

const MONTHS_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function matchesDuePeriod(dueDate: string, period: string, today: string): boolean {
  if (!period) return true;
  if (period === BLANK) return !dueDate.trim();
  if (!dueDate) return false;
  if (period === 'overdue') return dueDate < today;
  if (period === 'next30') {
    const end = addDaysIso(today, 30);
    return dueDate >= today && dueDate <= end;
  }
  if (period.startsWith('year:')) return dueDate.startsWith(period.slice(5));
  if (period.startsWith('month:')) return dueDate.startsWith(period.slice(6));
  if (period.startsWith('h1:')) {
    const year = period.slice(3);
    return dueDate >= `${year}-01-01` && dueDate <= `${year}-06-30`;
  }
  if (period.startsWith('h2:')) {
    const year = period.slice(3);
    return dueDate >= `${year}-07-01` && dueDate <= `${year}-12-31`;
  }
  return true;
}

function matchesDuePeriods(selected: string[], dueDate: string, today: string): boolean {
  if (!selected.length) return true;
  return selected.some((period) => matchesDuePeriod(dueDate, period, today));
}

function rowMatchesFilters(
  row: AbonoComputed,
  filters: AbonoFilters,
  today: string,
  except?: keyof AbonoFilters,
): boolean {
  if (except !== 'brand' && !matchesAnyFilter(filters.brand, row.brand)) return false;
  if (except !== 'type' && !matchesAnyFilter(filters.type, row.type)) return false;
  if (except !== 'area' && !matchesAnyFilter(filters.area, row.area)) return false;
  if (except !== 'teamMotivo' && !matchesAnyFilter(filters.teamMotivo, row.teamMotivo)) return false;
  if (except !== 'status' && !matchesAnyFilter(filters.status, row.status)) return false;
  if (except !== 'responsible' && !matchesAnyPersonFilter(filters.responsible, row.responsible)) return false;
  if (except !== 'duePeriod' && !matchesDuePeriods(filters.duePeriod, row.dueDate || '', today)) return false;
  if (except !== 'amountMode' && !matchesAnyFilter(filters.amountMode, row.amountModeResolved)) return false;
  if (except !== 'origin' && !matchesAnyFilter(filters.origin, row.origin)) return false;
  if (except !== 'attachments' && !matchesAttachmentFilter(filters.attachments, (row.attachments || []).length)) return false;
  if (except !== 'quick' && !matchesQuick(row, filters.quick, today)) return false;
  if (except !== 'search') {
    const search = filters.search.trim().toLocaleLowerCase('es');
    if (search) {
      const blob = [row.registro, row.brand, row.type, row.area, row.teamMotivo, row.concept, row.notes, row.informedBy, row.source, row.tradeTermName, row.addedBy, row.responsible, row.amountModeResolved, row.amountConditionResolved].join(' ').toLocaleLowerCase('es');
      if (!blob.includes(search)) return false;
    }
  }
  return true;
}

function duePeriodOptions(rows: AbonoComputed[], today: string): { periods: FilterOption[]; datesBlank: boolean } {
  const yearParts = uniquePresent(rows.map((row) => (row.dueDate || '').slice(0, 4)));
  const months = Array.from(new Set(rows.map((row) => (row.dueDate || '').slice(0, 7)).filter((value) => value.length === 7))).sort().reverse();
  const extras: FilterOption[] = [
    { value: 'overdue', label: 'Vencidos' },
    { value: 'next30', label: 'Próximos 30 días' },
  ].filter((option) => rows.some((row) => matchesDuePeriod(row.dueDate || '', option.value, today)));
  const periodMonths: FilterOption[] = months.map((month) => {
    const year = month.slice(0, 4);
    const index = Number(month.slice(5, 7)) - 1;
    return {
      value: `month:${month}`,
      label: Number.isNaN(index) || index < 0 || index > 11 ? month : MONTHS_SHORT_ES[index],
      group: year,
    };
  });
  return { periods: [...extras, ...periodMonths], datesBlank: yearParts.hasBlank };
}

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
  concept: '',
  notes: '',
  estimated: false,
  amountMode: 'Fijo',
  amountCondition: '',
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
  const [exportScope, setExportScope] = useState<'all' | 'view'>('all');
  const [exportWithDocs, setExportWithDocs] = useState(false);
  const [bulkArea, setBulkArea] = useState('Grassroots');
  const [openTaskKind, setOpenTaskKind] = useState<WeeklyTaskKind | null>(null);
  const [openCashWeek, setOpenCashWeek] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
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
    const today = todayIso();
    return computed.filter((row) => rowMatchesFilters(row, filters, today));
  }, [computed, filters]);

  const sorted = useMemo(() => {
    const today = todayIso();
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort.key === 'dueDate') {
        const leftUnknown = !a.dueDate;
        const rightUnknown = !b.dueDate;
        if (leftUnknown !== rightUnknown) return sort.dir === 'asc' ? (leftUnknown ? 1 : -1) : (leftUnknown ? -1 : 1);
      }
      if (sort.key === 'alert') {
        const left = abonoAlert(a, today)?.rank ?? 0;
        const right = abonoAlert(b, today)?.rank ?? 0;
        return sort.dir === 'asc' ? right - left : left - right;
      }
      if (sort.key === 'amountMode') {
        const result = a.amountModeResolved.localeCompare(b.amountModeResolved, 'es');
        return sort.dir === 'asc' ? result : -result;
      }
      if (sort.key === 'attachments') {
        const left = (a.attachments || []).length;
        const right = (b.attachments || []).length;
        return sort.dir === 'asc' ? left - right : right - left;
      }
      const left = a[sort.key];
      const right = b[sort.key];
      const result = String(left ?? '').localeCompare(String(right ?? ''), 'es', { numeric: true });
      return sort.dir === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort]);

  const activeFilterCount = [filters.brand, filters.type, filters.area, filters.teamMotivo, filters.status, filters.duePeriod, filters.amountMode, filters.attachments, filters.responsible]
    .filter((list) => list.length > 0).length + (filters.search.trim() ? 1 : 0);

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
    const review = tasks.filter((task) => task.kind === 'cuadrar');
    return {
      taskCount: tasks.length,
      overdueCount: claim.length,
      overduePending: claim.reduce((sum, task) => sum + task.row.pending, 0),
      reviewCount: review.length,
      // Same sum as the "Importe por cerrar" group: what is still owed, or what came in on account.
      reviewPending: review.reduce((sum, task) => sum + (task.row.pending > 0.009 ? task.row.pending : task.row.receivedTotal), 0),
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
    const today = todayIso();
    const forKey = (except: keyof AbonoFilters) => computed.filter((row) => rowMatchesFilters(row, filters, today, except));
    // Options come from the rows the other filters leave, plus whatever is already selected,
    // so combining filters never drops a selection.
    const keep = (present: { options: string[]; hasBlank: boolean }, selected: string[]) => ({
      options: Array.from(new Set([...present.options, ...selected.filter((value) => value !== BLANK)])),
      hasBlank: present.hasBlank || selected.includes(BLANK),
    });
    const brands = keep(uniquePresent(forKey('brand').map((row) => row.brand)), filters.brand);
    const types = keep(uniquePresent(forKey('type').map((row) => row.type)), filters.type);
    const areas = keep(uniquePresent(forKey('area').map((row) => row.area)), filters.area);
    const teams = keep(uniquePresent(forKey('teamMotivo').map((row) => row.teamMotivo)), filters.teamMotivo);
    const statuses = keep(uniquePresent(forKey('status').map((row) => row.status)), filters.status);
    const responsibles = keep(uniquePresent(forKey('responsible').map((row) => shortPersonName(row.responsible))), filters.responsible);
    const modes = keep(uniquePresent(forKey('amountMode').map((row) => row.amountModeResolved)), filters.amountMode);
    const origins = keep(uniquePresent(forKey('origin').map((row) => row.origin)), filters.origin);
    const attachments = keep(uniquePresent(forKey('attachments').map((row) => ((row.attachments || []).length > 0 ? 'Sí' : 'No'))), filters.attachments);
    // Like the other filters: only dates that give results with the rest of the filters.
    // An already chosen date stays listed so it never vanishes while selected.
    const dateRows = forKey('duePeriod');
    const datePresent = duePeriodOptions(dateRows, today);
    const chosenDates = duePeriodOptions(computed, today).periods.filter((option) => filters.duePeriod.includes(option.value));
    const periods = [
      ...datePresent.periods,
      ...chosenDates.filter((option) => !datePresent.periods.some((item) => item.value === option.value)),
    ];
    const datesBlank = datePresent.datesBlank || filters.duePeriod.includes(BLANK);
    const quickRows = forKey('quick');
    const quickCounts = Object.fromEntries(QUICK_FILTERS.map((item) => [item.id, quickRows.filter((row) => matchesQuick(row, item.id, today)).length])) as Record<Exclude<QuickFilter, ''>, number>;
    return { brands, types, areas, teams, statuses, responsibles, modes, origins, attachments, periods, datesBlank, quickCounts };
  }, [computed, filters]);

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
    const term = state.tradeTerms.find((item) => item.id === row.tradeTermId) || null;
    const amount = resolveAmountDetails(row, term);
    setEditing(row);
    setForm({
      ...row,
      dueDate: row.dueDate || '',
      nextReview: row.nextReview || '',
      attachments: row.attachments || [],
      estimated: amount.mode === 'Variable',
      amountMode: row.amountMode || amount.mode,
      amountCondition: row.amountCondition || amount.condition,
    });
    setExpectedAmountText(formatMoneyInput(row.expectedAmount));
    setCommunicatedAmountText(formatMoneyInput(row.communicatedAmount));
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
      estimated: form.amountMode === 'Variable',
      amountMode: form.amountMode,
      origin: form.origin || '',
      tradeTermId: form.tradeTermId || null,
    });
    if (gaps.length > 0) {
      setError(formatRequiredGaps(gaps));
      return;
    }
    setError(null);
    const estimated = form.amountMode === 'Variable';
    const received = editing
      ? receiptsForCase(state.receipts, editing.id).reduce((sum, item) => sum + item.amount, 0)
      : 0;
    const status = resolveManualStatus(
      (form.status || '') as AbonoStatus | '',
      expectedAmount,
      received,
      estimated,
    );
    const row: AbonoCase = {
      id: editing?.id || crypto.randomUUID(),
      registro: editing?.registro || nextRegistro(state.cases),
      createdAt: editing ? (editing.createdAt || '') : new Date().toISOString(),
      addedBy: shortPersonName(form.addedBy || DEFAULT_NEW_AUTHOR),
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
      concept: form.concept || '',
      notes: form.notes || '',
      estimated,
      amountMode: form.amountMode === 'Variable' || form.amountMode === 'Fijo' ? form.amountMode : '',
      amountCondition: String(form.amountCondition || '').trim(),
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
    await persist({ ...state, cases, catalogs }, backend);
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
    const estimated = form.amountMode === 'Variable';
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received, estimated);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus, estimated } : row);
    await persist({ ...state, receipts, cases }, backend);
    setEditing({ ...editing, status: nextStatus, estimated });
    setForm((current) => ({ ...current, status: nextStatus, estimated }));
    setReceiptDraft({ receivedAt: todayIso(), amount: '', reference: '', comment: '' });
    setNote('Recepción añadida.');
    setPanelNote('Pago registrado.');
  };

  const deleteReceipt = async (id: string) => {
    if (!editing) return;
    const receipts = state.receipts.filter((row) => row.id !== id);
    const received = receipts.filter((item) => item.caseId === editing.id).reduce((sum, item) => sum + item.amount, 0);
    const estimated = form.amountMode === 'Variable';
    const nextStatus = statusAfterReceipts(editing.status, editing.expectedAmount, received, estimated);
    const cases = state.cases.map((row) => row.id === editing.id ? { ...row, status: nextStatus, estimated } : row);
    await persist({ ...state, receipts, cases }, backend);
    setEditing({ ...editing, status: nextStatus, estimated });
    setForm((current) => ({ ...current, status: nextStatus, estimated }));
  };

  const exportWorkbook = async (rows: AbonoComputed[], withDocs: boolean) => {
    try {
      setError(null);
      setNote('Preparando la descarga…');
      const documents = withDocs ? documentsForExport(rows) : [];
      const labels = documentLabelsByCase(documents);
      const xlsxBytes = await buildAbonosWorkbook(rows, state.receipts, labels, withDocs ? documents : null);
      if (!withDocs) {
        const blob = new Blob([xlsxBytes.buffer.slice(xlsxBytes.byteOffset, xlsxBytes.byteOffset + xlsxBytes.byteLength) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Abonos_${todayIso()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        setNote(`Descargado el Excel con ${rows.length} abono${rows.length === 1 ? '' : 's'}.`);
        return;
      }
      const zip = zipStored([
        { path: 'Abonos.xlsx', bytes: xlsxBytes },
        ...documents.map((file) => ({ path: file.path, bytes: file.bytes })),
      ]);
      const packed = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
      const blob = new Blob([packed], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Abonos_${todayIso()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNote(documents.length
        ? `Descargado: Excel y ${documents.length} documento${documents.length === 1 ? '' : 's'} en la carpeta documentos.`
        : 'Descargado el Excel. En esta selección no hay documentos adjuntos.');
    } catch (err) {
      setNote(null);
      setError(err instanceof Error ? err.message : 'No he podido preparar la descarga.');
    }
  };

  const exportRows = exportScope === 'all' ? computed : sorted;
  const exportDocCount = exportRows.reduce((sum, row) => sum + (row.attachments?.length || 0), 0);
  const viewDocCount = sorted.reduce((sum, row) => sum + (row.attachments?.length || 0), 0);
  const allDocCount = computed.reduce((sum, row) => sum + (row.attachments?.length || 0), 0);

  const currentComputed = editing ? computed.find((row) => row.id === editing.id) : null;
  const caseReceipts = editing ? receiptsForCase(state.receipts, editing.id) : [];
  const actionColWidth = 44;
  const todayValue = todayIso();
  const tableWidth = columnOrder.reduce((sum, key) => sum + columnWidths[key], 0) + actionColWidth;

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
    <div className="abonos-shell space-y-6">
      <WorkspaceChrome
        onBack={onBack}
        number="05"
        title="Abonos"
        tabs={[...TABS]}
        active={tab}
        onSelect={(id) => setTab(id as TabId)}
        actions={(
          <button
            type="button"
            onClick={() => openNew()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 text-sm font-semibold text-white hover:bg-black"
          >
            <Plus className="h-4 w-4" />
            Nuevo abono
          </button>
        )}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}
      {note && (
        <p className="text-xs font-medium text-[var(--success)]">{note}</p>
      )}

      {tab === 'dashboard' && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Tareas esta semana</p>
              <p className="abonos-kpi-value">{kpis.taskCount}</p>
              <p className="abonos-kpi-hint">por revisar</p>
            </div>
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Vencidos</p>
              <p className={`abonos-kpi-value ${kpis.overdueCount ? 'text-[var(--danger)]' : ''}`}>{formatMoney(kpis.overduePending)}</p>
              <p className="abonos-kpi-hint">{kpis.overdueCount} abono{kpis.overdueCount === 1 ? '' : 's'} con la fecha pasada</p>
            </div>
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Importe por cerrar</p>
              <p className={`abonos-kpi-value ${kpis.reviewCount ? 'text-[#b45309]' : ''}`}>{formatMoney(kpis.reviewPending)}</p>
              <p className="abonos-kpi-hint">{kpis.reviewCount} estimado{kpis.reviewCount === 1 ? '' : 's'}</p>
            </div>
            <label className="abonos-kpi block">
              <span className="abonos-kpi-label block">Responsable</span>
              <select
                value={reviewResponsible}
                onChange={(event) => setReviewResponsible(event.target.value)}
                className="abonos-select mt-2 h-11 w-full px-3 text-sm font-medium"
              >
                <option value="">Todos</option>
                {peopleOptions.map((responsible) => (
                  <option key={responsible} value={responsible}>{responsible}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="abonos-panel p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">Tareas de la revisión</h3>
                <span className="text-sm text-[var(--text-muted)]">{tasks.length} tarea{tasks.length === 1 ? '' : 's'}</span>
              </div>
              {tasks.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--text-secondary)]">Esta semana no tienes tareas.</p>
              ) : (
                <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                  {taskGroups.map((group) => {
                    const open = openTaskKind === group.kind;
                    return (
                      <button
                        key={group.kind}
                        type="button"
                        onClick={() => setOpenTaskKind(open ? null : group.kind)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition ${open ? 'bg-[#fafafa]' : 'bg-white hover:bg-[#fafafa]'}`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">{group.title}</span>
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{group.tasks.length} abono{group.tasks.length === 1 ? '' : 's'}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-sm font-semibold tabular-nums">{formatMoney(group.pending)}</span>
                          <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition ${open ? 'rotate-90' : ''}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {openTaskGroup && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-xs text-[var(--text-secondary)]">{openTaskGroup.hint}</p>
                    {openTaskGroup.bulkLabel && (
                      <div className="flex min-w-[240px] flex-1 flex-col gap-2 sm:max-w-sm sm:flex-row">
                        {openTaskGroup.kind !== 'fecha' && (
                          <input
                            value={claimNote}
                            onChange={(event) => setClaimNote(event.target.value)}
                            placeholder="Nota (opcional)"
                            className="abonos-search h-9 w-full px-3 text-sm"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => applyWeeklyTasks(openTaskGroup.tasks)}
                          className="h-9 shrink-0 rounded-lg bg-[var(--text-primary)] px-3 text-xs font-semibold text-white hover:bg-black"
                        >
                          {openTaskGroup.bulkLabel}
                        </button>
                      </div>
                    )}
                  </div>
                  {openTaskGroup.tasks.map((task) => (
                    <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
                      <button type="button" onClick={() => openEdit(task.row)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-medium">{taskName(task.row)}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {[task.row.brand, task.reason].filter(Boolean).join(' · ')}
                          {task.kind === 'cuadrar' && task.row.pending <= 0.009
                            ? ` · cobrado ${formatMoney(task.row.receivedTotal)}`
                            : ` · ${formatMoney(task.row.pending)}`}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(task.row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="abonos-panel p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">Cobros próximas 4 semanas</h3>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(cash.pending)}</span>
              </div>
              <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                {cash.weeks.map((week) => {
                  const open = openCashWeek === week.id && week.rows.length > 0;
                  return (
                    <div key={week.id}>
                      <button
                        type="button"
                        onClick={() => setOpenCashWeek(open ? null : week.id)}
                        disabled={week.rows.length === 0}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition ${open ? 'bg-[#fafafa]' : 'bg-white'} ${week.rows.length ? 'hover:bg-[#fafafa]' : 'cursor-default'}`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">{week.label.charAt(0) + week.label.slice(1).toLocaleLowerCase('es')}</span>
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{formatIsoDate(week.start)} – {formatIsoDate(week.end)} · {week.rows.length} abono{week.rows.length === 1 ? '' : 's'}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className={`text-sm font-semibold tabular-nums ${week.pending > 0.009 ? '' : 'text-[#c4c4c8]'}`}>{formatMoney(week.pending)}</span>
                          <ChevronRight className={`h-4 w-4 shrink-0 transition ${week.rows.length ? 'text-[var(--text-muted)]' : 'text-transparent'} ${open ? 'rotate-90' : ''}`} />
                        </span>
                      </button>
                      {open && (
                        <div className="divide-y divide-[var(--border)] bg-[#fafafa] px-4 pb-2">
                          {week.rows.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => openEdit(row)}
                              className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-[var(--text-primary)]"
                            >
                              <span className="min-w-0 truncate">{row.brand} · {row.concept || caseLabel(row)}</span>
                              <span className="shrink-0 tabular-nums">{formatMoney(row.pending)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {cash.brands.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cash.brands.map((brand) => (
                    <span key={brand.brand} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs">
                      <span className="font-semibold">{brand.brand}</span>
                      <span className="tabular-nums text-[var(--text-secondary)]">{formatMoney(brand.pending)}</span>
                    </span>
                  ))}
                </div>
              )}
              {cash.count === 0 && (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">En las próximas 4 semanas no hay fechas previstas con pendiente.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'seguimiento' && (
        <section className="space-y-6">
          <div className="abonos-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Buscar por concepto, marca, equipo, notas…"
                  className="abonos-search h-11 w-full pl-10 pr-3 text-sm"
                />
              </label>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(emptyFilters)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                  Limpiar filtros ({activeFilterCount})
                </button>
              )}
            </div>
            <div className="abonos-filters grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <FilterMultiSelect values={filters.brand} options={filterOptions.brands.options} includeBlank={filterOptions.brands.hasBlank} placeholder="Marca" onChange={(brand) => setFilters({ ...filters, brand })} />
              <FilterMultiSelect values={filters.type} options={filterOptions.types.options} includeBlank={filterOptions.types.hasBlank} placeholder="Tipo" onChange={(type) => setFilters({ ...filters, type })} />
              <FilterMultiSelect values={filters.status} options={filterOptions.statuses.options.map((value) => ({ value, label: statusLabel(value) }))} includeBlank={filterOptions.statuses.hasBlank} placeholder="Estado" onChange={(status) => setFilters({ ...filters, status })} />
              <FilterMultiSelect values={filters.duePeriod} options={filterOptions.periods} includeBlank={filterOptions.datesBlank} placeholder="Fecha prevista" collapseGroups onChange={(duePeriod) => setFilters({ ...filters, duePeriod })} />
              <FilterMultiSelect values={filters.responsible} options={filterOptions.responsibles.options} includeBlank={filterOptions.responsibles.hasBlank} placeholder="Responsable" onChange={(responsible) => setFilters({ ...filters, responsible })} />
              <FilterMultiSelect values={filters.area} options={filterOptions.areas.options} includeBlank={filterOptions.areas.hasBlank} placeholder="Área" onChange={(area) => setFilters({ ...filters, area })} />
              <FilterMultiSelect values={filters.teamMotivo} options={filterOptions.teams.options} includeBlank={filterOptions.teams.hasBlank} placeholder="Equipo" onChange={(teamMotivo) => setFilters({ ...filters, teamMotivo })} />
              <FilterMultiSelect values={filters.amountMode} options={filterOptions.modes.options.map((value) => ({ value, label: value === 'Variable' ? 'Estimado' : value }))} includeBlank={filterOptions.modes.hasBlank} placeholder="Cálculo" onChange={(amountMode) => setFilters({ ...filters, amountMode })} />
              <FilterMultiSelect values={filters.attachments} options={filterOptions.attachments.options} placeholder="Adjuntos" onChange={(attachments) => setFilters({ ...filters, attachments })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Abonos</p>
              <p className="abonos-kpi-value">{sorted.length}</p>
              <p className="abonos-kpi-hint">{activeFilterCount > 0 ? 'con los filtros aplicados' : 'en total'}</p>
            </div>
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Previsto</p>
              <p className="abonos-kpi-value">{formatMoney(listTotals.expected)}</p>
              <p className="abonos-kpi-hint">importe esperado</p>
            </div>
            <div className="abonos-kpi">
              <p className="abonos-kpi-label">Cobrado</p>
              <p className="abonos-kpi-value text-[var(--success)]">{formatMoney(listTotals.received)}</p>
              <div className="abonos-kpi-bar"><span style={{ width: `${listTotals.expected > 0 ? Math.min(100, Math.round((listTotals.received / listTotals.expected) * 100)) : 0}%` }} /></div>
              <p className="abonos-kpi-hint">{listTotals.expected > 0 ? `${Math.round((listTotals.received / listTotals.expected) * 100)} % de lo previsto` : '—'}</p>
            </div>
            <div className="abonos-kpi abonos-kpi-accent">
              <p className="abonos-kpi-label">Pendiente</p>
              <p className="abonos-kpi-value">{formatMoney(listTotals.pending)}</p>
              <p className="abonos-kpi-hint">por cobrar</p>
            </div>
          </div>

          <div className="abonos-panel overflow-auto">
            <table className="abonos-table border-collapse" style={{ tableLayout: 'fixed', width: '100%', minWidth: tableWidth }}>
              <colgroup>
                {columnOrder.map((key) => (
                  <col key={key} style={key === 'concept' ? undefined : { width: columnWidths[key] }} />
                ))}
                <col style={{ width: actionColWidth }} />
              </colgroup>
              <thead className="abonos-thead text-[var(--text-muted)]">
                <tr>
                  {columnOrder.map((key) => {
                    const col = COLUMN_BY_KEY[key];
                    return (
                      <th
                        key={key}
                        className={`abonos-th border-b border-[var(--border)] px-3 py-2.5 ${MONEY_COLS.has(key) ? 'abonos-th-money' : ''}`}
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
                        <div className={`flex min-w-0 items-center gap-1 pr-1.5 ${MONEY_COLS.has(key) ? 'justify-end' : 'justify-start'}`}>
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
                  <th className="abonos-th border-b border-[var(--border)] px-1 py-2.5">
                    <span className="sr-only">Eliminar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  return (
                  <tr key={row.id} onClick={() => openEdit(row)} className="cursor-pointer" title={row.notes.trim() || undefined}>
                    {columnOrder.map((key) => (
                      <td
                        key={key}
                        className={`border-b border-[var(--border)] px-3 py-3 ${MONEY_COLS.has(key) ? 'abonos-td-money' : ''} ${key === 'pending' && row.pending > 0.009 ? 'font-semibold' : ''}`}
                      >
                        <div className="abonos-cell">
                          {renderAbonoCell(row, key, null)}
                        </div>
                      </td>
                    ))}
                    <td className="border-b border-[var(--border)] px-1 py-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteCase(row.id);
                        }}
                        className="abonos-row-action inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        aria-label={`Eliminar abono #${row.registro}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No hay abonos con estos filtros.</p>}
          </div>
        </section>
      )}

      {tab === 'terms' && (
        <TradeArchiveView
          archive={state.archive ?? normalizeArchive(undefined)}
          onChange={(archive) => persist({ ...state, archive }, backend)}
        />
      )}

      {tab === 'importar' && (
        <AbonosImportPanel
          state={state}
          backend={backend}
          people={peopleOptions}
          onApply={async (next, message) => {
            await persist(next, backend);
            setNote(message);
            setTab('seguimiento');
          }}
        />
      )}

      {tab === 'exportar' && (
        <section className="mx-auto max-w-4xl">
          <div className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Qué quieres descargar</p>
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  { id: 'all', title: 'Todos los abonos', detail: `${computed.length} abonos` },
                  { id: 'view', title: 'Lo que tengo filtrado', detail: `${sorted.length} abonos según los filtros de la pestaña Abonos` },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setExportScope(option.id)}
                    className={`rounded-lg border p-4 text-left transition ${exportScope === option.id ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                  >
                    <p className="text-sm font-semibold">{option.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{option.detail}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Formato</p>
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  { id: false, title: 'Solo Excel', detail: 'Abonos y cobros. Se abre directamente.' },
                  { id: true, title: 'Excel + documentos (ZIP)', detail: `${exportScope === 'all' ? allDocCount : viewDocCount} justificante${(exportScope === 'all' ? allDocCount : viewDocCount) === 1 ? '' : 's'} en una carpeta, numerados por registro` },
                ] as const).map((option) => (
                  <button
                    key={String(option.id)}
                    type="button"
                    onClick={() => setExportWithDocs(option.id)}
                    className={`rounded-lg border p-4 text-left transition ${exportWithDocs === option.id ? 'border-[var(--text-primary)] ring-1 ring-[var(--text-primary)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                  >
                    <p className="text-sm font-semibold">{option.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{option.detail}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-sm text-[var(--text-secondary)]">
                {exportRows.length} abono{exportRows.length === 1 ? '' : 's'}
                {exportWithDocs ? ` · ${exportDocCount} documento${exportDocCount === 1 ? '' : 's'}` : ''}
                {' · '}{exportWithDocs ? `Abonos_${todayIso()}.zip` : `Abonos_${todayIso()}.xlsx`}
              </p>
              <button
                type="button"
                onClick={() => exportWorkbook(exportRows, exportWithDocs)}
                disabled={exportRows.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--text-primary)] px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Descargar
              </button>
            </div>
          </div>
        </section>
      )}

      {panelOpen && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div
            className="abonos-modal flex max-h-[calc(100vh-48px)] flex-col"
            style={{ width: 'min(1080px, 100%)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="abonos-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  {editing ? `Abono #${editing.registro}` : 'Nuevo abono'}
                </p>
                <p id="abonos-modal-title" className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight">
                  {form.concept?.trim()
                    || (editing ? caseLabel({ brand: form.brand || editing.brand, area: form.area || editing.area, teamMotivo: form.teamMotivo || editing.teamMotivo }) : 'Sin concepto todavía')}
                </p>
                {currentComputed && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill row={{ ...currentComputed, status: (form.status || currentComputed.status) as AbonoComputed['status'] }} />
                  </div>
                )}
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <div className="grid gap-5 px-6 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <section className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Concepto</span>
                    <input
                      value={form.concept || ''}
                      onChange={(event) => setForm({ ...form, concept: event.target.value })}
                      placeholder="Texto corto que se ve en la tabla"
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CatalogField
                      label="Marca"
                      value={form.brand || ''}
                      options={state.catalogs.brands}
                      required
                      onChange={(brand) => setForm({ ...form, brand })}
                      onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'brand', value) }, backend)}
                    />
                    <CatalogField label="Tipo" value={form.type || ''} options={state.catalogs.types} required onChange={(type) => setForm({ ...form, type })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'type', value) }, backend)} />
                    <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                    <CatalogField label="Equipo" value={form.teamMotivo || ''} options={state.catalogs.teams} allowFree required onChange={(teamMotivo) => setForm({ ...form, teamMotivo })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'team', value) }, backend)} />
                    <label className="block space-y-1">
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
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Importe *</span>
                      <select
                        value={form.amountMode || ''}
                        onChange={(event) => {
                          const amountMode = event.target.value as AbonoAmountMode | '';
                          setForm({ ...form, amountMode, estimated: amountMode === 'Variable' });
                        }}
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                      >
                        <option value="">—</option>
                        <option value="Fijo">Fijo</option>
                        <option value="Variable">Estimado (puede moverse)</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha prevista *</span>
                      <input
                        type="date"
                        value={form.dueDate || ''}
                        onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                        className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Responsable *</span>
                      <select value={form.responsible || ''} onChange={(event) => setForm({ ...form, responsible: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                        <option value="">—</option>
                        {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Añadido por</span>
                      <select value={form.addedBy || ''} onChange={(event) => setForm({ ...form, addedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                        <option value="">—</option>
                        {peopleOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Notas</span>
                    <textarea
                      value={form.notes || ''}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={3}
                      placeholder="Detalle, condición del importe, con quién lo hablaste…"
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </section>

                <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 lg:self-start">
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-3">
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{form.amountMode === 'Variable' ? 'Previsto (est.)' : 'Previsto'}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(form.expectedAmount ?? currentComputed?.expectedAmount ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Cobrado</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--success)]">{formatMoney(currentComputed?.receivedTotal ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Pendiente</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(currentComputed?.pending ?? Math.max(0, (form.expectedAmount ?? 0)))}</p>
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado *</span>
                    <select
                      value={form.status || ''}
                      onChange={(event) => {
                        const status = event.target.value as AbonoStatus | '';
                        const estimated = status === 'A cuenta' ? true : form.amountMode === 'Variable';
                        const amountMode = status === 'A cuenta' ? 'Variable' : form.amountMode;
                        setForm({ ...form, status, estimated, amountMode });
                        if (!editing || !state) return;
                        const received = receiptsForCase(state.receipts, editing.id).reduce((sum, item) => sum + item.amount, 0);
                        const nextStatus = resolveManualStatus(
                          status,
                          parseMoney(expectedAmountText) ?? editing.expectedAmount,
                          received,
                          estimated === true,
                        );
                        const cases = state.cases.map((row) => (
                          row.id === editing.id ? { ...row, status: nextStatus, estimated: estimated === true, amountMode: amountMode || row.amountMode } : row
                        ));
                        setEditing({ ...editing, status: nextStatus, estimated: estimated === true, amountMode: amountMode || editing.amountMode });
                        setForm((current) => ({ ...current, status: nextStatus }));
                        setPanelNote(nextStatus !== status ? `Estado guardado como ${statusLabel(nextStatus)} por los cobros registrados.` : 'Estado guardado.');
                        void persist({ ...state, cases }, backend);
                      }}
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    >
                      <option value="">—</option>
                      {MANUAL_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      {form.status && !MANUAL_STATUSES.includes(form.status as AbonoStatus) && (
                        <option value={form.status} disabled>{statusLabel(form.status)} (sale de los cobros)</option>
                      )}
                    </select>
                    <p className="text-[11px] text-[var(--text-muted)]">Parcial y Exceso salen solos al registrar los cobros. A cuenta lo pones tú cuando está pagado pero falta cerrar el importe.</p>
                  </label>

                  {form.status === 'Pago comunicado' && (
                    <label className="block space-y-1">
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

                  {editing ? (
                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">Cobros</p>
                      {caseReceipts.length === 0 && <p className="text-xs text-[var(--text-muted)]">Todavía no ha entrado nada.</p>}
                      {caseReceipts.map((receipt, index) => (
                        <div key={receipt.id} className="flex items-start justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium">{paymentLabel(index)} · {formatIsoDate(receipt.receivedAt)} · {formatMoney(receipt.amount)}</p>
                            {(receipt.reference || receipt.comment) && <p className="text-xs text-[var(--text-secondary)]">{receipt.reference || receipt.comment}</p>}
                          </div>
                          <button type="button" onClick={() => deleteReceipt(receipt.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)]" aria-label="Eliminar pago">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                        <input type="date" value={receiptDraft.receivedAt} onChange={(event) => setReceiptDraft({ ...receiptDraft, receivedAt: event.target.value })} className="h-9 min-w-0 rounded-md border border-[var(--border)] bg-white px-2 text-sm" aria-label="Fecha del cobro" />
                        <input inputMode="decimal" value={receiptDraft.amount} onChange={(event) => setReceiptDraft({ ...receiptDraft, amount: event.target.value })} placeholder="Importe" className="h-9 min-w-0 rounded-md border border-[var(--border)] bg-white px-2 text-right font-mono text-sm" aria-label="Importe del cobro" />
                        <button type="button" onClick={addReceipt} className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-sm font-semibold text-white hover:bg-black">Registrar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">Los cobros se registran una vez guardado el abono.</p>
                  )}
                  <div className="space-y-1 border-t border-[var(--border)] pt-3">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Documentos</span>
                    <p className="text-[11px] text-[var(--text-muted)]">Imagen, PDF o Excel. Pega una captura con Ctrl+V.</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(form.attachments || []).map((item) => (
                        <div key={item.id} className="relative">
                          <button
                            type="button"
                            onClick={() => openAttachment(item, setViewerImage)}
                            className="flex h-16 w-24 flex-col items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-white px-1 text-center"
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
                          className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
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
                </section>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--border)] px-6 py-3">
              <button
                type="button"
                onClick={saveForm}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Guardar
              </button>
              {editing && (
                <button type="button" onClick={() => deleteCase(editing.id)} className="rounded-md px-3 py-2 text-sm text-[var(--danger)]">Eliminar</button>
              )}
              {panelNote && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--success)]" role="status">
                  <Check className="h-4 w-4 shrink-0" />
                  {panelNote}
                </span>
              )}
              {error && <span className="text-sm text-[var(--danger)]">{error}</span>}
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

function FilterMultiSelect({
  values,
  options,
  placeholder,
  onChange,
  includeBlank,
  collapseGroups,
}: {
  values: string[];
  options: Array<string | FilterOption>;
  placeholder: string;
  onChange: (values: string[]) => void;
  includeBlank?: boolean;
  collapseGroups?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const items: FilterOption[] = [
    ...(includeBlank ? [{ value: BLANK, label: '—' }] : []),
    ...options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option)),
  ];
  const allValues = items.map((item) => item.value);
  const allSelected = allValues.length > 0 && allValues.every((value) => values.includes(value));
  const groups = Array.from(new Set(items.map((item) => item.group).filter((group): group is string => Boolean(group))));
  const ungrouped = items.filter((item) => !item.group);
  const selected = new Set(values);
  const compact: string[] = [];
  ungrouped.forEach((item) => {
    if (selected.has(item.value)) compact.push(item.label);
  });
  groups.forEach((group) => {
    const grouped = items.filter((item) => item.group === group);
    const picked = grouped.filter((item) => selected.has(item.value));
    if (picked.length === 0) return;
    if (picked.length === grouped.length) compact.push(group);
    else compact.push(...picked.map((item) => `${item.label} ${group}`));
  });
  const label = values.length === 0 ? placeholder : compact.join(', ') || values.map((value) => (value === BLANK ? '—' : value)).join(', ');
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  const toggleMany = (next: string[]) => {
    const every = next.length > 0 && next.every((value) => selected.has(value));
    if (every) onChange(values.filter((value) => !next.includes(value)));
    else onChange(Array.from(new Set([...values, ...next])));
  };
  const toggleGroupOpen = (group: string) => {
    setOpenGroups((current) => (current.includes(group) ? current.filter((item) => item !== group) : [...current, group]));
  };
  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) {
            setOpenGroups(groups.filter((group) => items.some((item) => item.group === group && selected.has(item.value))));
          }
        }}
        className={`abonos-select flex h-11 w-full items-center justify-between gap-2 px-3.5 text-left text-sm ${values.length ? 'is-set' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 truncate ${values.length ? '' : 'text-[var(--text-muted)]'}`}>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-[13rem] overflow-auto rounded-md border border-[var(--border)] bg-white py-1 shadow-md">
          {items.length === 0 && (
            <p className="px-3 py-2 text-sm text-[var(--text-muted)]">Sin opciones en la tabla</p>
          )}
          {items.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-soft)]">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = values.length > 0 && !allSelected;
                }}
                onChange={() => onChange(allSelected ? [] : allValues)}
                className="accent-[var(--text-primary)]"
              />
              <span>Seleccionar todo</span>
            </label>
          )}
          {ungrouped.map((item) => (
            <label key={item.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--bg-soft)]">
              <input
                type="checkbox"
                checked={values.includes(item.value)}
                onChange={() => toggle(item.value)}
                className="accent-[var(--text-primary)]"
              />
              <span>{item.label}</span>
            </label>
          ))}
          {groups.map((group) => {
            const grouped = items.filter((item) => item.group === group);
            const groupValues = grouped.map((item) => item.value);
            const groupSelected = groupValues.length > 0 && groupValues.every((value) => values.includes(value));
            const groupPartial = !groupSelected && groupValues.some((value) => values.includes(value));
            const expanded = !collapseGroups || openGroups.includes(group);
            return (
              <div key={group}>
                <div className="flex items-center hover:bg-[var(--bg-soft)]">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = groupPartial;
                      }}
                      onChange={() => toggleMany(groupValues)}
                      className="accent-[var(--text-primary)]"
                    />
                    <span>{group}</span>
                  </label>
                  {collapseGroups && (
                    <button
                      type="button"
                      onClick={() => toggleGroupOpen(group)}
                      className="px-2 py-1.5 text-[var(--text-muted)]"
                      aria-label={expanded ? `Ocultar meses de ${group}` : `Ver meses de ${group}`}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                  )}
                </div>
                {expanded && grouped.map((item) => (
                  <label key={item.value} className="flex cursor-pointer items-center gap-2 py-1.5 pl-8 pr-3 text-sm hover:bg-[var(--bg-soft)]">
                    <input
                      type="checkbox"
                      checked={values.includes(item.value)}
                      onChange={() => toggle(item.value)}
                      className="accent-[var(--text-primary)]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  Pendiente: 'abonos-chip-neutral',
  'Pago comunicado': 'abonos-chip-violet',
  'A cuenta': 'abonos-chip-account',
  Liquidado: 'abonos-chip-success',
  'Liquidado parcialmente': 'abonos-chip-partial',
  Exceso: 'abonos-chip-excess',
};

function StatusPill({ row }: { row: AbonoComputed }) {
  if (!row.status) return <span className="text-sm text-[var(--text-muted)]">—</span>;
  const overdue = row.overdueDays !== null && !isClosedStatus(row.status);
  const detail = row.status === 'Exceso' && row.excessAmount > 0.009
    ? `Exceso de ${formatMoney(row.excessAmount)}`
    : row.status === 'Liquidado parcialmente' && row.pending > 0.009
      ? `Faltan ${formatMoney(row.pending)}`
      : '';
  const mismatch = row.status === 'Pago comunicado'
    && row.communicatedAmount !== null
    && Math.abs(row.communicatedAmount - row.pending) > 0.009;
  if (overdue) {
    return (
      <span className="abonos-chip abonos-chip-overdue" title={`Vencido hace ${row.overdueDays} días · ${statusLabel(row.status)}${detail ? ` · ${detail}` : ''}`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Vencido · {row.overdueDays} d
      </span>
    );
  }
  const label = row.status === 'Exceso' && row.excessAmount > 0.009 ? `Exceso +${formatMoney(row.excessAmount)}` : statusLabel(row.status);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={`abonos-chip ${STATUS_TONES[row.status] || 'abonos-chip-neutral'}`} title={detail || statusLabel(row.status)}>
        <span className="abonos-chip-dot" />
        {label}
      </span>
      {mismatch && <span className="abonos-chip abonos-chip-partial" title="El importe comunicado no cuadra con lo pendiente">No cuadra</span>}
    </span>
  );
}

function AlertChip({ alert }: { alert: AbonoAlert | null }) {
  if (!alert) return null;
  const Icon = alert.level === 'danger' ? AlertTriangle : Clock;
  return (
    <span className={`abonos-chip ${alert.level === 'danger' ? 'abonos-chip-alert-danger' : 'abonos-chip-alert-warning'}`} title={alert.reasons.join('\n')}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{alert.label}</span>
    </span>
  );
}
