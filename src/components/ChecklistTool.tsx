'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  CHECKLIST_PRIORITIES,
  CHECKLIST_STATUSES,
  checklistKpis,
  completeChecklistTask,
  daysUntil,
  cloneChecklist,
  emptyChecklist,
  emptyTask,
  emptySubtask,
  formatIsoDate,
  isClosed,
  isTaskOverdue,
  isTaskThisWeek,
  mergeImportedTasks,
  moveById,
  sortByDeadline,
  todayIso,
  toggleTask,
  uniqueValues,
  CHECKLIST_TABLE_WIDTHS,
  defaultChecklistColumnWidths,
  type ChecklistLibrary,
  type ChecklistPriority,
  type ChecklistState,
  type ChecklistStatus,
  type ChecklistSubtask,
  type ChecklistTask,
} from '@/lib/checklist-model';
import { checklistToAoa, parseChecklistSheet, pickChecklistRows } from '@/lib/checklist-excel';
import { loadChecklistLibrary, saveChecklistLibrary, type ChecklistBackend } from '@/lib/checklist-store';
import { Check, ChevronDown, Copy, Download, GripVertical, Plus, Search, Trash2, Upload, X } from 'lucide-react';

const WORK_TABS = [{ id: 'resumen', label: 'Resumen' }] as const;

function downloadAoa(rows: unknown[][], fileName: string) {
  void import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Checklist');
    XLSX.writeFile(wb, fileName);
  });
}

function formatShare(done: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((done / total) * 100)}%`;
}

function formatListado(nombre: string, fechaEvento: string, tasks: ChecklistTask[]): string {
  const kpis = checklistKpis(tasks);
  const head = [
    nombre,
    [
      fechaEvento ? `Evento ${formatIsoDate(fechaEvento)}` : '',
      `${kpis.done} hechas · ${kpis.open} abiertas${kpis.overdue ? ` · ${kpis.overdue} vencidas` : ''}`,
    ].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const rows = tasks.map((task) => {
    const mark = task.estado === 'Completado' ? 'x' : ' ';
    return `[${mark}] ${task.area || '—'} · ${task.titulo} · ${formatIsoDate(task.deadline)} · ${task.responsable || '—'} · ${task.estado}`;
  });
  return [...head, '', ...rows].join('\n');
}

function Kpi({ label, value, hint, danger }: { label: string; value: string | number; hint?: string; danger?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${danger ? 'border-red-200 bg-red-50' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
      <p className={`text-xs ${danger ? 'text-red-800' : 'text-[var(--text-secondary)]'}`}>{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold tabular-nums ${danger ? 'text-red-800' : ''}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function remainingChip(days: number | null, muted = false) {
  if (days == null || muted) return null;
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--danger)]">
        {Math.abs(days)}d tarde
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)]">
        hoy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--success)]">
      {days}d
    </span>
  );
}

function DeadlineMark({
  iso,
  today,
  closed,
}: {
  iso: string | null;
  today: string;
  closed?: boolean;
}) {
  const days = closed ? null : daysUntil(iso, today);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={closed ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}>{formatIsoDate(iso)}</span>
      {remainingChip(days, closed)}
    </span>
  );
}

function ColResize({ onMouseDown }: { onMouseDown: (event: ReactMouseEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar columna"
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--text-primary)]/25"
      onMouseDown={onMouseDown}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function StatusMark({ value }: { value: ChecklistStatus }) {
  const tone = value === 'Completado'
    ? 'bg-[var(--success-soft)] text-[var(--success)]'
    : value === 'Caducada'
      ? 'bg-[var(--bg-soft)] text-[var(--text-muted)]'
      : value === 'Bloqueado'
        ? 'bg-amber-50 text-[var(--warning)]'
        : value === 'En curso'
          ? 'bg-blue-50 text-blue-800'
          : 'bg-[var(--bg-soft)] text-[var(--text-secondary)]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {value === 'Completado' ? <Check className="h-3 w-3" /> : null}
      {value}
    </span>
  );
}

function doneRowClass(estado: ChecklistStatus): string {
  if (estado === 'Completado') return 'bg-emerald-50/90';
  if (estado === 'Caducada') return 'bg-[var(--bg-secondary)]';
  return '';
}

function PriorityMark({ value, muted }: { value?: ChecklistPriority | null; muted?: boolean }) {
  const prioridad = value || 'Media';
  const tone = muted
    ? 'bg-[var(--bg-soft)] text-[var(--text-muted)]'
    : prioridad === 'Alta'
      ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
      : prioridad === 'Baja'
        ? 'bg-[var(--bg-soft)] text-[var(--text-secondary)]'
        : 'bg-amber-50 text-[var(--warning)]';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {prioridad}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-md border border-[var(--border)] bg-white py-0 pl-2.5 pr-10 text-sm"
      >
        <option value="">{label}</option>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
    </label>
  );
}

function StatusSelect({
  value,
  onChange,
  full,
}: {
  value: ChecklistStatus;
  onChange: (value: ChecklistStatus) => void;
  full?: boolean;
}) {
  return (
    <label className={`relative inline-flex ${full ? 'w-full' : ''}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ChecklistStatus)}
        className={full
          ? 'h-10 w-full appearance-none rounded-md border border-[var(--border)] bg-white py-0 pl-3 pr-10 text-sm'
          : 'h-7 appearance-none rounded border border-[var(--border)] bg-white py-0 pl-1.5 pr-7 text-xs'}
      >
        {CHECKLIST_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <ChevronDown className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] ${full ? 'right-3.5 h-4 w-4' : 'right-1.5 h-3 w-3'}`} />
    </label>
  );
}

function missingChecklistFields(form: ChecklistTask): Array<{ key: string; label: string }> {
  const missing: Array<{ key: string; label: string }> = [];
  if (!form.titulo.trim()) missing.push({ key: 'titulo', label: 'Tarea' });
  if (!form.area.trim()) missing.push({ key: 'area', label: 'Área' });
  if (!form.responsable.trim()) missing.push({ key: 'responsable', label: 'Responsable' });
  if (!form.deadline) missing.push({ key: 'deadline', label: 'Deadline' });
  (form.subtasks || []).forEach((step, index) => {
    const title = step.titulo.trim();
    const hasDate = Boolean(step.deadline);
    if (!title && !hasDate) return;
    if (!title) missing.push({ key: `paso-title-${step.id}`, label: `texto del paso ${index + 1}` });
    if (!hasDate) missing.push({ key: `paso-date-${step.id}`, label: `fecha del paso ${index + 1}` });
  });
  return missing;
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function fieldClass(invalid: boolean, extra = ''): string {
  return `rounded-md border bg-white text-sm ${invalid ? 'border-[var(--danger)]' : 'border-[var(--border)]'} ${extra}`;
}

export default function ChecklistTool({ onBack }: { onBack: () => void }) {
  const [library, setLibrary] = useState<ChecklistLibrary | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, setState] = useState<ChecklistState | null>(null);
  const [backend, setBackend] = useState<ChecklistBackend>('local');
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterStatus, setFilterStatus] = useState<ChecklistStatus | ''>('');
  const [ack, setAck] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyWeek, setOnlyWeek] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(defaultChecklistColumnWidths);
  const colWidthsRef = useRef(colWidths);
  const dragStep = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ChecklistTask>(() => emptyTask());
  const [askedSave, setAskedSave] = useState(false);
  const today = todayIso();
  const stateRef = useRef<ChecklistState | null>(null);
  const libraryRef = useRef<ChecklistLibrary | null>(null);

  const persistLibrary = useCallback(async (next: ChecklistLibrary, currentBackend: ChecklistBackend) => {
    libraryRef.current = next;
    setLibrary(next);
    try {
      await saveChecklistLibrary(next, currentBackend);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);

  useEffect(() => {
    if (!state) return;
    setColWidths({ ...defaultChecklistColumnWidths(), ...(state.columnWidths || {}) });
  }, [state?.id]);

  const persist = useCallback(async (next: ChecklistState, currentBackend: ChecklistBackend) => {
    const withCols = { ...next, columnWidths: colWidthsRef.current };
    const lib = libraryRef.current;
    const lists = lib
      ? (lib.lists.some((item) => item.id === withCols.id)
        ? lib.lists.map((item) => (item.id === withCols.id ? withCols : item))
        : [...lib.lists, withCols])
      : [withCols];
    const nextLib = { lists };
    libraryRef.current = nextLib;
    stateRef.current = withCols;
    setLibrary(nextLib);
    setState(withCols);
    setError(null);
    try {
      await saveChecklistLibrary(nextLib, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadChecklistLibrary()
      .then((result) => {
        if (cancelled) return;
        const nextLib = result.library;
        libraryRef.current = nextLib;
        setLibrary(nextLib);
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
        if (result.migrated) void saveChecklistLibrary(nextLib, result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar el checklist.');
      });
    return () => { cancelled = true; };
  }, []);

  const resizeColumn = (key: string, event: ReactMouseEvent) => {
    const spec = CHECKLIST_TABLE_WIDTHS[key];
    if (!spec || spec.min === spec.max) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = colWidthsRef.current[key] ?? spec.width;
    const move = (moveEvent: MouseEvent) => {
      const next = Math.min(spec.max, Math.max(spec.min, Math.round(startW + moveEvent.clientX - startX)));
      setColWidths((current) => ({ ...current, [key]: next }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const current = stateRef.current;
      if (current) void persist(current, backend);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const tasks = state?.tasks || [];
  const kpis = useMemo(() => checklistKpis(tasks, today), [tasks, today]);
  const areas = useMemo(() => uniqueValues(tasks, 'area'), [tasks]);
  const owners = useMemo(() => uniqueValues(tasks, 'responsable'), [tasks]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return tasks.filter((item) => {
      if (filterArea && item.area !== filterArea) return false;
      if (filterOwner && item.responsable !== filterOwner) return false;
      if (filterStatus && item.estado !== filterStatus) return false;
      if (onlyOverdue && !isTaskOverdue(item, today)) return false;
      if (onlyWeek && !isTaskThisWeek(item, today)) return false;
      if (q) {
        const hay = `${item.area} ${item.titulo} ${item.responsable} ${item.prioridad} ${item.comentarios} ${(item.subtasks || []).map((step) => step.titulo).join(' ')}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterArea, filterOwner, filterStatus, onlyOverdue, onlyWeek, query, tasks, today]);
  const tableRows = useMemo(() => sortByDeadline(filtered, 'asc', true), [filtered]);
  const formGaps = askedSave ? missingChecklistFields(form) : [];
  const gapKeys = new Set(formGaps.map((item) => item.key));

  const patchTask = (id: string, update: Partial<ChecklistTask>, save = true) => {
    const current = stateRef.current;
    if (!current) return;
    const next = {
      ...current,
      tasks: current.tasks.map((item) => (item.id === id ? { ...item, ...update } : item)),
    };
    stateRef.current = next;
    setState(next);
    if (save) void persist(next, backend);
  };

  const flush = () => {
    if (stateRef.current) void persist(stateRef.current, backend);
  };

  const openTask = (task: ChecklistTask) => {
    setForm({
      ...task,
      prioridad: task.prioridad || 'Media',
      subtasks: (task.subtasks || []).map((item) => ({ ...item })),
    });
    setEditingId(task.id);
    setAskedSave(false);
  };

  const openNew = () => {
    setForm(emptyTask());
    setEditingId('new');
    setAskedSave(false);
  };

  const closePanel = () => {
    setEditingId(null);
    setAskedSave(false);
  };

  const openBoard = (id: string) => {
    const board = libraryRef.current?.lists.find((item) => item.id === id);
    if (!board) return;
    setOpenId(id);
    setQuery('');
    setFilterArea('');
    setFilterOwner('');
    setFilterStatus('');
    setOnlyOverdue(false);
    setOnlyWeek(false);
    setImportOpen(false);
    stateRef.current = board;
    setState(board);
  };

  const closeBoard = () => {
    setOpenId(null);
    setEditingId(null);
    setAskedSave(false);
    stateRef.current = null;
    setState(null);
  };

  const createBoard = () => {
    const board = emptyChecklist();
    const lib = libraryRef.current || { lists: [] };
    const nextLib = { lists: [...lib.lists, board] };
    libraryRef.current = nextLib;
    void persistLibrary(nextLib, backend);
    stateRef.current = board;
    setState(board);
    setOpenId(board.id);
  };

  const duplicateBoard = (source: ChecklistState) => {
    const board = cloneChecklist(source);
    const lib = libraryRef.current || { lists: [] };
    const nextLib = { lists: [...lib.lists, board] };
    libraryRef.current = nextLib;
    void persistLibrary(nextLib, backend);
    stateRef.current = board;
    setState(board);
    setOpenId(board.id);
    setAck(`Plantilla copiada. Ponle nombre y fechas a ${board.nombre}.`);
  };

  const removeBoard = (id: string) => {
    const lib = libraryRef.current;
    if (!lib || lib.lists.length < 2) return;
    const board = lib.lists.find((item) => item.id === id);
    if (!board || !window.confirm(`¿Quitar “${board.nombre}”?`)) return;
    const nextLib = { lists: lib.lists.filter((item) => item.id !== id) };
    void persistLibrary(nextLib, backend);
    if (openId === id) closeBoard();
  };

  const markDone = (task: ChecklistTask) => {
    const current = stateRef.current;
    if (!current) return;
    if (task.estado === 'Caducada') return;
    if (task.estado === 'Completado') {
      patchTask(task.id, toggleTask(task));
      return;
    }
    const result = completeChecklistTask(task, current.tasks);
    void persist({ ...current, tasks: result.tasks }, backend);
  };

  const setFormSub = (id: string, update: Partial<ChecklistSubtask>) => {
    setForm({
      ...form,
      subtasks: (form.subtasks || []).map((item) => (item.id === id ? { ...item, ...update } : item)),
    });
  };

  const copyListado = async () => {
    const text = formatListado(state?.nombre || 'Checklist', state?.fechaEvento || '', tableRows);
    try {
      await navigator.clipboard.writeText(text);
      setAck('Listado copiado.');
    } catch {
      setError('No he podido copiar el listado.');
    }
  };

  const importExcel = (sheets: Record<string, any[][]>) => {
    const parsed = parseChecklistSheet(pickChecklistRows(sheets));
    if (parsed.tasks.length === 0) {
      setAck('No he encontrado tareas. Revisa que haya una columna Tarea.');
      return;
    }
    const current = stateRef.current;
    if (!current) return;
    const result = replaceAll
      ? { state: { ...current, tasks: parsed.tasks }, added: parsed.tasks.length, updated: 0 }
      : mergeImportedTasks(current, parsed.tasks);
    void persist({
      ...result.state,
      nombre: parsed.nombre || result.state.nombre,
      fechaEvento: parsed.fechaEvento || result.state.fechaEvento,
    }, backend);
    setAck(replaceAll
      ? `Checklist sustituido: ${parsed.tasks.length} tareas.`
      : `${result.added} nuevas y ${result.updated} actualizadas.`);
    setImportOpen(false);
  };

  const moveFormStep = (fromId: string, toId: string) => {
    setForm({ ...form, subtasks: moveById(form.subtasks || [], fromId, toId) });
  };

  const saveForm = () => {
    const gaps = missingChecklistFields(form);
    if (gaps.length) {
      setAskedSave(true);
      return;
    }
    setAskedSave(false);
    const titulo = form.titulo.trim();
    const area = form.area.trim();
    const responsable = form.responsable.trim();
    const pendingSteps = (form.subtasks || []).filter((item) => item.titulo.trim());
    const current = stateRef.current;
    if (!current) return;
    const nextTask: ChecklistTask = {
      ...form,
      titulo,
      area,
      responsable,
      comentarios: form.comentarios.trim(),
      deadline: form.deadline,
      prioridad: form.prioridad || 'Media',
      completedAt: form.estado === 'Completado' ? (form.completedAt || new Date().toISOString()) : null,
      subtasks: pendingSteps.map((item) => ({
        ...item,
        titulo: item.titulo.trim(),
        deadline: item.deadline,
        completedAt: item.done ? (item.completedAt || new Date().toISOString()) : null,
      })),
    };
    const previous = editingId && editingId !== 'new'
      ? current.tasks.find((item) => item.id === editingId)
      : null;
    let tasks = editingId === 'new'
      ? [...current.tasks, nextTask]
      : current.tasks.map((item) => (item.id === editingId ? { ...item, ...nextTask, id: item.id } : item));
    const saved = tasks.find((item) => item.id === nextTask.id) || nextTask;
    if (saved.estado === 'Completado' && previous?.estado !== 'Completado') {
      const result = completeChecklistTask({ ...saved, estado: 'Pendiente' }, tasks);
      tasks = result.tasks;
    }
    void persist({ ...current, tasks }, backend);
    closePanel();
  };

  const removeEditing = () => {
    if (editingId === 'new' || !editingId) {
      closePanel();
      return;
    }
    if (!window.confirm('¿Quitar esta tarea?')) return;
    const current = stateRef.current;
    if (!current) return;
    void persist({ ...current, tasks: current.tasks.filter((item) => item.id !== editingId) }, backend);
    closePanel();
  };

  useEffect(() => {
    if (!editingId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId]);

  if (!library) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]">Cargando checklist…</p>;
  }

  if (!openId || !state) {
    return (
      <div className="space-y-4">
        <WorkspaceChrome
          onBack={onBack}
          tabs={[{ id: 'listas', label: 'Listas' }]}
          active="listas"
          onSelect={() => undefined}
        />
        {setupSql && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Falta la tabla en Supabase. Pégalo en el SQL Editor:</p>
            <textarea readOnly className="mt-2 h-28 w-full rounded-md border border-amber-200 bg-white p-2 font-mono text-[11px]" value={setupSql} />
          </div>
        )}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {ack && (
          <div className="rounded-lg border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
            {ack}
          </div>
        )}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">08 Checklist</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Checklists</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Cada una es independiente. Duplica una para usarla de plantilla en la siguiente.
              </p>
            </div>
            <button
              type="button"
              onClick={createBoard}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva checklist
            </button>
          </div>
        </section>
        <div className="grid gap-3">
          {library.lists.map((board) => {
            const kpis = checklistKpis(board.tasks, today);
            return (
              <article key={board.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" onClick={() => openBoard(board.id)} className="min-w-0 flex-1 text-left">
                    <p className="font-display text-lg font-semibold tracking-tight">{board.nombre}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {board.fechaEvento ? `Evento ${formatIsoDate(board.fechaEvento)}` : 'Sin fecha de evento'}
                      {' · '}{kpis.done}/{kpis.total || 0} hechas
                      {kpis.overdue > 0 ? ` · ${kpis.overdue} vencidas` : ''}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                      <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${Math.round(kpis.share * 100)}%` }} />
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openBoard(board.id)}
                      className="h-9 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateBoard(board)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar plantilla
                    </button>
                    {library.lists.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeBoard(board.id)}
                        className="inline-flex h-9 items-center rounded-md px-2 text-[var(--text-muted)] hover:text-[var(--danger)]"
                        aria-label="Quitar checklist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkspaceChrome
        onBack={closeBoard}
        backLabel="Checklists"
        tabs={[...WORK_TABS]}
        active="resumen"
        onSelect={() => undefined}
      />

      {setupSql && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Falta la tabla en Supabase. Pégalo en el SQL Editor:</p>
          <textarea readOnly className="mt-2 h-28 w-full rounded-md border border-amber-200 bg-white p-2 font-mono text-[11px]" value={setupSql} />
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {ack && (
        <div className="rounded-lg border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {ack}
        </div>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">08 Checklist</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={state.nombre}
              onChange={(e) => {
                const next = { ...state, nombre: e.target.value };
                stateRef.current = next;
                setState(next);
              }}
              onBlur={flush}
              className="w-full bg-transparent font-display text-2xl font-semibold tracking-tight outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              Fecha evento
              <input
                type="date"
                value={state.fechaEvento}
                onChange={(e) => {
                  const next = { ...state, fechaEvento: e.target.value };
                  stateRef.current = next;
                  setState(next);
                }}
                onBlur={flush}
                className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openNew}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva tarea
            </button>
            <button
              type="button"
              onClick={() => void copyListado()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar listado
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
              onClick={() => downloadAoa(checklistToAoa(state.nombre, state.fechaEvento, state.tasks), `${state.nombre || 'checklist'}.xlsx`)}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={() => setImportOpen((open) => !open)}
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
                importOpen ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white' : 'border-[var(--border)] bg-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
          <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${Math.round(kpis.share * 100)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Kpi label="Abiertas" value={kpis.open} />
          <button
            type="button"
            className="text-left"
            onClick={() => {
              setOnlyOverdue((value) => !value);
              setOnlyWeek(false);
            }}
          >
            <Kpi label="Vencidas" value={kpis.overdue} danger={kpis.overdue > 0} hint={onlyOverdue ? 'Filtro activo' : undefined} />
          </button>
          <Kpi label="Hechas" value={kpis.done} hint={formatShare(kpis.done, kpis.total)} />
        </div>
      </section>

      {importOpen ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Exporta o importa el checklist entero: tareas, prioridad, pasos, fechas, estados y responsables. Si la tarea ya existe, se actualiza.
          </p>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
            Sustituir el checklist actual (no fusionar)
          </label>
          <FileUpload
            inputId="checklist-import"
            label="Importar Excel"
            hint="Usa el Excel que descargas aquí. Conserva Id, pasos y fechas."
            keepDropzone
            compact
            onFileLoaded={() => {}}
            onWorkbookLoaded={importExcel}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white py-0 pl-8 pr-3 text-sm"
          />
        </label>
        <FilterSelect value={filterArea} onChange={setFilterArea} label="Área" options={areas} />
        <FilterSelect value={filterOwner} onChange={setFilterOwner} label="Responsable" options={owners} />
        <FilterSelect
          value={filterStatus}
          onChange={(value) => setFilterStatus(value as ChecklistStatus | '')}
          label="Estado"
          options={[...CHECKLIST_STATUSES]}
        />
        <button
          type="button"
          onClick={() => {
            setOnlyOverdue((value) => !value);
            setOnlyWeek(false);
          }}
          className={`h-9 rounded-md border px-3 text-xs font-semibold ${
            onlyOverdue
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'
          }`}
        >
          Vencidas
        </button>
        <button
          type="button"
          onClick={() => {
            setOnlyWeek((value) => !value);
            setOnlyOverdue(false);
          }}
          className={`h-9 rounded-md border px-3 text-xs font-semibold ${
            onlyWeek
              ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
              : 'border-[var(--border)] bg-white text-[var(--text-secondary)]'
          }`}
        >
          Esta semana
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        {tableRows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-[var(--text-muted)]">
            {tasks.length === 0 ? 'No hay tareas.' : 'Ninguna tarea con estos filtros.'}
          </p>
        ) : (
          <table
            className="text-left text-[13px]"
            style={{
              tableLayout: 'fixed',
              width: ['grip', 'area', 'titulo', 'deadline', 'prioridad', 'responsable', 'estado']
                .reduce((sum, key) => sum + (colWidths[key] || 0), 0),
            }}
          >
            <colgroup>
              {['grip', 'area', 'titulo', 'deadline', 'prioridad', 'responsable', 'estado'].map((key) => (
                <col key={key} style={{ width: colWidths[key] }} />
              ))}
            </colgroup>
            <thead className="bg-[var(--bg-soft)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5" style={{ width: colWidths.grip }} />
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.area }}>
                  Área
                  <ColResize onMouseDown={(event) => resizeColumn('area', event)} />
                </th>
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.titulo }}>
                  Tarea
                  <ColResize onMouseDown={(event) => resizeColumn('titulo', event)} />
                </th>
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.deadline }}>
                  Deadline
                  <ColResize onMouseDown={(event) => resizeColumn('deadline', event)} />
                </th>
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.prioridad }}>
                  Prioridad
                  <ColResize onMouseDown={(event) => resizeColumn('prioridad', event)} />
                </th>
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.responsable }}>
                  Responsable
                  <ColResize onMouseDown={(event) => resizeColumn('responsable', event)} />
                </th>
                <th className="relative px-2.5 py-1.5 font-semibold" style={{ width: colWidths.estado }}>
                  Estado
                  <ColResize onMouseDown={(event) => resizeColumn('estado', event)} />
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((task) => {
                const closed = isClosed(task);
                const done = task.estado === 'Completado';
                const overdue = isTaskOverdue(task, today);
                return (
                  <tr
                    key={task.id}
                    className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-soft)] ${overdue ? 'bg-red-50' : doneRowClass(task.estado) || 'bg-white'}`}
                    onClick={() => openTask(task)}
                  >
                    <td className="px-2 py-1.5 align-top" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        disabled={task.estado === 'Caducada'}
                        onClick={() => markDone(task)}
                        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${
                          done
                            ? 'border-[var(--success)] bg-[var(--success)] text-white'
                            : task.estado === 'Caducada'
                              ? 'cursor-not-allowed border-[var(--border)] bg-[var(--bg-soft)]'
                              : 'border-[var(--border-strong)] bg-white'
                        }`}
                        aria-label={done ? 'Marcar pendiente' : 'Completar'}
                      >
                        {done ? <Check className="h-2.5 w-2.5" /> : null}
                      </button>
                    </td>
                    <td className="break-words px-2.5 py-1.5 align-top text-[var(--text-secondary)]">{task.area || '—'}</td>
                    <td className={`break-words px-2.5 py-1.5 align-top ${done ? 'text-[var(--text-secondary)] line-through' : closed ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}>{task.titulo}</td>
                    <td className="break-words px-2.5 py-1.5 align-top">
                      <DeadlineMark iso={task.deadline} today={today} closed={closed} />
                    </td>
                    <td className="break-words px-2.5 py-1.5 align-top">
                      <PriorityMark value={task.prioridad} muted={task.estado === 'Caducada'} />
                    </td>
                    <td className="break-words px-2.5 py-1.5 align-top">{task.responsable || '—'}</td>
                    <td className="break-words px-2.5 py-1.5 align-top"><StatusMark value={task.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingId && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div
            className="abonos-modal"
            style={{ width: 'min(640px, 100%)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p id="checklist-modal-title" className="font-display text-lg font-semibold tracking-tight">
                  {editingId === 'new' ? 'Nueva tarea' : (form.titulo || 'Editar tarea')}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {form.area || 'Sin área'}{form.responsable ? ` · ${form.responsable}` : ''}{form.prioridad ? ` · ${form.prioridad}` : ''}
                </p>
              </div>
              <button type="button" onClick={closePanel} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-soft)]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Tarea *</span>
                <input
                  autoFocus
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className={fieldClass(gapKeys.has('titulo'), 'h-10 w-full px-3')}
                  placeholder="Qué hay que hacer"
                />
              </label>
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Pasos</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, subtasks: [...(form.subtasks || []), emptySubtask()] })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Añadir paso
                  </button>
                </div>
                {(form.subtasks || []).length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Si añades un paso, el texto y la fecha son obligatorios.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(form.subtasks || []).map((step, index) => (
                      <li
                        key={step.id}
                        className="flex items-start gap-2"
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const from = dragStep.current;
                          dragStep.current = null;
                          if (from) moveFormStep(from, step.id);
                        }}
                      >
                        <span
                          draggable
                          onDragStart={(event) => {
                            dragStep.current = step.id;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', step.id);
                          }}
                          onDragEnd={() => {
                            dragStep.current = null;
                          }}
                          className="mt-2 inline-flex cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
                          aria-label="Mover paso"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormSub(step.id, {
                            done: !step.done,
                            completedAt: !step.done ? (step.completedAt || new Date().toISOString()) : null,
                          })}
                          className={`mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.done ? 'border-[var(--success)] bg-[var(--success)] text-white' : 'border-[var(--border-strong)] bg-white'}`}
                          aria-label={step.done ? 'Marcar paso pendiente' : 'Completar paso'}
                        >
                          {step.done ? <Check className="h-2.5 w-2.5" /> : null}
                        </button>
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            value={step.titulo}
                            onChange={(e) => setFormSub(step.id, { titulo: e.target.value })}
                            className={fieldClass(gapKeys.has(`paso-title-${step.id}`), 'h-9 w-full px-2.5')}
                            placeholder={`${index + 1}. Qué hay que hacer *`}
                          />
                          <input
                            type="date"
                            value={step.deadline || ''}
                            onChange={(e) => setFormSub(step.id, { deadline: e.target.value || null })}
                            className={fieldClass(gapKeys.has(`paso-date-${step.id}`), 'h-9 w-full px-2.5 sm:w-40')}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, subtasks: (form.subtasks || []).filter((item) => item.id !== step.id) })}
                          className="mt-1.5 rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--danger)]"
                          aria-label="Quitar paso"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Área *</span>
                  <input
                    list="ck-areas"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className={fieldClass(gapKeys.has('area'), 'h-10 w-full px-3')}
                    placeholder="Organización, Logística…"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Responsable *</span>
                  <input
                    list="ck-owners"
                    value={form.responsable}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                    className={fieldClass(gapKeys.has('responsable'), 'h-10 w-full px-3')}
                    placeholder="Quién lo lleva"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Deadline *</span>
                  <input
                    type="date"
                    value={form.deadline || ''}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
                    className={fieldClass(gapKeys.has('deadline'), 'h-10 w-full px-3')}
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Estado *</span>
                  <StatusSelect
                    full
                    value={form.estado}
                    onChange={(estado) => setForm({
                      ...form,
                      estado,
                      completedAt: estado === 'Completado' ? (form.completedAt || new Date().toISOString()) : null,
                    })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Prioridad *</span>
                <div className="flex flex-wrap gap-2">
                  {CHECKLIST_PRIORITIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setForm({ ...form, prioridad: item })}
                      className={`rounded-md border px-3 py-1.5 text-xs ${
                        form.prioridad === item
                          ? item === 'Alta'
                            ? 'border-red-300 bg-[var(--danger-soft)] font-semibold text-[var(--danger)]'
                            : item === 'Baja'
                              ? 'border-[var(--border-strong)] bg-[var(--bg-soft)] font-semibold'
                              : 'border-amber-300 bg-amber-50 font-semibold text-[var(--warning)]'
                          : 'border-[var(--border)] bg-white'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Comentarios</span>
                <textarea
                  value={form.comentarios}
                  onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                  placeholder="Notas, menús, alergias, lo que falte…"
                />
              </label>
              {formGaps.length > 0 ? (
                <p className="text-sm text-[var(--danger)]">
                  Rellena estos campos: {joinEs(formGaps.map((item) => item.label))}.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveForm}
                  className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Guardar
                </button>
                <button type="button" onClick={closePanel} className="rounded-md px-4 py-2 text-sm text-[var(--text-secondary)]">
                  Cancelar
                </button>
                {editingId !== 'new' && (
                  <button type="button" onClick={removeEditing} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm text-[var(--danger)]">
                    <Trash2 className="h-4 w-4" /> Quitar
                  </button>
                )}
              </div>
            </div>
            <datalist id="ck-areas">{areas.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="ck-owners">{owners.map((item) => <option key={item} value={item} />)}</datalist>
          </div>
        </div>
      )}
    </div>
  );
}
