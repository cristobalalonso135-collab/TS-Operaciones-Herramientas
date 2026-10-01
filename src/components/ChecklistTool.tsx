'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUpload from '@/components/FileUpload';
import WorkspaceChrome from '@/components/WorkspaceChrome';
import {
  CHECKLIST_STATUSES,
  checklistKpis,
  daysUntil,
  emptyTask,
  formatIsoDate,
  groupByArea,
  mergeImportedTasks,
  todayIso,
  toggleTask,
  uniqueValues,
  upcomingTasks,
  type ChecklistState,
  type ChecklistStatus,
  type ChecklistTask,
} from '@/lib/checklist-model';
import { checklistToAoa, parseChecklistSheet, pickChecklistRows } from '@/lib/checklist-excel';
import { loadChecklistState, saveChecklistState, type ChecklistBackend } from '@/lib/checklist-store';
import { Check, Clock, Download, Plus, Search, Trash2 } from 'lucide-react';

const TABS = [
  { id: 'tablero', label: 'Tablero' },
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
  if (task.estado === 'Completado' || !task.deadline) return 'text-[var(--text-muted)]';
  if (task.deadline < today) return 'text-[var(--danger)]';
  const days = daysUntil(task.deadline, today);
  if (days != null && days <= 3) return 'text-[var(--warning)]';
  return 'text-[var(--text-secondary)]';
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
  const [draft, setDraft] = useState<ChecklistTask>(() => emptyTask());
  const [ack, setAck] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const today = todayIso();
  const stateRef = useRef<ChecklistState | null>(null);

  const persist = useCallback(async (next: ChecklistState, currentBackend: ChecklistBackend) => {
    stateRef.current = next;
    setState(next);
    setError(null);
    try {
      await saveChecklistState(next, currentBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No he podido guardar.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadChecklistState()
      .then((result) => {
        if (cancelled) return;
        stateRef.current = result.state;
        setState(result.state);
        setBackend(result.backend);
        setSetupSql(result.setupSql || null);
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
        if (item.estado === 'Completado' || !item.deadline || item.deadline >= today) return false;
      }
      if (q) {
        const hay = `${item.area} ${item.titulo} ${item.responsable} ${item.comentarios}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterArea, filterOwner, filterStatus, onlyOverdue, query, tasks, today]);
  const groups = useMemo(() => groupByArea(filtered), [filtered]);
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

      {tab === 'tablero' && (
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
            <p className="mt-2 text-xs text-[var(--text-muted)]">{formatShare(kpis.done, kpis.total)} completado</p>
            {upcoming.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {upcoming.map((item) => {
                  const days = daysUntil(item.deadline, today);
                  return (
                    <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2">
                      <p className="truncate text-xs font-medium">{item.titulo}</p>
                      <p className={`mt-1 text-[11px] ${deadlineTone(item, today)}`}>
                        {formatIsoDate(item.deadline)}
                        {days != null ? ` · ${days === 0 ? 'hoy' : days > 0 ? `${days}d` : `${Math.abs(days)}d tarde`}` : ''}
                      </p>
                    </div>
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
            <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm">
              <option value="">Área</option>
              {areas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm">
              <option value="">Responsable</option>
              {owners.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ChecklistStatus | '')} className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm">
              <option value="">Estado</option>
              {CHECKLIST_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {(query || filterArea || filterOwner || filterStatus || onlyOverdue) ? (
              <button type="button" className="h-9 rounded-md border border-[var(--border)] px-3 text-xs" onClick={() => { setQuery(''); setFilterArea(''); setFilterOwner(''); setFilterStatus(''); setOnlyOverdue(false); }}>Quitar filtros</button>
            ) : null}
            <button
              type="button"
              className="ml-auto flex h-9 items-center gap-2 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white"
              onClick={() => downloadAoa(checklistToAoa(state.nombre, state.fechaEvento, state.tasks), 'checklist.xlsx')}
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>

          <form
            className="grid gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-3 sm:grid-cols-[7rem_1fr_8.5rem_8rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.titulo.trim()) return;
              const current = stateRef.current;
              if (!current) return;
              void persist({ ...current, tasks: [...current.tasks, { ...draft, titulo: draft.titulo.trim() }] }, backend);
              setDraft(emptyTask());
            }}
          >
            <input list="ck-areas" placeholder="Área" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm" />
            <input required placeholder="Nueva tarea" value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm" />
            <input type="date" value={draft.deadline || ''} onChange={(e) => setDraft({ ...draft, deadline: e.target.value || null })} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm" />
            <input list="ck-owners" placeholder="Responsable" value={draft.responsable} onChange={(e) => setDraft({ ...draft, responsable: e.target.value })} className="h-9 rounded-md border border-[var(--border)] px-2 text-sm" />
            <button type="submit" className="flex h-9 items-center justify-center gap-1 rounded-md bg-[var(--text-primary)] px-3 text-xs font-semibold text-white">
              <Plus className="h-3.5 w-3.5" /> Añadir
            </button>
            <datalist id="ck-areas">{areas.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="ck-owners">{owners.map((item) => <option key={item} value={item} />)}</datalist>
          </form>

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
                    const days = daysUntil(task.deadline, today);
                    return (
                      <li key={task.id} className="grid gap-2 border-t border-[var(--border)] px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                        <button
                          type="button"
                          onClick={() => patchTask(task.id, toggleTask(task))}
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${task.estado === 'Completado' ? 'border-[var(--success)] bg-[var(--success)] text-white' : 'border-[var(--border-strong)]'}`}
                          aria-label={task.estado === 'Completado' ? 'Marcar pendiente' : 'Completar'}
                        >
                          {task.estado === 'Completado' ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <div className="min-w-0 space-y-1">
                          <input
                            value={task.titulo}
                            onChange={(e) => patchTask(task.id, { titulo: e.target.value }, false)}
                            onBlur={flush}
                            className={`w-full bg-transparent text-sm outline-none ${task.estado === 'Completado' ? 'text-[var(--text-muted)] line-through' : 'font-medium'}`}
                          />
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <label className={`flex items-center gap-1 ${deadlineTone(task, today)}`}>
                              <Clock className="h-3 w-3" />
                              <input
                                type="date"
                                value={task.deadline || ''}
                                onChange={(e) => patchTask(task.id, { deadline: e.target.value || null })}
                                className="rounded border border-[var(--border)] bg-white px-1 py-0.5 text-xs"
                              />
                              {days != null && task.estado !== 'Completado' ? (
                                <span>{days === 0 ? 'hoy' : days > 0 ? `${days}d` : `${Math.abs(days)}d tarde`}</span>
                              ) : null}
                            </label>
                            <input
                              value={task.responsable}
                              onChange={(e) => patchTask(task.id, { responsable: e.target.value }, false)}
                              onBlur={flush}
                              className="w-36 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-[var(--border)]"
                              placeholder="Responsable"
                            />
                            <select
                              value={task.estado}
                              onChange={(e) => patchTask(task.id, {
                                estado: e.target.value as ChecklistStatus,
                                completedAt: e.target.value === 'Completado' ? (task.completedAt || new Date().toISOString()) : null,
                              })}
                              className="rounded border border-[var(--border)] bg-white px-1 py-0.5"
                            >
                              {CHECKLIST_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </div>
                          <input
                            value={task.comentarios}
                            onChange={(e) => patchTask(task.id, { comentarios: e.target.value }, false)}
                            onBlur={flush}
                            placeholder="Comentario"
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border)]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('¿Quitar esta tarea?')) return;
                            const current = stateRef.current;
                            if (!current) return;
                            void persist({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }, backend);
                          }}
                          className="justify-self-end p-1 text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
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
    </div>
  );
}
