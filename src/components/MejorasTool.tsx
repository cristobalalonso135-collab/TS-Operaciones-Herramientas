'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  DEFAULT_NEW_AUTHOR,
  MEJORAS_AUTHORS,
  MEJORA_CHANNELS,
  MEJORA_MODULES,
  MEJORA_STATUSES,
  displayDash,
  formatIsoDate,
  formatRequiredGaps,
  isOpenMejora,
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
import { Check, Download, FileText, ImagePlus, Plus, Search, X } from 'lucide-react';

const TABS = [
  { id: 'lista', label: 'Lista' },
  { id: 'modulo', label: 'Por módulo' },
  { id: 'importar', label: 'Importar' },
  { id: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['id'];
const MAX_EVIDENCE = 10;
const MAX_DOC_BYTES = 1_200_000;
const BLANK = '__blank__';

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

function StatusPill({ status }: { status: string }) {
  const pill = 'inline-block max-w-full rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight';
  if (!status) return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-muted)]`}>—</span>;
  if (status === 'Hecha') return <span className={`${pill} bg-[var(--success-soft)] text-[var(--success)]`}>{status}</span>;
  if (status === 'Aprobada') return <span className={`${pill} bg-[var(--accent-soft)] text-[var(--accent)]`}>{status}</span>;
  if (status === 'Descartada') return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-muted)]`}>{status}</span>;
  if (status === 'En estudio') return <span className={`${pill} bg-[#f8eee4] text-[var(--warning)]`}>{status}</span>;
  return <span className={`${pill} bg-[var(--bg-soft)] text-[var(--text-secondary)]`}>{status}</span>;
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
  const [editing, setEditing] = useState<MejoraCase | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelNote, setPanelNote] = useState<string | null>(null);
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
  const november = useMemo(() => {
    const open = (state?.cases || []).filter((row) => isOpenMejora(row.status));
    return {
      gestion: open.filter((row) => row.module === 'Gestión'),
      web: open.filter((row) => row.module === 'Web'),
    };
  }, [state]);

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
      addedBy: form.addedBy,
      requestedAt: form.requestedAt || null,
      status: form.status,
    });
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
      addedBy: form.addedBy || DEFAULT_NEW_AUTHOR,
      channel: (form.channel || '') as MejoraChannel | '',
      informedBy: (form.informedBy || '').trim(),
      channelNote: (form.channelNote || '').trim(),
      status: (form.status || '') as MejoraStatus | '',
      comment: form.comment || '',
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
    await persist({ cases, catalogs }, backend);
    setEditing(row);
    setForm(row);
    setNote('Guardado.');
    setPanelNote('Guardado. Ya está en la lista.');
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
    await persist({
      ...state,
      cases: state.cases.filter((row) => row.id !== id),
    }, backend);
    closePanel();
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
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mejorasExportRows(filtered.length ? filtered : state.cases)), 'Mejoras');
    XLSX.writeFile(workbook, 'Mejoras_IT.xlsx');
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mejorasTemplateRows()), 'Mejoras');
    XLSX.writeFile(workbook, 'Plantilla_mejoras.xlsx');
  };

  const requesters = mergeCatalog(state.catalogs.requesters, state.cases.map((row) => row.requester));

  return (
    <div className="abonos-shell space-y-4">
      <WorkspaceChrome onBack={onBack} tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">06 Mejoras IT</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Mejoras</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Lo que hay que pedir a IT en Gestión o Web. Cada ficha tiene que decir exactamente de qué va.
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
            <Kpi label="Gestión" value={String(kpis.gestion)} />
            <Kpi label="Web" value={String(kpis.web)} />
            <Kpi label="Sin captura" value={String(kpis.withoutEvidence)} tone={kpis.withoutEvidence ? 'warning' : undefined} />
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
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Módulo</th>
                  <th className="px-3 py-2">Solicitante</th>
                  <th className="px-3 py-2">Solicitada</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Adjuntos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-soft)]">
                    <td className="px-3 py-2 text-[var(--text-muted)]">{row.registro}</td>
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2">{displayDash(row.module)}</td>
                    <td className="px-3 py-2">{displayDash(row.requester)}</td>
                    <td className="px-3 py-2">{formatIsoDate(row.requestedAt)}</td>
                    <td className="px-3 py-2">{displayDash(row.channel)}</td>
                    <td className="px-3 py-2"><StatusPill status={row.status} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{row.attachments.length || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="p-4 text-sm text-[var(--text-secondary)]">No hay mejoras con estos filtros.</p>}
          </div>
        </section>
      )}

      {tab === 'modulo' && (
        <section className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Lo que sigue abierto, separado por Gestión y Web. Abre cada ficha: necesidad, cómo te lo pasaron y las capturas.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {([
              ['Gestión', november.gestion],
              ['Web', november.web],
            ] as const).map(([label, rows]) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{rows.length}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {rows.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Nada abierto.</p>}
                  {rows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => openEdit(row)}
                      className="block w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-left hover:border-[var(--border-strong)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{row.title}</p>
                        <StatusPill status={row.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{row.need}</p>
                      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                        {displayDash(row.requester)} · {formatIsoDate(row.requestedAt)}
                        {row.attachments.length > 0 ? ` · ${row.attachments.length} adjunto${row.attachments.length === 1 ? '' : 's'}` : ' · sin captura'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'importar' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Plantilla Excel</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Sirve el Excel actual (Área, Módulo, Necesidad, Solicitante) o la plantilla nueva.</p>
              </div>
              <button type="button" onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold hover:bg-[var(--bg-soft)]">
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
            </div>
            <FileUpload
              inputId="mejoras-import"
              label="Importar Excel de mejoras"
              hint="ERP se lee como Gestión. Las filas incompletas no entran."
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
        <section className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={exportWorkbook} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left hover:border-[var(--border-strong)]">
            <p className="text-sm font-semibold">Exportar Excel</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Lista actual, con filtros si hay.</p>
          </button>
        </section>
      )}

      {panelOpen && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div className="abonos-modal" role="dialog" aria-modal="true" aria-labelledby="mejoras-modal-title" onClick={(event) => event.stopPropagation()}>
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

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{editing ? 'Editar' : 'Datos de la mejora'}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Título *</span>
                    <input value={form.title || ''} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" placeholder="En una línea, para saber de qué va" />
                  </label>
                  <CatalogField label="Área" value={form.area || ''} options={state.catalogs.areas} required onChange={(area) => setForm({ ...form, area })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'area', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Módulo *</span>
                    <select value={form.module || ''} onChange={(event) => setForm({ ...form, module: event.target.value as MejoraModule | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {MEJORA_MODULES.map((module) => <option key={module} value={module}>{module}</option>)}
                    </select>
                  </label>
                  <CatalogField label="Solicitante" value={form.requester || ''} options={requesters} required allowFree onChange={(requester) => setForm({ ...form, requester })} onAdd={(value) => persist({ ...state, catalogs: addCatalogValue(state.catalogs, 'requester', value) }, backend)} />
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Fecha de solicitud *</span>
                    <input type="date" value={form.requestedAt || ''} onChange={(event) => setForm({ ...form, requestedAt: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Añadido por *</span>
                    <select value={form.addedBy || ''} onChange={(event) => setForm({ ...form, addedBy: event.target.value })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {MEJORAS_AUTHORS.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Estado *</span>
                    <select value={form.status || ''} onChange={(event) => setForm({ ...form, status: event.target.value as MejoraStatus | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {MEJORA_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Necesidad *</span>
                    <textarea
                      value={form.need || ''}
                      onChange={(event) => setForm({ ...form, need: event.target.value })}
                      rows={5}
                      placeholder="Qué hay que hacer y por qué. Lo bastante claro para desarrollarla sin preguntar otra vez."
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <p className="md:col-span-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cómo te lo pasaron</p>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Canal</span>
                    <select value={form.channel || ''} onChange={(event) => setForm({ ...form, channel: event.target.value as MejoraChannel | '' })} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                      <option value="">—</option>
                      {MEJORA_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Persona</span>
                    <input
                      value={form.informedBy || ''}
                      onChange={(event) => setForm({ ...form, informedBy: event.target.value })}
                      placeholder="Samu, Santi…"
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Detalle del canal</span>
                    <textarea
                      value={form.channelNote || ''}
                      onChange={(event) => setForm({ ...form, channelNote: event.target.value })}
                      rows={3}
                      placeholder="Me lo pasó Samu por Teams el 12/04. El correo está en la carpeta IT 2027…"
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
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Comentario</span>
                    <textarea
                      value={form.comment || ''}
                      onChange={(event) => setForm({ ...form, comment: event.target.value })}
                      rows={2}
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
                    className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white ${panelNote?.startsWith('Guardado') ? 'bg-[var(--success)]' : 'bg-[var(--text-primary)]'}`}
                  >
                    {panelNote?.startsWith('Guardado') ? <><Check className="h-4 w-4" /> Guardado</> : 'Guardar'}
                  </button>
                  {editing && (
                    <button type="button" onClick={() => deleteCase(editing.id)} className="rounded-md px-4 py-2 text-sm text-[var(--danger)]">Eliminar</button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">De qué va</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {form.need || 'Describe la necesidad con el detalle que haría falta para desarrollarla sin preguntar otra vez.'}
                  </p>
                  {form.channelNote && (
                    <p className="mt-3 text-xs text-[var(--text-secondary)]">{form.channelNote}</p>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Resumen</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Solicitada</dt>
                      <dd>{formatIsoDate(form.requestedAt || null)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Estado</dt>
                      <dd><StatusPill status={form.status || ''} /></dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Canal</dt>
                      <dd>{displayDash(form.channel)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Persona</dt>
                      <dd>{displayDash(form.informedBy)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Adjuntos</dt>
                      <dd>{(form.attachments || []).length || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--text-secondary)]">Añadido por</dt>
                      <dd>{displayDash(form.addedBy)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
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
