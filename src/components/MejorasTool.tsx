'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  DEFAULT_NEW_AUTHOR,
  MEJORA_CHANNELS,
  MEJORA_MODULES,
  MEJORA_STATUSES,
  displayDash,
  formatIsoDate,
  formatRequiredGaps,
  mejoraRequiredGaps,
  mejorasKpis,
  mergeCatalog,
  nextRegistro,
  todayIso,
  type MejoraAttachment,
  type MejoraCase,
  type MejoraChannel,
  type MejoraModule,
  type MejoraStatus,
  type MejorasState,
} from '@/lib/mejoras-model';
import {
  buildImportPreview,
  detectMejorasHeaderRow,
  guessColumnMap,
  mejorasExportRows,
  mejorasTemplateRows,
  previewToRecords,
  type ImportColumnMap,
  type ImportPreviewRow,
} from '@/lib/mejoras-excel';
import { addCatalogValue, loadMejorasState, saveMejorasState, type MejorasBackend } from '@/lib/mejoras-store';
import { Check, Download, FileText, GripVertical, ImagePlus, Plus, Search, X } from 'lucide-react';

const TABS = [
  { id: 'lista', label: 'Lista' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type SortKey = 'registro' | 'title' | 'module' | 'requester' | 'requestedAt' | 'channel' | 'status';

const COLUMN_DEFS: Array<{ key: SortKey; label: string; width: number }> = [
  { key: 'registro', label: '#', width: 56 },
  { key: 'title', label: 'Título', width: 240 },
  { key: 'module', label: 'Módulo', width: 88 },
  { key: 'requester', label: 'Solicitante', width: 130 },
  { key: 'requestedAt', label: 'Fecha de solicitud', width: 130 },
  { key: 'channel', label: 'Canal', width: 110 },
  { key: 'status', label: 'Estado', width: 110 },
];

const COL_STORAGE = 'ts-mejoras-cols-v3';
const MAX_EVIDENCE = 10;
const MAX_DOC_BYTES = 1_200_000;
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
    const saved = (parsed.order || []).filter((key): key is SortKey => DEFAULT_ORDER.includes(key as SortKey));
    const missing = DEFAULT_ORDER.filter((key) => !saved.includes(key));
    const order = saved.length > 0 ? [...saved, ...missing] : [...DEFAULT_ORDER];
    const widths = { ...DEFAULT_WIDTHS };
    DEFAULT_ORDER.forEach((key) => {
      const width = parsed.widths?.[key];
      if (typeof width === 'number' && width >= 48) widths[key] = width;
    });
    return { order, widths };
  } catch {
    return { order: DEFAULT_ORDER, widths: { ...DEFAULT_WIDTHS } };
  }
}

function renderMejoraCell(row: MejoraCase, key: SortKey) {
  switch (key) {
    case 'registro':
      return row.registro;
    case 'title':
      return displayDash(row.title);
    case 'module':
      return displayDash(row.module);
    case 'requester':
      return displayDash(row.requester);
    case 'requestedAt':
      return formatIsoDate(row.requestedAt);
    case 'channel':
      return displayDash(row.channel);
    case 'status':
      return <StatusPill status={row.status} />;
    default:
      return null;
  }
}

const emptyForm = (): Partial<MejoraCase> => ({
  requestedAt: todayIso(),
  year: 2027,
  area: 'Teamsports',
  module: '',
  title: '',
  need: '',
  requester: '',
  addedBy: DEFAULT_NEW_AUTHOR,
  channel: '',
  informedBy: '',
  channelNote: '',
  status: 'Pendiente',
  comment: '',
  attachments: [],
});

async function compressEvidenceImage(file: Blob, name: string): Promise<MejoraAttachment> {
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

async function fileToAttachment(file: Blob, name: string): Promise<MejoraAttachment> {
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

function openAttachment(item: MejoraAttachment, onImage: (url: string) => void) {
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

function matchesFilter(filter: string, value: string): boolean {
  if (filter === BLANK) return !String(value || '').trim();
  return value === filter;
}

function CatalogField({
  label,
  value,
  options,
  required,
  allowFree,
  blankLabel = 'Selecciona',
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  allowFree?: boolean;
  blankLabel?: string;
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
            <option value="">{blankLabel}</option>
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

function StatusPill({ status }: { status: string }) {
  const pill = 'inline-block max-w-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight';
  if (!status) return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-muted)]`}>—</span>;
  if (status === 'Hecha') return <span className={`${pill} bg-[var(--success-soft)] text-[var(--success)]`}>{status}</span>;
  if (status === 'Aprobada') return <span className={`${pill} bg-[var(--accent-soft)] text-[var(--accent)]`}>{status}</span>;
  if (status === 'Descartada') return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-muted)]`}>{status}</span>;
  if (status === 'En estudio') return <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>{status}</span>;
  return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-secondary)]`}>{status}</span>;
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
        aria-labelledby="mejoras-ack-title"
        aria-describedby="mejoras-ack-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p id="mejoras-ack-title" className="font-display text-lg font-semibold tracking-tight">{title}</p>
            <p id="mejoras-ack-message" className="mt-1 text-sm text-[var(--text-secondary)]">{message}</p>
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

export default function MejorasTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('lista');
  const [state, setState] = useState<MejorasState | null>(null);
  const [backend, setBackend] = useState<MejorasBackend>('local');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRequester, setFilterRequester] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'registro', dir: 'asc' });
  const [columnOrder, setColumnOrder] = useState<SortKey[]>(DEFAULT_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<SortKey, number>>(DEFAULT_WIDTHS);
  const [colsReady, setColsReady] = useState(false);
  const dragCol = useRef<SortKey | null>(null);
  const resizeRef = useRef<{ key: SortKey; startX: number; startW: number } | null>(null);
  const [editing, setEditing] = useState<MejoraCase | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelNote, setPanelNote] = useState<string | null>(null);
  const [ack, setAck] = useState<{ title: string; message: string } | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<MejoraCase>>(emptyForm());
  const [importHeaders, setImportHeaders] = useState<unknown[]>([]);
  const [importRows, setImportRows] = useState<unknown[][]>([]);
  const [importMap, setImportMap] = useState<ImportColumnMap | null>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const viewerRef = useRef<string | null>(null);
  const addEvidenceRef = useRef<(files: Array<{ blob: Blob; name: string }>) => Promise<void>>(async () => {});

  const persist = useCallback(async (next: MejorasState, currentBackend: MejorasBackend) => {
    setState(next);
    try {
      await saveMejorasState(next, currentBackend);
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
      const next = Math.max(48, session.startW + (event.clientX - session.startX));
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
    loadMejorasState()
      .then((result) => {
        if (cancelled) return;
        setState(result.state);
        setBackend(result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar las mejoras.');
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
      setPanelNote(null);
      setPanelOpen(false);
    };
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
    window.addEventListener('keydown', onKey);
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

  const filtered = useMemo(() => {
    if (!state) return [];
    const query = search.trim().toLocaleLowerCase('es');
    return state.cases.filter((row) => {
      if (filterModule && !matchesFilter(filterModule, row.module)) return false;
      if (filterStatus && !matchesFilter(filterStatus, row.status)) return false;
      if (filterRequester && !matchesFilter(filterRequester, row.requester)) return false;
      if (query) {
        const blob = [row.registro, row.title, row.need, row.requester, row.area, row.module, row.channelNote, row.comment, row.informedBy].join(' ').toLocaleLowerCase('es');
        if (!blob.includes(query)) return false;
      }
      return true;
    });
  }, [state, search, filterModule, filterStatus, filterRequester]);

  const kpis = useMemo(() => mejorasKpis(state?.cases || []), [state]);
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort.key === 'requestedAt') {
        const leftUnknown = !a.requestedAt;
        const rightUnknown = !b.requestedAt;
        if (leftUnknown !== rightUnknown) return sort.dir === 'asc' ? (leftUnknown ? 1 : -1) : (leftUnknown ? -1 : 1);
      }
      if (sort.key === 'registro') {
        const result = (a.registro || 0) - (b.registro || 0);
        return sort.dir === 'asc' ? result : -result;
      }
      const left = a[sort.key];
      const right = b[sort.key];
      const result = String(left ?? '').localeCompare(String(right ?? ''), 'es', { numeric: true });
      return sort.dir === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort]);

  if (!state) {
    return (
      <div className="abonos-shell rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-secondary)]">
        Cargando mejoras…
      </div>
    );
  }

  const closePanel = () => {
    setEditing(null);
    setForm(emptyForm());
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(true);
  };

  const openEdit = (row: MejoraCase) => {
    setEditing(row);
    setForm({ ...row, requestedAt: row.requestedAt || '', attachments: row.attachments || [] });
    setPanelNote(null);
    setViewerImage(null);
    setPanelOpen(true);
  };

  const saveForm = async () => {
    const gaps = mejoraRequiredGaps({
      title: form.title,
      area: form.area,
      module: form.module,
      need: form.need,
      requester: form.requester,
      requestedAt: form.requestedAt || null,
      status: form.status,
      channel: form.channel,
    }, editing ? 'edit' : 'new');
    if (gaps.length > 0) {
      setError(formatRequiredGaps(gaps));
      return;
    }
    setError(null);
    const row: MejoraCase = {
      id: editing?.id || crypto.randomUUID(),
      registro: editing?.registro || nextRegistro(state.cases),
      createdAt: editing ? (editing.createdAt || '') : new Date().toISOString(),
      requestedAt: form.requestedAt || null,
      year: form.year || 2027,
      area: form.area || '',
      module: (form.module || '') as MejoraModule | '',
      title: (form.title || '').trim(),
      need: (form.need || '').trim(),
      requester: (form.requester || '').trim(),
      addedBy: editing?.addedBy || DEFAULT_NEW_AUTHOR,
      channel: (form.channel || '') as MejoraChannel | '',
      informedBy: editing?.informedBy || '',
      channelNote: (form.channelNote || '').trim(),
      status: (form.status || '') as MejoraStatus | '',
      comment: editing?.comment || '',
      attachments: form.attachments || [],
    };
    const cases = editing
      ? state.cases.map((item) => item.id === row.id ? row : item)
      : [row, ...state.cases];
    const catalogs = addCatalogValue(
      addCatalogValue(state.catalogs, 'area', row.area),
      'requester',
      row.requester,
    );
    void persist({ cases, catalogs }, backend);
    closePanel();
    setAck({
      title: 'Guardado',
      message: 'La mejora ya está en la lista.',
    });
  };

  const addEvidenceBlobs = async (files: Array<{ blob: Blob; name: string }>) => {
    const current = form.attachments || [];
    const remaining = MAX_EVIDENCE - current.length;
    if (remaining <= 0) {
      setError(`Máximo ${MAX_EVIDENCE} documentos por mejora.`);
      return;
    }
    const allowed = files.filter((file) => isAllowedEvidence(file.blob, file.name));
    if (allowed.length === 0) {
      setError('Elige una imagen, PDF, Excel u otro documento.');
      return;
    }
    setError(null);
    try {
      const added: MejoraAttachment[] = [];
      for (const file of allowed.slice(0, remaining)) {
        added.push(await fileToAttachment(file.blob, file.name));
      }
      const attachments = [...current, ...added];
      setForm((currentForm) => ({ ...currentForm, attachments }));
      setPanelNote(added.length === 1 ? 'Documento añadido. Pulsa Guardar si es una mejora nueva.' : `${added.length} documentos añadidos.`);
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
    if (!window.confirm('¿Eliminar esta mejora?')) return;
    void persist({
      ...state,
      cases: state.cases.filter((row) => row.id !== id),
    }, backend);
    closePanel();
  };

  const clearAll = async () => {
    if (!window.confirm('¿Borrar todas las mejoras? Luego puedes importar el Excel.')) return;
    await persist({ ...state, cases: [] }, backend);
    setNote('Lista vacía. Ya puedes importar.');
    setTab('importar');
  };

  const handleImportFile = async (data: unknown[][]) => {
    const headerRow = detectMejorasHeaderRow(data);
    const header = data[headerRow] || [];
    const map = guessColumnMap(header);
    setImportRows(data);
    setImportHeaders(header);
    setHeaderIndex(headerRow);
    setImportMap(map);
    setPreview(buildImportPreview(data, map, headerRow));
  };

  const applyImport = async () => {
    const imported = previewToRecords(preview);
    if (imported.length === 0) {
      setError('No hay filas válidas para importar.');
      return;
    }
    const start = nextRegistro(state.cases);
    const cases = [
      ...imported.map((row, index) => ({ ...row, registro: start + index })),
      ...state.cases,
    ];
    let catalogs = state.catalogs;
    imported.forEach((row) => {
      catalogs = addCatalogValue(addCatalogValue(catalogs, 'area', row.area), 'requester', row.requester);
    });
    await persist({ cases, catalogs }, backend);
    setPreview([]);
    setImportMap(null);
    setNote(`Importadas ${imported.length} mejoras.`);
    setTab('lista');
  };

  const exportWorkbook = async () => {
    if (state.cases.length === 0) {
      setError('No hay mejoras para exportar.');
      return;
    }
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const rows = mejorasExportRows(state.cases);
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 10 },
        { wch: 36 },
        { wch: 14 },
        { wch: 10 },
        { wch: 70 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 36 },
        { wch: 14 },
        { wch: 28 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 24 },
        { wch: 8 },
        { wch: 14 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Mejoras');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Mejoras_IT.xlsx';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setAck({
        title: 'Excel descargado',
        message: `Se han exportado ${state.cases.length} mejoras.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido generar el Excel.');
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mejorasTemplateRows()), 'Mejoras');
    XLSX.writeFile(workbook, 'Plantilla_mejoras.xlsx');
  };

  const requesters = mergeCatalog(state.catalogs.requesters, state.cases.map((row) => row.requester));
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">06 Mejoras IT</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Mejoras</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Lo que hay que pedir a IT en ERP o Web. Cada ficha tiene que decir exactamente de qué va.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Nueva mejora
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      )}
      {note && <p className="text-xs font-medium text-[var(--success)]">{note}</p>}

      {tab === 'lista' && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Total" value={String(kpis.total)} />
            <Kpi label="ERP" value={String(kpis.erp)} />
            <Kpi label="Web" value={String(kpis.web)} />
            <Kpi label="Pendientes" value={String(kpis.open)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar título, necesidad, persona…"
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-sm"
              />
            </label>
            <select value={filterModule} onChange={(event) => setFilterModule(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
              <option value="">Módulo</option>
              {MEJORA_MODULES.map((module) => <option key={module} value={module}>{module}</option>)}
            </select>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
              <option value="">Estado</option>
              {MEJORA_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={filterRequester} onChange={(event) => setFilterRequester(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
              <option value="">Solicitante</option>
              {requesters.map((person) => <option key={person} value={person}>{person}</option>)}
            </select>
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
                      <td key={key} className="border-b border-[var(--border)] px-1.5 py-1.5">
                        <div className="abonos-cell" title={key === 'title' ? row.title || undefined : undefined}>{renderMejoraCell(row, key)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No hay mejoras con estos filtros.</p>}
          </div>
        </section>
      )}

      {tab === 'importar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Plantilla Excel</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Para entrar hace falta Área, Módulo (ERP o Web), Necesidad y Solicitante. Título si no viene se saca de la necesidad.
                  Fecha, canal y el resto puedes dejarlos vacíos o con un guión; en las altas nuevas sí serán obligatorios.
                </p>
              </div>
              <button type="button" onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold hover:bg-[var(--bg-soft)]">
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
              {state.cases.length > 0 && (
                <button type="button" onClick={clearAll} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                  Vaciar lista
                </button>
              )}
            </div>
            <FileUpload
              inputId="mejoras-import"
              label="Importar Excel de mejoras"
              hint="Vacío o — vale en fecha y canal. Las filas sin Área, Módulo, Necesidad o Solicitante no entran."
              onFileLoaded={handleImportFile}
              keepDropzone
            />
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
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm"
                    >
                      <option value="">—</option>
                      {importHeaders.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>{String(header || `Columna ${index + 1}`)}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{preview.filter((row) => !row.error).length} válidas · {preview.filter((row) => row.error).length} con falta</p>
              <button type="button" onClick={applyImport} className="mt-3 rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white">
                Importar válidas
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'exportar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-sm font-semibold">Descargar todo</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {state.cases.length === 0
                ? 'No hay mejoras. Importa el Excel o crea una nueva.'
                : `${state.cases.length} mejoras, con todos los campos: título, necesidad, módulo, solicitante, fecha, canal, detalle, estado, documentos y el resto.`}
            </p>
            <button
              type="button"
              onClick={exportWorkbook}
              disabled={state.cases.length === 0}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--text-primary)] px-4 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Descargar Excel
            </button>
          </div>
        </section>
      )}

      {panelOpen && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div className="abonos-modal" style={{ width: 'min(760px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="mejoras-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p id="mejoras-modal-title" className="font-display text-lg font-semibold tracking-tight">
                  {editing ? (form.title || editing.title) : 'Nueva mejora'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {displayDash(form.module || null)} · {displayDash(form.requester || null)}
                  {editing ? ` · #${editing.registro}` : ''}
                </p>
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{editing ? 'Editar' : 'Datos de la mejora'}</p>
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  {editing
                    ? 'Puedes dejar No necesario en lo que no sepas. Guardar no te obliga a completar huecos.'
                    : 'Los campos con * hay que rellenarlos. Detalle del canal y documentos son opcionales.'}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Título{editing ? '' : ' *'}</span>
                    <input value={form.title || ''} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" placeholder={editing ? 'No necesario' : 'En una línea, para saber de qué va'} />
                  </label>
                  <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required={!editing} blankLabel={editing ? 'No necesario' : 'Selecciona'} onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Módulo{editing ? '' : ' *'}</span>
                    <select value={form.module || ''} onChange={(event) => setForm({ ...form, module: event.target.value as MejoraModule | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">{editing ? 'No necesario' : 'Selecciona'}</option>
                      {MEJORA_MODULES.map((module) => <option key={module} value={module}>{module}</option>)}
                    </select>
                  </label>
                  <CatalogField label="Solicitante" value={form.requester || ''} options={requesters} required={!editing} allowFree blankLabel={editing ? 'No necesario' : 'Selecciona'} onChange={(requester) => setForm({ ...form, requester })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'requester', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha de solicitud{editing ? '' : ' *'}</span>
                    <div className="flex gap-2">
                      <input type="date" value={form.requestedAt || ''} onChange={(event) => setForm({ ...form, requestedAt: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                      {editing && form.requestedAt && (
                        <button type="button" onClick={() => setForm({ ...form, requestedAt: '' })} className="h-10 shrink-0 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]">
                          No necesario
                        </button>
                      )}
                    </div>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado{editing ? '' : ' *'}</span>
                    <select value={form.status || ''} onChange={(event) => setForm({ ...form, status: event.target.value as MejoraStatus | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">{editing ? 'No necesario' : 'Selecciona'}</option>
                      {MEJORA_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Canal{editing ? '' : ' *'}</span>
                    <select value={form.channel || ''} onChange={(event) => setForm({ ...form, channel: event.target.value as MejoraChannel | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">{editing ? 'No necesario' : 'Selecciona'}</option>
                      {MEJORA_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Necesidad{editing ? '' : ' *'}</span>
                    <textarea
                      value={form.need || ''}
                      onChange={(event) => setForm({ ...form, need: event.target.value })}
                      rows={5}
                      placeholder={editing ? 'No necesario' : 'Qué hay que hacer y por qué. Lo bastante claro para desarrollarla sin preguntar otra vez.'}
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Detalle del canal</span>
                    <textarea
                      value={form.channelNote || ''}
                      onChange={(event) => setForm({ ...form, channelNote: event.target.value })}
                      rows={3}
                      placeholder="Me lo pasó por Teams el 12/04. El correo está en la carpeta IT 2027…"
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Documentos</span>
                    <p className="text-[11px] text-[var(--text-secondary)]">Capturas, PDF o Excel. Hasta {MAX_EVIDENCE}. Pega una imagen con Ctrl+V.</p>
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
          <img src={viewerImage} alt="Captura" className="max-h-[90vh] max-w-[90vw] rounded-md object-contain" onClick={(event) => event.stopPropagation()} />
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
