'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import TradeArchiveView from '@/components/TradeArchiveView';
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
import {
  abonosTemplateRows,
  ABONOS_TEMPLATE_INSTRUCTIONS,
  applyImportRows,
  applyReceiptRows,
  parseReceiptsSheet,
  buildImportPreview,
  detectAbonosHeaderRow,
  guessColumnMap,
  importPreviewError,
  IMPORT_COLUMN_LABELS,
  summarizeImportRow,
  type ImportRowKind,
  type ImportColumnMap,
  type ImportPreviewRow,
} from '@/lib/abonos-excel';
import { documentLabelsByCase, documentsForExport, zipStored } from '@/lib/abonos-export-pack';
import { buildAbonosWorkbook } from '@/lib/abonos-export-xlsx';
import { addCatalogValue, loadAbonosState, saveAbonosState, type AbonosBackend } from '@/lib/abonos-store';
import { AlertTriangle, Check, ChevronDown, Clock, ChevronRight, Download, FileSpreadsheet, FileText, GripVertical, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

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

const COLUMN_DEFS: Array<{ key: SortKey; label: string; width: number }> = [
  { key: 'dueDate', label: 'Cuándo', width: 104 },
  { key: 'brand', label: 'Marca', width: 96 },
  { key: 'concept', label: 'Concepto', width: 220 },
  { key: 'pending', label: 'Pendiente', width: 118 },
  { key: 'status', label: 'Estado', width: 150 },
  { key: 'expectedAmount', label: 'Previsto', width: 118 },
  { key: 'receivedTotal', label: 'Cobrado', width: 118 },
  { key: 'type', label: 'Tipo', width: 112 },
  { key: 'area', label: 'Área', width: 104 },
  { key: 'teamMotivo', label: 'Equipo', width: 140 },
  { key: 'amountMode', label: 'Cálculo', width: 108 },
  { key: 'attachments', label: 'Adjuntos', width: 112 },
  { key: 'responsible', label: 'Responsable', width: 136 },
];

const COL_STORAGE = 'ts-abonos-cols-v13';
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

function ConceptCell({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [title, setTitle] = useState<string | undefined>();
  const label = text.trim();
  useEffect(() => {
    const node = ref.current;
    if (!node || !label) {
      setTitle(undefined);
      return;
    }
    setTitle(node.scrollWidth > node.clientWidth + 1 ? label : undefined);
  }, [label]);
  return (
    <span ref={ref} className="block truncate" title={title}>
      {label || '—'}
    </span>
  );
}

function renderAbonoCell(row: AbonoComputed, key: SortKey, alert: AbonoAlert | null) {
  switch (key) {
    case 'alert':
      return <AlertChip alert={alert} />;
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
    case 'amountMode':
      return row.amountModeResolved;
    case 'receivedTotal':
      return formatMoney(row.receivedTotal);
    case 'pending':
      return formatMoney(row.pending);
    case 'status':
      return <StatusPill row={row} />;
    case 'concept':
      return <ConceptCell text={row.concept} />;
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
  const [importHeaders, setImportHeaders] = useState<unknown[]>([]);
  const [importRows, setImportRows] = useState<unknown[][]>([]);
  const [importMap, setImportMap] = useState<ImportColumnMap | null>(null);
  const [importReceipts, setImportReceipts] = useState<ReturnType<typeof parseReceiptsSheet>>([]);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [importFileName, setImportFileName] = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'view'>('all');
  const [exportWithDocs, setExportWithDocs] = useState(false);
  const [bulkArea, setBulkArea] = useState('Grassroots');
  const [openTaskKind, setOpenTaskKind] = useState<WeeklyTaskKind | null>(null);
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
    const today = todayIso();
    const forKey = (except: keyof AbonoFilters) => computed.filter((row) => rowMatchesFilters(row, filters, today, except));
    const brands = uniquePresent(forKey('brand').map((row) => row.brand));
    const types = uniquePresent(forKey('type').map((row) => row.type));
    const areas = uniquePresent(forKey('area').map((row) => row.area));
    const teams = uniquePresent(forKey('teamMotivo').map((row) => row.teamMotivo));
    const statuses = uniquePresent(forKey('status').map((row) => row.status));
    const responsibles = uniquePresent(forKey('responsible').map((row) => shortPersonName(row.responsible)));
    const modes = uniquePresent(forKey('amountMode').map((row) => row.amountModeResolved));
    const origins = uniquePresent(forKey('origin').map((row) => row.origin));
    const attachments = uniquePresent(forKey('attachments').map((row) => ((row.attachments || []).length > 0 ? 'Sí' : 'No')));
    const dateRows = forKey('duePeriod');
    const { periods, datesBlank } = duePeriodOptions(dateRows, today);
    const quickRows = forKey('quick');
    const quickCounts = Object.fromEntries(QUICK_FILTERS.map((item) => [item.id, quickRows.filter((row) => matchesQuick(row, item.id, today)).length])) as Record<Exclude<QuickFilter, ''>, number>;
    return { brands, types, areas, teams, statuses, responsibles, modes, origins, attachments, periods, datesBlank, quickCounts };
  }, [computed, filters]);

  useEffect(() => {
    setFilters((current) => {
      const next = { ...current };
      let changed = false;
      const prune = (key: Exclude<keyof AbonoFilters, 'search' | 'duePeriod' | 'quick'>, present: { options: string[]; hasBlank?: boolean }) => {
        const kept = current[key].filter((value) => (value === BLANK ? Boolean(present.hasBlank) : present.options.includes(value)));
        if (kept.length !== current[key].length) {
          next[key] = kept;
          changed = true;
        }
      };
      prune('brand', filterOptions.brands);
      prune('type', filterOptions.types);
      prune('area', filterOptions.areas);
      prune('teamMotivo', filterOptions.teams);
      prune('responsible', filterOptions.responsibles);
      prune('status', filterOptions.statuses);
      prune('amountMode', filterOptions.modes);
      prune('origin', filterOptions.origins);
      prune('attachments', { options: filterOptions.attachments.options, hasBlank: false });
      const dueValues = filterOptions.periods.map((period) => period.value);
      const duePeriod = current.duePeriod.filter((value) => (value === BLANK ? filterOptions.datesBlank : dueValues.includes(value)));
      if (duePeriod.length !== current.duePeriod.length) {
        next.duePeriod = duePeriod;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [filterOptions]);

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

  const markExisting = (rows: ImportPreviewRow[]) => {
    const registros = new Set(state.cases.map((item) => item.registro));
    return rows.map((row) => ({
      ...row,
      existing: row.registro !== null && registros.has(row.registro),
    }));
  };

  const clearImport = () => {
    setImportMap(null);
    setImportReceipts([]);
    setImportRows([]);
    setImportHeaders([]);
    setPreview([]);
    setImportFileName('');
    setShowMapping(false);
    setShowUnchanged(false);
  };

  const handleImportFile = (rows: unknown[][], fileName = '') => {
    setImportFileName(fileName);
    const index = detectAbonosHeaderRow(rows);
    const header = rows[index] || [];
    const map = guessColumnMap(header);
    setHeaderIndex(index);
    setImportHeaders(header);
    setImportRows(rows);
    setImportMap(map);
    setPreview(markExisting(buildImportPreview(rows, map, index)));
    setTab('importar');
  };

  const applyImport = async () => {
    if (!importMap) return;
    const result = applyImportRows(preview, state, importMap);
    const receiptResult = applyReceiptRows(result.cases, result.receipts, importReceipts);
    const receiptChanges = receiptResult.updated + receiptResult.added;
    if (result.updated === 0 && result.created === 0 && receiptChanges === 0) {
      setNote('No hay cambios para importar.');
      return;
    }
    await persist({
      ...state,
      cases: result.cases,
      receipts: receiptResult.receipts,
    }, backend);
    const parts = [
      importCounts.cambia ? `${importCounts.cambia} actualizados` : '',
      result.created ? `${result.created} nuevos` : '',
      receiptResult.updated ? `${receiptResult.updated} pagos con referencia actualizada` : '',
      receiptResult.added ? `${receiptResult.added} pagos nuevos` : '',
    ].filter(Boolean);
    clearImport();
    setNote(parts.length
      ? `Importación hecha: ${parts.join(', ')}. Los documentos adjuntos se mantienen.`
      : 'Importación hecha. Los datos ya estaban al día.');
    setTab('seguimiento');
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

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(abonosTemplateRows()), 'Abonos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(ABONOS_TEMPLATE_INSTRUCTIONS), 'Instrucciones');
    XLSX.writeFile(workbook, 'Plantilla_abonos.xlsx');
  };

  const casesByRegistro = new Map(state.cases.map((item) => [item.registro, item]));
  const importItems = importMap
    ? preview.map((row, index) => ({
      row,
      index,
      ...summarizeImportRow(row, row.registro !== null ? casesByRegistro.get(row.registro) : undefined, importMap),
    }))
    : [];
  const importCounts = importItems.reduce(
    (acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }),
    { error: 0, nuevo: 0, cambia: 0, igual: 0 } as Record<ImportRowKind, number>,
  );
  const importable = importCounts.nuevo + importCounts.cambia;
  const errorsWithoutArea = importItems.some((item) => item.kind === 'error' && !item.row.area);
  const mappedColumns = importMap ? Object.values(importMap).filter((value) => value !== null).length : 0;
  const totalColumns = importMap ? Object.keys(importMap).length : 0;
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
                {peopleOptions.map((responsible) => (
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
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Marca</th>
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
            <FilterMultiSelect values={filters.brand} options={filterOptions.brands.options} includeBlank={filterOptions.brands.hasBlank} placeholder="Marca" onChange={(brand) => setFilters({ ...filters, brand })} />
            <FilterMultiSelect values={filters.type} options={filterOptions.types.options} includeBlank={filterOptions.types.hasBlank} placeholder="Tipo" onChange={(type) => setFilters({ ...filters, type })} />
            <FilterMultiSelect values={filters.area} options={filterOptions.areas.options} includeBlank={filterOptions.areas.hasBlank} placeholder="Área" onChange={(area) => setFilters({ ...filters, area })} />
            <FilterMultiSelect values={filters.teamMotivo} options={filterOptions.teams.options} includeBlank={filterOptions.teams.hasBlank} placeholder="Equipo" onChange={(teamMotivo) => setFilters({ ...filters, teamMotivo })} />
            <FilterMultiSelect values={filters.status} options={filterOptions.statuses.options.map((value) => ({ value, label: statusLabel(value) }))} includeBlank={filterOptions.statuses.hasBlank} placeholder="Estado" onChange={(status) => setFilters({ ...filters, status })} />
            <FilterMultiSelect values={filters.duePeriod} options={filterOptions.periods} includeBlank={filterOptions.datesBlank} placeholder="Fecha prevista" collapseGroups onChange={(duePeriod) => setFilters({ ...filters, duePeriod })} />
            <FilterMultiSelect values={filters.amountMode} options={filterOptions.modes.options} includeBlank={filterOptions.modes.hasBlank} placeholder="Cálculo" onChange={(amountMode) => setFilters({ ...filters, amountMode })} />
            <FilterMultiSelect values={filters.attachments} options={filterOptions.attachments.options} placeholder="Adjuntos" onChange={(attachments) => setFilters({ ...filters, attachments })} />
            <FilterMultiSelect values={filters.responsible} options={filterOptions.responsibles.options} includeBlank={filterOptions.responsibles.hasBlank} placeholder="Responsable" onChange={(responsible) => setFilters({ ...filters, responsible })} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_FILTERS.map((item) => {
              const active = filters.quick === item.id;
              const count = filterOptions.quickCounts[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilters({ ...filters, quick: active ? '' : item.id })}
                  className={`abonos-quick abonos-quick-${item.tone} ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                >
                  <span className="abonos-quick-dot" />
                  {item.label}
                  <span className="abonos-quick-count">{count}</span>
                </button>
              );
            })}
            {filters.quick && (
              <button type="button" onClick={() => setFilters({ ...filters, quick: '' })} className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Quitar filtro
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Abonos</p>
              <p className="mt-0.5 text-sm font-semibold">{sorted.length}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Previsto</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(listTotals.expected)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Cobrado</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--success)]">{formatMoney(listTotals.received)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-secondary)]">Pendiente</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(listTotals.pending)}</p>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="abonos-table border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
              <colgroup>
                {columnOrder.map((key) => (
                  <col key={key} style={{ width: columnWidths[key] }} />
                ))}
                <col style={{ width: actionColWidth }} />
              </colgroup>
              <thead className="bg-[var(--bg-card)] text-[var(--text-muted)]">
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
                        <div className={`abonos-cell ${key === 'concept' ? 'abonos-cell-clip' : ''}`}>
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
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
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
        <section className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <ol className="flex items-center gap-2 text-sm">
                {[
                  { n: 1, label: 'Subir', done: Boolean(importMap) },
                  { n: 2, label: 'Revisar', done: false, active: Boolean(importMap) },
                  { n: 3, label: 'Importar', done: false },
                ].map((step, i) => (
                  <li key={step.n} className="flex items-center gap-2">
                    {i > 0 && <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${step.done ? 'bg-[var(--success-soft)] text-[var(--success)]' : (step.active || (!importMap && step.n === 1)) ? 'bg-[var(--text-primary)] text-white' : 'bg-[var(--bg-soft)] text-[var(--text-muted)]'}`}>
                      {step.done ? <Check className="h-3.5 w-3.5" /> : step.n}
                    </span>
                    <span className={(step.active || (!importMap && step.n === 1)) ? 'font-semibold' : 'text-[var(--text-secondary)]'}>{step.label}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
            </div>

            {!importMap ? (
              <FileUpload
                inputId="abonos-import"
                label="Sube el Excel de abonos"
                hint="Sirve la plantilla o un Excel exportado desde aquí. Si el registro ya existe, se actualiza; si no, se crea. Los documentos no se tocan."
                onFileLoaded={(rows, fileName) => handleImportFile(rows, fileName)}
                onWorkbookLoaded={(sheets) => {
                  const name = Object.keys(sheets).find((sheet) => sheet.trim().toLocaleLowerCase('es') === 'recepciones');
                  setImportReceipts(name ? parseReceiptsSheet(sheets[name]) : []);
                }}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2.5 text-sm">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-[var(--success)]" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{importFileName || 'Excel'}</span>
                    <span className="text-[var(--text-secondary)]">
                      {' · '}{preview.length} fila{preview.length === 1 ? '' : 's'}
                      {importReceipts.length ? ` · ${importReceipts.length} cobro${importReceipts.length === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                  <button type="button" onClick={clearImport} className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Cambiar archivo
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  {importCounts.nuevo > 0 && <span className="rounded-md bg-[var(--success-soft)] px-2.5 py-1 font-medium text-[var(--success)]">{importCounts.nuevo} nuevo{importCounts.nuevo === 1 ? '' : 's'}</span>}
                  {importCounts.cambia > 0 && <span className="rounded-md bg-[var(--accent-soft)] px-2.5 py-1 font-medium text-[var(--accent)]">{importCounts.cambia} se actualiza{importCounts.cambia === 1 ? '' : 'n'}</span>}
                  {importCounts.igual > 0 && <span className="rounded-md bg-[var(--bg-soft)] px-2.5 py-1 text-[var(--text-secondary)]">{importCounts.igual} sin cambios</span>}
                  {importCounts.error > 0 && <span className="rounded-md bg-[var(--danger-soft)] px-2.5 py-1 font-medium text-[var(--danger)]">{importCounts.error} con errores</span>}
                </div>

                {importCounts.error > 0 && (
                  <div className="rounded-md border border-red-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-[var(--danger-soft)] px-3 py-2">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--danger)]">
                        <AlertTriangle className="h-4 w-4" />
                        No se importan. Corrígelos en el Excel y vuelve a subirlo.
                      </p>
                      {errorsWithoutArea && (
                        <div className="flex items-center gap-1.5">
                          <select value={bulkArea} onChange={(event) => setBulkArea(event.target.value)} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-xs">
                            {state.catalogs.areas.map((area) => <option key={area} value={area}>{area}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => setPreview(preview.map((row) => {
                              const next = row.area ? row : { ...row, area: bulkArea };
                              return { ...next, error: importPreviewError(next) };
                            }))}
                            className="h-8 rounded-md border border-[var(--border)] bg-white px-2.5 text-xs font-medium"
                          >
                            Poner área a las que no tienen
                          </button>
                        </div>
                      )}
                    </div>
                    <ul className="divide-y divide-[var(--border)] text-sm">
                      {importItems.filter((item) => item.kind === 'error').map(({ row }) => (
                        <li key={row.key} className="flex items-start justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="font-mono text-xs text-[var(--text-muted)]">{row.registro ? `#${row.registro}` : 'Nueva'}</span>{' '}
                            {[row.brand, row.teamMotivo].filter(Boolean).join(' · ') || 'Sin marca'}
                            {row.comment ? <span className="text-[var(--text-secondary)]"> · {row.comment}</span> : null}
                          </span>
                          <span className="shrink-0 text-right text-[var(--danger)]">{row.error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(importCounts.nuevo > 0 || importCounts.cambia > 0) && (
                  <ul className="max-h-[420px] divide-y divide-[var(--border)] overflow-auto rounded-md border border-[var(--border)] text-sm">
                    {importItems.filter((item) => item.kind === 'nuevo').map(({ row }) => (
                      <li key={row.key} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="mr-1.5 rounded bg-[var(--success-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--success)]">Nuevo</span>
                          {[row.brand, row.teamMotivo].filter(Boolean).join(' · ')}
                          {row.comment ? <span className="text-[var(--text-secondary)]"> · {row.comment}</span> : null}
                        </span>
                        <span className="shrink-0 font-mono text-xs">{formatMoney(row.expectedAmount)}</span>
                      </li>
                    ))}
                    {importItems.filter((item) => item.kind === 'cambia').map(({ row, changes }) => (
                      <li key={row.key} className="px-3 py-2">
                        <p>
                          <span className="font-mono text-xs text-[var(--text-muted)]">#{row.registro}</span>{' '}
                          {[row.brand, row.teamMotivo].filter(Boolean).join(' · ')}
                        </p>
                        <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
                          {changes.map((change) => <li key={change}>{change}</li>)}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                {importCounts.igual > 0 && (
                  <div>
                    <button type="button" onClick={() => setShowUnchanged(!showUnchanged)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      {showUnchanged ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Ver los {importCounts.igual} sin cambios
                    </button>
                    {showUnchanged && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {importItems.filter((item) => item.kind === 'igual').map(({ row }) => `#${row.registro}`).join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <button type="button" onClick={() => setShowMapping(!showMapping)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    {showMapping ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Columnas reconocidas {mappedColumns}/{totalColumns} · Ajustar
                  </button>
                  {showMapping && importMap && (
                    <div className="mt-2 grid gap-2 rounded-md bg-[var(--bg-soft)] p-3 md:grid-cols-3">
                      {(Object.keys(importMap) as Array<keyof typeof importMap>).map((key) => (
                        <label key={key} className="space-y-1 text-xs">
                          <span className="text-[var(--text-secondary)]">{IMPORT_COLUMN_LABELS[key]}</span>
                          <select
                            value={importMap[key] ?? ''}
                            onChange={(event) => {
                              const next = { ...importMap, [key]: event.target.value === '' ? null : Number(event.target.value) };
                              setImportMap(next);
                              setPreview(markExisting(buildImportPreview(importRows, next, headerIndex)));
                            }}
                            className="h-8 w-full rounded-md border border-[var(--border)] bg-white px-2"
                          >
                            <option value="">No usar</option>
                            {importHeaders.map((header, index) => (
                              <option key={`${String(header)}-${index}`} value={index}>{String(header || `Columna ${index + 1}`)}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
                  <button type="button" onClick={clearImport} className="h-10 rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={applyImport}
                    disabled={importable === 0 && importReceipts.length === 0}
                    className="h-10 rounded-md bg-[var(--text-primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importable > 0
                      ? `Importar ${importable} abono${importable === 1 ? '' : 's'}`
                      : importReceipts.length ? 'Importar cobros' : 'Nada que importar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
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
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
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
                    <AlertChip alert={abonoAlert(currentComputed)} />
                    <StatusPill row={{ ...currentComputed, status: (form.status || currentComputed.status) as AbonoComputed['status'] }} />
                  </div>
                )}
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <section className="space-y-4">
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
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Notas</span>
                    <textarea
                      value={form.notes || ''}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={4}
                      placeholder="Detalle, condición del importe, con quién lo hablaste…"
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Documentos</span>
                    <p className="text-[11px] text-[var(--text-muted)]">Imagen, PDF o Excel. Hasta {MAX_EVIDENCE}. Pega una captura con Ctrl+V.</p>
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
                </section>

                <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 lg:self-start">
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
  const label = values.length === 0 ? placeholder : allSelected ? 'Todos' : compact.join(', ');
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
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-left text-sm"
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
  if (!row.status) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  const extra = row.status === 'Exceso' && row.excessAmount > 0.009
    ? ` +${formatMoney(row.excessAmount)}`
    : row.status === 'Liquidado parcialmente' && row.pending > 0.009
      ? ` · faltan ${formatMoney(row.pending)}`
      : '';
  return (
    <span className={`abonos-chip ${STATUS_TONES[row.status] || 'abonos-chip-neutral'}`} title={`${statusLabel(row.status)}${extra}`}>
      <span className="abonos-chip-dot" />
      <span className="truncate">{statusLabel(row.status)}{extra}</span>
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
