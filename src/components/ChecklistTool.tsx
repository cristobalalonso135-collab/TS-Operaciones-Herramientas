'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  CHECKLIST_STATUSES,
  addMonthsIso,
  addDaysIso,
  checklistKpis,
  completeChecklistTask,
  daysUntil,
  cloneChecklist,
  emptyChecklist,
  emptyTask,
  emptySubtask,
  ensureWindowSeries,
  occurrenceDates,
  expandRepeatingTask,
  expireOverdueSeries,
  firstWorkingDayOnOrAfter,
  formatIsoDate,
  groupByArea,
  isClosed,
  isTaskOverdue,
  mergeImportedTasks,
  moveById,
  nextOccurrence,
  repeatLabel,
  sortByDeadline,
  spawnNextOccurrence,
  subtaskProgress,
  todayIso,
  toggleSubtask,
  toggleTask,
  uniqueValues,
  upcomingTasks,
  effectiveDeadline,
  type ChecklistLibrary,
  type ChecklistRepeat,
  type ChecklistState,
  type ChecklistStatus,
  type ChecklistSubtask,
  type ChecklistTask,
} from '@/lib/checklist-model';
import { checklistToAoa, parseChecklistSheet, pickChecklistRows } from '@/lib/checklist-excel';
import { loadChecklistLibrary, saveChecklistLibrary, type ChecklistBackend } from '@/lib/checklist-store';
import { Check, ChevronDown, ChevronUp, Clock, Copy, Download, GripVertical, Plus, Search, Trash2, X } from 'lucide-react';

type RepeatFor = 'onComplete' | 'week' | 'month' | '2months' | 'quarter' | 'until';

function untilFrom(kind: RepeatFor, today: string, current: string | null): string | null {
  if (kind === 'onComplete') return null;
  if (kind === 'week') return addDaysIso(today, 7);
  if (kind === 'month') return addMonthsIso(today, 1);
  if (kind === '2months') return addMonthsIso(today, 2);
  if (kind === 'quarter') return addMonthsIso(today, 3);
  return current;
}

const TABS = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'tablero', label: 'Tablero' },
  { id: 'enviar', label: 'Semanal' },
  { id: 'importar', label: 'Excel' },
] as const;
type TabId = (typeof TABS)[number]['id'];

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

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const target = Date.parse(`${iso}T09:00:00`);
  if (!Number.isFinite(target)) return <p className="text-sm text-[var(--text-muted)]">Pon una fecha de evento.</p>;
  const diff = target - now;
  const past = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {past ? 'Desde el evento' : 'Cuenta atrás'}
      </p>
      <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${past ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
        {days}<span className="text-lg font-medium text-[var(--text-secondary)]">d</span>
        {' '}{hours}<span className="text-lg font-medium text-[var(--text-secondary)]">h</span>
        {' '}{minutes}<span className="text-lg font-medium text-[var(--text-secondary)]">m</span>
      </p>
    </div>
  );
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

export default function ChecklistTool({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>('tabla');
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
  const [replaceAll, setReplaceAll] = useState(false);
  const [sort, setSort] = useState<{ key: 'deadline' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const dragRow = useRef<string | null>(null);
  const dragStep = useRef<string | null>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ChecklistTask>(() => emptyTask());
  const [repeatFor, setRepeatFor] = useState<RepeatFor>('onComplete');
  const [spawnAsk, setSpawnAsk] = useState<ChecklistTask | null>(null);
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

  const persist = useCallback(async (next: ChecklistState, currentBackend: ChecklistBackend) => {
    const filled = ensureWindowSeries(next.tasks, todayIso());
    const expired = expireOverdueSeries(filled, todayIso());
    const cleaned = { ...next, tasks: expired.tasks };
    const lib = libraryRef.current;
    const lists = lib
      ? (lib.lists.some((item) => item.id === cleaned.id)
        ? lib.lists.map((item) => (item.id === cleaned.id ? cleaned : item))
        : [...lib.lists, cleaned])
      : [cleaned];
    const nextLib = { lists };
    libraryRef.current = nextLib;
    stateRef.current = cleaned;
    setLibrary(nextLib);
    setState(cleaned);
    setError(null);
    if (expired.expired > 0) {
      setAck(expired.expired === 1
        ? '1 tarea ha caducado: el periodo se ha acabado.'
        : `${expired.expired} tareas han caducado: el periodo se ha acabado.`);
    }
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
        let expiredCount = 0;
        const lists = result.library.lists.map((board) => {
          const filled = ensureWindowSeries(board.tasks, todayIso());
          const expired = expireOverdueSeries(filled, todayIso());
          expiredCount += expired.expired;
          return { ...board, tasks: expired.tasks };
        });
        const nextLib = { lists };
        const changed = result.migrated || lists.some((board, index) => board.tasks.length !== result.library.lists[index].tasks.length) || expiredCount > 0;
        libraryRef.current = nextLib;
        setLibrary(nextLib);
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
        if (expiredCount > 0) {
          setAck(expiredCount === 1
            ? '1 tarea ha caducado: el periodo se ha acabado.'
            : `${expiredCount} tareas han caducado: el periodo se ha acabado.`);
        }
        if (changed) void saveChecklistLibrary(nextLib, result.backend);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No he podido cargar el checklist.');
      });
    return () => { cancelled = true; };
  }, []);

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
      if (onlyOverdue) {
        if (!isTaskOverdue(item, today)) return false;
      }
      if (q) {
        const hay = `${item.area} ${item.titulo} ${item.responsable} ${item.comentarios} ${(item.subtasks || []).map((step) => step.titulo).join(' ')}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterArea, filterOwner, filterStatus, onlyOverdue, query, tasks, today]);
  const groups = useMemo(() => groupByArea(filtered), [filtered]);
  const tableRows = useMemo(() => {
    if (sort.key !== 'deadline') return filtered;
    return sortByDeadline(filtered, sort.dir);
  }, [filtered, sort]);
  const upcoming = useMemo(() => upcomingTasks(tasks, today), [tasks, today]);
  const weeklyGroups = useMemo(() => {
    const open = filtered.filter((item) => !isClosed(item));
    const order: string[] = [];
    const map = new Map<string, ChecklistTask[]>();
    open.forEach((item) => {
      const owner = item.responsable.trim() || 'Sin responsable';
      if (!map.has(owner)) {
        map.set(owner, []);
        order.push(owner);
      }
      map.get(owner)!.push(item);
    });
    return order.map((owner) => ({ owner, tasks: map.get(owner) || [] }));
  }, [filtered]);
  const formReady = Boolean(
    form.titulo.trim()
    && form.area.trim()
    && form.responsable.trim()
    && form.deadline
    && !(form.subtasks || []).filter((item) => item.titulo.trim()).some((item) => !item.deadline),
  );

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
    setForm({ ...task, subtasks: (task.subtasks || []).map((item) => ({ ...item })) });
    setRepeatFor(task.askOnComplete || !task.repeatUntil ? 'onComplete' : 'until');
    setEditingId(task.id);
  };

  const openNew = () => {
    setForm(emptyTask());
    setRepeatFor('onComplete');
    setEditingId('new');
  };

  const closePanel = () => {
    setEditingId(null);
  };

  const openBoard = (id: string) => {
    const board = libraryRef.current?.lists.find((item) => item.id === id);
    if (!board) return;
    setOpenId(id);
    setTab('tabla');
    setQuery('');
    setFilterArea('');
    setFilterOwner('');
    setFilterStatus('');
    setOnlyOverdue(false);
    setSort({ key: null, dir: 'asc' });
    stateRef.current = board;
    setState(board);
  };

  const closeBoard = () => {
    setOpenId(null);
    setEditingId(null);
    setSpawnAsk(null);
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
    setTab('tabla');
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
    setTab('tabla');
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
    const result = completeChecklistTask(task, current.tasks, today);
    void persist({ ...current, tasks: result.tasks }, backend);
    if (task.askOnComplete) {
      const nextDate = nextOccurrence(task, today);
      const seriesId = task.seriesId || task.id;
      const exists = nextDate && result.tasks.some((item) => (
        (item.seriesId || item.id) === seriesId && item.deadline === nextDate
      ));
      if (nextDate && !exists) setSpawnAsk({ ...task, estado: 'Completado' });
    }
  };

  const markSub = (task: ChecklistTask, subId: string) => {
    patchTask(task.id, toggleSubtask(task, subId));
  };

  const setFormSub = (id: string, update: Partial<ChecklistSubtask>) => {
    setForm({
      ...form,
      subtasks: (form.subtasks || []).map((item) => (item.id === id ? { ...item, ...update } : item)),
    });
  };

  const moveTask = (fromId: string, toId: string) => {
    const current = stateRef.current;
    if (!current) return;
    const tasks = moveById(current.tasks, fromId, toId);
    if (tasks === current.tasks) return;
    setSort({ key: null, dir: 'asc' });
    void persist({ ...current, tasks }, backend);
  };

  const moveFormStep = (fromId: string, toId: string) => {
    setForm({ ...form, subtasks: moveById(form.subtasks || [], fromId, toId) });
  };

  const confirmSpawn = (yes: boolean) => {
    const source = spawnAsk;
    setSpawnAsk(null);
    if (!yes || !source) return;
    const current = stateRef.current;
    if (!current) return;
    const result = spawnNextOccurrence(source, current.tasks, today);
    if (result.spawned) void persist({ ...current, tasks: result.tasks }, backend);
  };

  const applyRepeat = (repeat: ChecklistRepeat) => {
    if (repeat === 'none') {
      setForm({ ...form, repeat, repeatUntil: null, seriesId: null, askOnComplete: false });
      setRepeatFor('onComplete');
      return;
    }
    const ask = repeatFor === 'onComplete';
    setForm({
      ...form,
      repeat,
      askOnComplete: ask,
      repeatUntil: ask ? null : (form.repeatUntil || addMonthsIso(today, 1)),
      seriesId: form.seriesId || form.id,
      deadline: form.deadline || firstWorkingDayOnOrAfter(today),
    });
  };

  const applyRepeatFor = (kind: RepeatFor) => {
    const until = untilFrom(kind, today, form.repeatUntil);
    setRepeatFor(kind);
    setForm({
      ...form,
      askOnComplete: kind === 'onComplete',
      repeatUntil: until,
      seriesId: form.seriesId || form.id,
      deadline: form.deadline || firstWorkingDayOnOrAfter(today),
    });
  };

  const saveForm = () => {
    const titulo = form.titulo.trim();
    const area = form.area.trim();
    const responsable = form.responsable.trim();
    if (!titulo || !area || !responsable || !form.deadline) return;
    const pendingSteps = (form.subtasks || []).filter((item) => item.titulo.trim());
    if (pendingSteps.some((item) => !item.deadline)) return;
    const current = stateRef.current;
    if (!current) return;
    const repeating = editingId !== 'new' && form.repeat !== 'none';
    const askOnComplete = repeating && repeatFor === 'onComplete';
    const nextTask: ChecklistTask = {
      ...form,
      titulo,
      area,
      responsable,
      comentarios: form.comentarios.trim(),
      deadline: form.deadline,
      completedAt: form.estado === 'Completado' ? (form.completedAt || new Date().toISOString()) : null,
      repeat: repeating ? form.repeat : 'none',
      askOnComplete,
      repeatUntil: repeating && !askOnComplete ? (form.repeatUntil || addMonthsIso(today, 1)) : null,
      seriesId: repeating ? (form.seriesId || form.id) : null,
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
    const created = editingId === 'new' && !askOnComplete
      ? expandRepeatingTask(nextTask, today)
      : [nextTask];
    let tasks = editingId === 'new'
      ? [...current.tasks, ...created]
      : current.tasks.map((item) => (item.id === editingId ? { ...item, ...nextTask, id: item.id } : item));
    const saved = tasks.find((item) => item.id === nextTask.id) || nextTask;
    if (saved.estado === 'Completado' && previous?.estado !== 'Completado') {
      const result = completeChecklistTask({ ...saved, estado: 'Pendiente' }, tasks, today);
      tasks = result.tasks;
      if (saved.askOnComplete) {
        const nextDate = nextOccurrence(saved, today);
        if (nextDate) setSpawnAsk({ ...saved, estado: 'Completado' });
      }
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
        tabs={[...TABS]}
        active={tab}
        onSelect={(id) => setTab(id as TabId)}
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

      {(tab === 'tablero' || tab === 'tabla' || tab === 'enviar') && (
        <div className="space-y-4">
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
                    onChange={(e) => void persist({ ...state, fechaEvento: e.target.value }, backend)}
                    className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <Countdown iso={state.fechaEvento} />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]">
              <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${Math.round(kpis.share * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {formatShare(kpis.done, kpis.total)} completado
              {kpis.expired > 0 ? ` · ${kpis.expired} caducada${kpis.expired === 1 ? '' : 's'}` : ''}
            </p>
            {upcoming.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {upcoming.map((item) => {
                  const nearest = effectiveDeadline(item);
                  const closed = item.estado === 'Completado' || item.estado === 'Caducada';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openTask(item)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-left hover:border-[var(--border-strong)]"
                    >
                      <p className="truncate text-xs font-medium">{item.titulo}</p>
                      <p className="mt-1 text-[11px]">
                        <DeadlineMark iso={nearest} today={today} closed={closed} />
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Tareas" value={kpis.total} />
            <Kpi label="Hechas" value={kpis.done} hint={formatShare(kpis.done, kpis.total)} />
            <Kpi label="Abiertas" value={kpis.open} />
            <button type="button" onClick={() => setOnlyOverdue((value) => !value)} className="text-left">
              <Kpi label="Vencidas" value={kpis.overdue} danger={kpis.overdue > 0} hint={onlyOverdue ? 'Filtro activo' : 'Pincha para filtrar'} />
            </button>
            <Kpi label="Bloqueadas" value={kpis.blocked} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-[var(--text-muted)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-9 w-48 rounded-md border border-[var(--border)] bg-white pl-8 pr-3 text-sm" />
            </div>
            <FilterSelect value={filterArea} onChange={setFilterArea} label="Área" options={areas} />
            <FilterSelect value={filterOwner} onChange={setFilterOwner} label="Responsable" options={owners} />
            <FilterSelect value={filterStatus} onChange={(value) => setFilterStatus(value as ChecklistStatus | '')} label="Estado" options={[...CHECKLIST_STATUSES]} />
            {(query || filterArea || filterOwner || filterStatus || onlyOverdue) ? (
              <button type="button" className="h-9 rounded-md border border-[var(--border)] px-3 text-xs" onClick={() => { setQuery(''); setFilterArea(''); setFilterOwner(''); setFilterStatus(''); setOnlyOverdue(false); }}>Quitar filtros</button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
                onClick={() => downloadAoa(checklistToAoa(state.nombre, state.fechaEvento, state.tasks), `${state.nombre || 'checklist'}.xlsx`)}
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
                onClick={openNew}
              >
                <Plus className="h-3.5 w-3.5" /> Nueva tarea
              </button>
            </div>
          </div>

          {tab === 'tablero' && (
          <div className="space-y-4">
            {groups.length === 0 && (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-6 text-sm text-[var(--text-muted)]">No hay tareas con este filtro.</p>
            )}
            {groups.map((group) => (
              <section key={group.area} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-soft)] px-4 py-2">
                  <p className="text-sm font-semibold">{group.area}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {group.tasks.filter((item) => item.estado === 'Completado').length}/{group.tasks.length}
                  </p>
                </div>
                <ul>
                  {group.tasks.map((task) => {
                    const progress = subtaskProgress(task);
                    const closed = task.estado === 'Completado' || task.estado === 'Caducada';
                    return (
                      <li
                        key={task.id}
                        className={`grid gap-2 border-t border-[var(--border)] px-3 py-3 sm:grid-cols-[auto_auto_1fr] sm:items-start ${dropRow === task.id ? 'bg-[var(--bg-soft)]' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDropRow(task.id);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const from = dragRow.current;
                          dragRow.current = null;
                          setDropRow(null);
                          if (from) moveTask(from, task.id);
                        }}
                        onDragLeave={() => {
                          if (dropRow === task.id) setDropRow(null);
                        }}
                      >
                        <span
                          draggable
                          onDragStart={(event) => {
                            dragRow.current = task.id;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', task.id);
                          }}
                          onDragEnd={() => {
                            dragRow.current = null;
                            setDropRow(null);
                          }}
                          className="mt-1 inline-flex cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
                          aria-label="Mover tarea"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => markDone(task)}
                          disabled={task.estado === 'Caducada'}
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${task.estado === 'Completado' ? 'border-[var(--success)] bg-[var(--success)] text-white' : task.estado === 'Caducada' ? 'border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-muted)]' : 'border-[var(--border-strong)]'}`}
                          aria-label={task.estado === 'Completado' ? 'Marcar pendiente' : 'Completar'}
                        >
                          {task.estado === 'Completado' ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <div className="min-w-0 space-y-2">
                          <button type="button" onClick={() => openTask(task)} className="min-w-0 space-y-1 text-left">
                            <p className={`text-sm ${task.estado === 'Completado' || task.estado === 'Caducada' ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}>{task.titulo}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                                <DeadlineMark
                                  iso={task.deadline || (progress.total > 0 ? effectiveDeadline(task) : null)}
                                  today={today}
                                  closed={closed}
                                />
                              </span>
                              {task.responsable ? <span>{task.responsable}</span> : null}
                              <span>{task.estado}</span>
                              {progress.total > 0 ? <span>{progress.done}/{progress.total} pasos</span> : null}
                              {repeatLabel(task) ? <span>{repeatLabel(task)}</span> : null}
                            </div>
                            {task.comentarios ? <p className="text-xs text-[var(--text-muted)]">{task.comentarios}</p> : null}
                          </button>
                          {progress.total > 0 && (
                            <ul className="space-y-1.5 border-l border-[var(--border)] pl-3">
                              {task.subtasks.map((step) => {
                                return (
                                  <li key={step.id} className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      onClick={() => markSub(task, step.id)}
                                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.done ? 'border-[var(--success)] bg-[var(--success)] text-white' : 'border-[var(--border-strong)]'}`}
                                      aria-label={step.done ? 'Marcar paso pendiente' : 'Completar paso'}
                                    >
                                      {step.done ? <Check className="h-2.5 w-2.5" /> : null}
                                    </button>
                                    <button type="button" onClick={() => openTask(task)} className="min-w-0 text-left">
                                      <p className={`text-xs ${step.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{step.titulo}</p>
                                      {step.deadline ? (
                                        <p className="mt-0.5 text-[11px]">
                                          <DeadlineMark iso={step.deadline} today={today} closed={step.done} />
                                        </p>
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          )}

          {tab === 'tabla' && (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              {tableRows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--text-muted)]">No hay tareas con este filtro.</p>
              ) : (
                <table className="min-w-[920px] w-full text-left text-sm">
                  <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>
                      <th className="w-14 px-3 py-2" />
                      <th className="px-3 py-2 font-semibold">Área</th>
                      <th className="px-3 py-2 font-semibold">Tarea</th>
                      <th className="px-3 py-2 font-semibold">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => setSort((current) => (
                            current.key === 'deadline'
                              ? { key: 'deadline', dir: current.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: 'deadline', dir: 'asc' }
                          ))}
                        >
                          Deadline
                          {sort.key === 'deadline' ? (
                            sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold">Responsable</th>
                      <th className="px-3 py-2 font-semibold">Estado</th>
                      <th className="px-3 py-2 font-semibold">Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((task) => {
                      const progress = subtaskProgress(task);
                      const closed = task.estado === 'Completado' || task.estado === 'Caducada';
                      return (
                        <tr
                          key={task.id}
                          className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-soft)] ${dropRow === task.id ? 'bg-[var(--bg-soft)]' : ''} ${closed ? 'bg-[var(--bg-secondary)]' : ''}`}
                          onClick={() => openTask(task)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropRow(task.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const from = dragRow.current;
                            dragRow.current = null;
                            setDropRow(null);
                            if (from) moveTask(from, task.id);
                          }}
                          onDragLeave={() => {
                            if (dropRow === task.id) setDropRow(null);
                          }}
                        >
                          <td className="px-3 py-2.5 align-middle" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <span
                                draggable
                                onDragStart={(event) => {
                                  dragRow.current = task.id;
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', task.id);
                                }}
                                onDragEnd={() => {
                                  dragRow.current = null;
                                  setDropRow(null);
                                }}
                                className="inline-flex cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
                                aria-label="Mover tarea"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                              <button
                                type="button"
                                onClick={() => markDone(task)}
                                disabled={task.estado === 'Caducada'}
                                className={`flex h-5 w-5 items-center justify-center rounded-full border ${task.estado === 'Completado' ? 'border-[var(--success)] bg-[var(--success)] text-white' : task.estado === 'Caducada' ? 'border-[var(--border)] bg-[var(--bg-soft)]' : 'border-[var(--border-strong)]'}`}
                                aria-label={task.estado === 'Completado' ? 'Marcar pendiente' : 'Completar'}
                              >
                                {task.estado === 'Completado' ? <Check className="h-3 w-3" /> : null}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-middle text-[var(--text-secondary)]">{task.area || '—'}</td>
                          <td className={`px-3 py-2.5 align-middle ${closed ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}>
                            {task.titulo}
                            {progress.total > 0 ? (
                              <span className="mt-0.5 block text-[11px] font-normal text-[var(--text-muted)] no-underline">
                                {progress.done}/{progress.total} pasos
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 align-middle">
                            <DeadlineMark iso={task.deadline || effectiveDeadline(task)} today={today} closed={closed} />
                            {repeatLabel(task) ? <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{repeatLabel(task)}</span> : null}
                          </td>
                          <td className="px-3 py-2.5 align-middle">{task.responsable || '—'}</td>
                          <td className="px-3 py-2.5 align-middle">{task.estado}</td>
                          <td className="max-w-[16rem] truncate px-3 py-2.5 align-middle text-xs text-[var(--text-secondary)]">{task.comentarios || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'enviar' && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Solo pendientes, agrupados por persona. Más corto que la tabla, para mandar el debe de la semana.
              </p>
              {weeklyGroups.length === 0 ? (
                <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-6 text-sm text-[var(--text-muted)]">No hay pendientes con este filtro.</p>
              ) : (
                weeklyGroups.map((group) => (
                  <section key={group.owner} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-soft)] px-4 py-1.5">
                      <p className="text-sm font-semibold">{group.owner}</p>
                      <p className="text-xs text-[var(--text-muted)]">{group.tasks.length} pendiente{group.tasks.length === 1 ? '' : 's'}</p>
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-3 py-1.5 font-semibold">Tarea</th>
                          <th className="w-40 px-3 py-1.5 font-semibold">Deadline</th>
                          <th className="w-36 px-3 py-1.5 font-semibold">Área</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.tasks.map((task) => {
                          const openSteps = (task.subtasks || []).filter((step) => !step.done);
                          return (
                            <tr
                              key={task.id}
                              className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-soft)]"
                              onClick={() => openTask(task)}
                            >
                              <td className="px-3 py-1.5 align-top font-medium">
                                {task.titulo}
                                {openSteps.length > 0 ? (
                                  <span className="mt-0.5 block text-[11px] font-normal text-[var(--text-muted)]">
                                    {openSteps.map((step) => step.titulo).join(' · ')}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-1.5 align-top">
                                <DeadlineMark iso={task.deadline || effectiveDeadline(task)} today={today} />
                              </td>
                              <td className="px-3 py-1.5 align-top text-[var(--text-secondary)]">{task.area || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'importar' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Exporta o importa el checklist entero: tareas, pasos, fechas, estados y responsables. Si la tarea ya existe, se actualiza.
          </p>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"
            onClick={() => downloadAoa(checklistToAoa(state.nombre, state.fechaEvento, state.tasks), `${state.nombre || 'checklist'}.xlsx`)}
          >
            <Download className="h-3.5 w-3.5" /> Descargar Excel
          </button>
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
            onWorkbookLoaded={(sheets) => {
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
              setTab('tabla');
            }}
          />
        </div>
      )}

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
                  {form.area || 'Sin área'}{form.responsable ? ` · ${form.responsable}` : ''}
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
                  className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
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
                            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2.5 text-sm"
                            placeholder={`${index + 1}. Qué hay que hacer *`}
                          />
                          <input
                            type="date"
                            required
                            value={step.deadline || ''}
                            onChange={(e) => setFormSub(step.id, { deadline: e.target.value || null })}
                            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2.5 text-sm sm:w-40"
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
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    placeholder="Organización, Logística…"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Responsable *</span>
                  <input
                    list="ck-owners"
                    value={form.responsable}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    placeholder="Quién lo lleva"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Deadline *</span>
                  <input
                    type="date"
                    value={form.deadline || ''}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
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
              {editingId !== 'new' && form.repeat !== 'none' ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Periodicidad</span>
                  <select
                    value={form.repeat}
                    onChange={(e) => applyRepeat(e.target.value as ChecklistRepeat)}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                  >
                    <option value="none">No se repite</option>
                    <option value="weekdays">Cada día laborable (Zaragoza)</option>
                    <option value="weekly">Cada semana</option>
                  </select>
                </label>
                <>
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Hasta cuándo</span>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['onComplete', 'Al completar'],
                          ['week', '1 semana'],
                          ['month', '1 mes'],
                          ['2months', '2 meses'],
                          ['quarter', '3 meses'],
                        ] as Array<[RepeatFor, string]>).map(([kind, label]) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => applyRepeatFor(kind)}
                            className={`rounded-md border px-2.5 py-1 text-xs ${repeatFor === kind ? 'border-[var(--text-primary)] bg-white font-semibold' : 'border-[var(--border)] bg-white'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {repeatFor === 'onComplete' ? (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Al marcarla hecha te preguntará si quieres la siguiente.
                      </p>
                    ) : (
                      <>
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">Hasta</span>
                          <input
                            type="date"
                            value={form.repeatUntil || ''}
                            onChange={(e) => {
                              setRepeatFor('until');
                              setForm({ ...form, askOnComplete: false, repeatUntil: e.target.value || null });
                            }}
                            className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                          />
                        </label>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {form.repeatUntil
                            ? `${occurrenceDates(form.repeat, form.deadline || firstWorkingDayOnOrAfter(today), form.repeatUntil).length} días. Completas u omites. La última no genera otra.`
                            : 'Completas u omites. La última no genera otra.'}
                        </p>
                      </>
                    )}
                </>
              </div>
              ) : null}
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
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveForm}
                  disabled={!formReady}
                  className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
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
      {spawnAsk && (
        <div className="abonos-modal-backdrop" onClick={() => confirmSpawn(false)}>
          <div
            className="abonos-modal"
            style={{ width: 'min(420px, 100%)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-spawn-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-3 p-5">
              <p id="checklist-spawn-title" className="font-display text-lg font-semibold tracking-tight">
                ¿Crear la siguiente?
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {spawnAsk.titulo} · {formatIsoDate(nextOccurrence(spawnAsk, today))}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => confirmSpawn(true)}
                  className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Crear
                </button>
                <button type="button" onClick={() => confirmSpawn(false)} className="rounded-md px-4 py-2 text-sm text-[var(--text-secondary)]">
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
