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
  emptyTask,
  ensureWindowSeries,
  occurrenceDates,
  expandRepeatingTask,
  expireOverdueSeries,
  firstWorkingDayOnOrAfter,
  formatIsoDate,
  groupByArea,
  mergeImportedTasks,
  nextOccurrence,
  repeatLabel,
  sortByDeadline,
  spawnNextOccurrence,
  todayIso,
  toggleTask,
  uniqueValues,
  upcomingTasks,
  type ChecklistRepeat,
  type ChecklistState,
  type ChecklistStatus,
  type ChecklistTask,
} from '@/lib/checklist-model';
import { checklistToAoa, parseChecklistSheet, pickChecklistRows } from '@/lib/checklist-excel';
import { loadChecklistState, saveChecklistState, type ChecklistBackend } from '@/lib/checklist-store';
import { Check, ChevronDown, ChevronUp, Clock, Download, Plus, Search, Trash2, X } from 'lucide-react';

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
  { id: 'tablero', label: 'Tablero' },
  { id: 'tabla', label: 'Tabla' },
  { id: 'importar', label: 'Importar' },
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

function deadlineTone(task: ChecklistTask, today: string): string {
  if (task.estado === 'Completado' || task.estado === 'Caducada' || !task.deadline) return 'text-[var(--text-muted)]';
  if (task.deadline < today) return 'text-[var(--danger)]';
  const days = daysUntil(task.deadline, today);
  if (days != null && days <= 3) return 'text-[var(--warning)]';
  return 'text-[var(--text-secondary)]';
}

function dueLabel(task: ChecklistTask, today: string): string {
  if (task.estado === 'Completado' || task.estado === 'Caducada' || !task.deadline) return '';
  const days = daysUntil(task.deadline, today);
  if (days == null) return '';
  if (days === 0) return 'hoy';
  if (days > 0) return `${days}d`;
  return `${Math.abs(days)}d tarde`;
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
  const [tab, setTab] = useState<TabId>('tablero');
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
  const [deadlineDir, setDeadlineDir] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ChecklistTask>(() => emptyTask());
  const [repeatFor, setRepeatFor] = useState<RepeatFor>('onComplete');
  const [spawnAsk, setSpawnAsk] = useState<ChecklistTask | null>(null);
  const today = todayIso();
  const stateRef = useRef<ChecklistState | null>(null);

  const persist = useCallback(async (next: ChecklistState, currentBackend: ChecklistBackend) => {
    const filled = ensureWindowSeries(next.tasks, todayIso());
    const expired = expireOverdueSeries(filled, todayIso());
    const cleaned = { ...next, tasks: expired.tasks };
    stateRef.current = cleaned;
    setState(cleaned);
    setError(null);
    if (expired.expired > 0) {
      setAck(expired.expired === 1
        ? '1 tarea ha caducado: el periodo se ha acabado.'
        : `${expired.expired} tareas han caducado: el periodo se ha acabado.`);
    }
    try {
      await saveChecklistState(cleaned, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadChecklistState()
      .then((result) => {
        if (cancelled) return;
        const filled = ensureWindowSeries(result.state.tasks, todayIso());
        const expired = expireOverdueSeries(filled, todayIso());
        const next = { ...result.state, tasks: expired.tasks };
        const changed = filled.length !== result.state.tasks.length || expired.expired > 0;
        stateRef.current = next;
        setState(next);
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
        if (expired.expired > 0) {
          setAck(expired.expired === 1
            ? '1 tarea ha caducado: el periodo se ha acabado.'
            : `${expired.expired} tareas han caducado: el periodo se ha acabado.`);
        }
        if (changed) void saveChecklistState(next, result.backend);
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
        if (item.estado === 'Completado' || item.estado === 'Caducada' || !item.deadline || item.deadline >= today) return false;
      }
      if (q) {
        const hay = `${item.area} ${item.titulo} ${item.responsable} ${item.comentarios}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterArea, filterOwner, filterStatus, onlyOverdue, query, tasks, today]);
  const groups = useMemo(() => groupByArea(filtered), [filtered]);
  const tableRows = useMemo(() => sortByDeadline(filtered, deadlineDir), [deadlineDir, filtered]);
  const upcoming = useMemo(() => upcomingTasks(tasks, today), [tasks, today]);

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
    setForm({ ...task });
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
    if (!titulo) return;
    const current = stateRef.current;
    if (!current) return;
    const repeating = form.repeat !== 'none';
    const askOnComplete = repeating && repeatFor === 'onComplete';
    const nextTask: ChecklistTask = {
      ...form,
      titulo,
      area: form.area.trim(),
      responsable: form.responsable.trim(),
      comentarios: form.comentarios.trim(),
      deadline: form.deadline || (repeating ? firstWorkingDayOnOrAfter(today) : null),
      completedAt: form.estado === 'Completado' ? (form.completedAt || new Date().toISOString()) : null,
      repeat: form.repeat,
      askOnComplete,
      repeatUntil: repeating && !askOnComplete ? (form.repeatUntil || addMonthsIso(today, 1)) : null,
      seriesId: repeating ? (form.seriesId || form.id) : null,
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

  if (!state) {
    return <p className="p-6 text-sm text-[var(--text-secondary)]">Cargando checklist…</p>;
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
      {ack && (
        <div className="rounded-lg border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {ack}
        </div>
      )}

      {(tab === 'tablero' || tab === 'tabla') && (
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
                  const days = daysUntil(item.deadline, today);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openTask(item)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-left hover:border-[var(--border-strong)]"
                    >
                      <p className="truncate text-xs font-medium">{item.titulo}</p>
                      <p className={`mt-1 text-[11px] ${deadlineTone(item, today)}`}>
                        {formatIsoDate(item.deadline)}
                        {days != null ? ` · ${days === 0 ? 'hoy' : days > 0 ? `${days}d` : `${Math.abs(days)}d tarde`}` : ''}
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
                onClick={() => downloadAoa(checklistToAoa(state.nombre, state.fechaEvento, state.tasks), 'checklist.xlsx')}
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
                    {group.tasks.filter((item) => item.estado === 'Completado').length}/{group.tasks.length} · por deadline
                  </p>
                </div>
                <ul>
                  {group.tasks.map((task) => {
                    const due = dueLabel(task, today);
                    return (
                      <li key={task.id} className="grid gap-2 border-t border-[var(--border)] px-3 py-3 sm:grid-cols-[auto_1fr] sm:items-start">
                        <button
                          type="button"
                          onClick={() => markDone(task)}
                          disabled={task.estado === 'Caducada'}
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${task.estado === 'Completado' ? 'border-[var(--success)] bg-[var(--success)] text-white' : task.estado === 'Caducada' ? 'border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-muted)]' : 'border-[var(--border-strong)]'}`}
                          aria-label={task.estado === 'Completado' ? 'Marcar pendiente' : 'Completar'}
                        >
                          {task.estado === 'Completado' ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <button type="button" onClick={() => openTask(task)} className="min-w-0 space-y-1 text-left">
                          <p className={`text-sm ${task.estado === 'Completado' || task.estado === 'Caducada' ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}>{task.titulo}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                            <span className={deadlineTone(task, today)}>
                              <Clock className="mr-1 inline h-3 w-3" />
                              {formatIsoDate(task.deadline)}{due ? ` · ${due}` : ''}
                            </span>
                            {task.responsable ? <span>{task.responsable}</span> : null}
                            <span>{task.estado}</span>
                            {repeatLabel(task) ? <span>{repeatLabel(task)}</span> : null}
                          </div>
                          {task.comentarios ? <p className="text-xs text-[var(--text-muted)]">{task.comentarios}</p> : null}
                        </button>
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
                <table className="min-w-[860px] w-full text-left text-sm">
                  <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-2 py-2 font-semibold">Área</th>
                      <th className="px-2 py-2 font-semibold">Tarea</th>
                      <th className="px-2 py-2 font-semibold">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => setDeadlineDir((value) => (value === 'asc' ? 'desc' : 'asc'))}
                        >
                          Deadline
                          {deadlineDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </th>
                      <th className="px-2 py-2 font-semibold">Responsable</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 font-semibold">Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((task) => {
                      const due = dueLabel(task, today);
                      return (
                        <tr
                          key={task.id}
                          className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-soft)] ${task.estado === 'Completado' || task.estado === 'Caducada' ? 'bg-[var(--bg-secondary)]' : ''}`}
                          onClick={() => openTask(task)}
                        >
                          <td className="px-3 py-2 align-middle" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => markDone(task)}
                              disabled={task.estado === 'Caducada'}
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${task.estado === 'Completado' ? 'border-[var(--success)] bg-[var(--success)] text-white' : task.estado === 'Caducada' ? 'border-[var(--border)] bg-[var(--bg-soft)]' : 'border-[var(--border-strong)]'}`}
                              aria-label={task.estado === 'Completado' ? 'Marcar pendiente' : 'Completar'}
                            >
                              {task.estado === 'Completado' ? <Check className="h-3 w-3" /> : null}
                            </button>
                          </td>
                          <td className="px-2 py-2 align-middle text-[var(--text-secondary)]">{task.area || '—'}</td>
                          <td className={`px-2 py-2 align-middle ${task.estado === 'Completado' || task.estado === 'Caducada' ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}>{task.titulo}</td>
                          <td className={`px-2 py-2 align-middle ${deadlineTone(task, today)}`}>
                            {formatIsoDate(task.deadline)}{due ? ` · ${due}` : ''}
                            {repeatLabel(task) ? <span className="block text-[11px] text-[var(--text-muted)]">{repeatLabel(task)}</span> : null}
                          </td>
                          <td className="px-2 py-2 align-middle">{task.responsable || '—'}</td>
                          <td className="px-2 py-2 align-middle">{task.estado}</td>
                          <td className="max-w-[16rem] truncate px-2 py-2 align-middle text-xs text-[var(--text-secondary)]">{task.comentarios || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'importar' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Sube un Excel con Área, Tarea, Deadline, Responsable, Estado y Comentarios. Si la tarea ya existe, se actualiza. El de la convención vale tal cual.
          </p>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
            Sustituir el checklist actual (no fusionar)
          </label>
          <FileUpload
            inputId="checklist-import"
            label="Excel del checklist"
            hint="Vale el de la convención o el que descargues desde Tablero."
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
              }, backend);
              setAck(replaceAll
                ? `Checklist sustituido: ${parsed.tasks.length} tareas.`
                : `${result.added} nuevas y ${result.updated} actualizadas.`);
              setTab('tablero');
            }}
          />
        </div>
      )}

      {editingId && (
        <div className="abonos-modal-backdrop" onClick={closePanel}>
          <div
            className="abonos-modal"
            style={{ width: 'min(560px, 100%)' }}
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
                <span className="text-xs font-medium text-[var(--text-secondary)]">Tarea</span>
                <input
                  autoFocus
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                  placeholder="Qué hay que hacer"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Área</span>
                  <input
                    list="ck-areas"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    placeholder="Organización, Logística…"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Responsable</span>
                  <input
                    list="ck-owners"
                    value={form.responsable}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                    placeholder="Quién lo lleva"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Deadline</span>
                  <input
                    type="date"
                    value={form.deadline || ''}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Estado</span>
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
                {form.repeat !== 'none' && (
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
                )}
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
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveForm}
                  disabled={!form.titulo.trim()}
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
