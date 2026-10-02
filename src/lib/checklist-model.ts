import { getHolidays } from './holidays';
import { isWorkingDay } from './working-days';

export type ChecklistStatus = 'Pendiente' | 'En curso' | 'Completado' | 'Bloqueado' | 'Caducada';
export type ChecklistRepeat = 'none' | 'weekdays' | 'weekly';

export const CHECKLIST_STATUSES: ChecklistStatus[] = ['Pendiente', 'En curso', 'Completado', 'Bloqueado', 'Caducada'];

export interface ChecklistTask {
  id: string;
  area: string;
  titulo: string;
  deadline: string | null;
  responsable: string;
  estado: ChecklistStatus;
  comentarios: string;
  completedAt: string | null;
  createdAt: string;
  repeat: ChecklistRepeat;
  repeatUntil: string | null;
  seriesId: string | null;
}

export interface ChecklistState {
  nombre: string;
  fechaEvento: string;
  tasks: ChecklistTask[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function asStatus(value: string): ChecklistStatus {
  const text = value.trim().toLocaleLowerCase('es');
  if (['completado', 'completa', 'hecho', 'done', 'ok', 'sí', 'si'].includes(text)) return 'Completado';
  if (['en curso', 'curso', 'progreso', 'doing'].includes(text)) return 'En curso';
  if (['bloqueado', 'blocked', 'parado'].includes(text)) return 'Bloqueado';
  if (['caducada', 'caducado', 'expired', 'expirada'].includes(text)) return 'Caducada';
  return 'Pendiente';
}

export function asRepeat(value: unknown): ChecklistRepeat {
  const text = String(value || '').trim().toLocaleLowerCase('es');
  if (['weekdays', 'laborable', 'laborables', 'días laborables', 'dias laborables', 'diario', 'cada día', 'cada dia'].includes(text)) {
    return 'weekdays';
  }
  if (['weekly', 'semanal', 'semana', 'cada semana'].includes(text)) return 'weekly';
  return 'none';
}

function parseLocalIso(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseLocalIso(iso);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

export function addMonthsIso(iso: string, months: number): string {
  const date = parseLocalIso(iso);
  date.setMonth(date.getMonth() + months);
  return todayIso(date);
}

function holidaysAround(iso: string): Set<string> {
  const year = Number(iso.slice(0, 4)) || new Date().getFullYear();
  const out = new Set<string>();
  getHolidays(year - 1).forEach((day) => out.add(day));
  getHolidays(year).forEach((day) => out.add(day));
  getHolidays(year + 1).forEach((day) => out.add(day));
  return out;
}

export function firstWorkingDayOnOrAfter(fromIso: string): string {
  const holidays = holidaysAround(fromIso);
  let iso = fromIso;
  for (let i = 0; i < 21; i += 1) {
    if (isWorkingDay(parseLocalIso(iso), holidays)) return iso;
    iso = addDaysIso(iso, 1);
  }
  return iso;
}

export function nextWorkingDayAfter(fromIso: string): string {
  return firstWorkingDayOnOrAfter(addDaysIso(fromIso, 1));
}

export function isClosed(task: ChecklistTask): boolean {
  return task.estado === 'Completado' || task.estado === 'Caducada';
}

export function emptyTask(): ChecklistTask {
  return {
    id: newId('ck'),
    area: '',
    titulo: '',
    deadline: null,
    responsable: '',
    estado: 'Pendiente',
    comentarios: '',
    completedAt: null,
    createdAt: nowIso(),
    repeat: 'none',
    repeatUntil: null,
    seriesId: null,
  };
}

export function seedChecklistState(): ChecklistState {
  const now = nowIso();
  const row = (
    area: string,
    titulo: string,
    deadline: string | null,
    responsable: string,
    estado: ChecklistStatus,
  ): ChecklistTask => ({
    id: newId('ck'),
    area,
    titulo,
    deadline,
    responsable,
    estado,
    comentarios: '',
    completedAt: estado === 'Completado' ? now : null,
    createdAt: now,
    repeat: 'none',
    repeatUntil: null,
    seriesId: null,
  });
  return {
    nombre: 'I Convención Teamsports GS 27/28',
    fechaEvento: '2026-11-10',
    tasks: [
      row('Organización', 'Analizar si hay eventos en Zaragoza en esas fechas', '2026-09-09', 'Santi/Cristóbal', 'Completado'),
      row('Organización', 'Comunicar convención y bloquear calendarios', '2026-09-23', 'Santi/Francesco', 'Completado'),
      row('Organización', 'Hacer checklist de la convención', '2026-09-24', 'Cristóbal', 'Completado'),
      row('Organización', 'Preparar agenda de los dos días', '2026-09-25', 'Cristóbal', 'Pendiente'),
      row('Organización', 'Enviar agenda definitiva a asistentes', '2026-10-25', 'Santi/Francesco', 'Pendiente'),
      row('Logística', 'Reservar noches de hotel. Confirmar asistentes', null, 'Cristóbal', 'Pendiente'),
      row('Logística', 'Reservar sala del hotel. Confirmar asistentes', null, 'Cristóbal', 'Pendiente'),
      row('Logística', 'Reservar salas de la empresa', null, 'Cristóbal', 'Pendiente'),
      row('Restauración', 'Reservar comida día 10. Confirmar asistentes, menús y alergias (Alaun)', null, 'Santi', 'Pendiente'),
      row('Restauración', 'Reservar comida día 11. Confirmar asistentes, menús y alergias (Picoteo doña col)', null, 'Santi', 'Pendiente'),
      row('Actividad', 'Reservar actividad día 11 (torneo futbolín + cena)', null, 'Santi', 'Pendiente'),
      row('Producto', 'Solicitar muestras y confirmar su recepción', null, 'Blanca', 'Pendiente'),
      row('Producto', 'Solicitar regalo a marcas', null, 'Blanca', 'Pendiente'),
      row('Actividad', 'Decidir si se entregarán premios y comprar/preparar premios', null, 'Antequera', 'Pendiente'),
      row('Material comercial', 'Preparar Pricelist', null, 'Cristóbal', 'Pendiente'),
      row('Material comercial', 'Preparar Catálogo comercial', null, 'Buisán', 'Pendiente'),
      row('Material comercial', 'Preparar hoja de reservas', null, 'Cristóbal', 'Pendiente'),
      row('Montaje', 'Comprar/solicitar burros y material de exposición', null, 'Blanca/Diego', 'Pendiente'),
      row('Montaje', 'Comprobar pantalla, HDMI, sonido, Wi-Fi y conexiones', null, 'Santi/Cristóbal', 'Pendiente'),
      row('Montaje', 'Montar la sala (Preparar burros/expositores/maniquís…)', null, 'Todos', 'Pendiente'),
    ],
  };
}

export function normalizeChecklist(state: Partial<ChecklistState> | null | undefined): ChecklistState {
  const seeded = seedChecklistState();
  const tasks = Array.isArray(state?.tasks)
    ? state.tasks.map((item) => {
      const repeat = asRepeat(item.repeat);
      const id = item.id || newId('ck');
      return {
        id,
        area: String(item.area || '').trim(),
        titulo: String(item.titulo || '').trim(),
        deadline: item.deadline || null,
        responsable: String(item.responsable || '').trim(),
        estado: asStatus(item.estado || 'Pendiente'),
        comentarios: String(item.comentarios || '').trim(),
        completedAt: item.completedAt || (asStatus(item.estado || '') === 'Completado' ? nowIso() : null),
        createdAt: item.createdAt || nowIso(),
        repeat,
        repeatUntil: item.repeatUntil || null,
        seriesId: item.seriesId || (repeat === 'none' ? null : id),
      };
    }).filter((item) => item.titulo)
    : seeded.tasks;
  return {
    nombre: String(state?.nombre || '').trim() || seeded.nombre,
    fechaEvento: String(state?.fechaEvento || '').slice(0, 10) || seeded.fechaEvento,
    tasks,
  };
}

export function daysUntil(iso: string | null | undefined, today = todayIso()): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function repeatLabel(task: ChecklistTask): string {
  if (!task.repeat || task.repeat === 'none') return '';
  const kind = task.repeat === 'weekly' ? 'cada semana' : 'días laborables';
  if (task.repeatUntil) return `${kind} · hasta ${formatIsoDate(task.repeatUntil)}`;
  return kind;
}

export function uniqueValues(tasks: ChecklistTask[], key: 'area' | 'responsable'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  tasks.forEach((item) => {
    const text = item[key].trim();
    if (!text) return;
    const k = text.toLocaleLowerCase('es');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(text);
  });
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

export function checklistKpis(tasks: ChecklistTask[], today = todayIso()) {
  const done = tasks.filter((item) => item.estado === 'Completado').length;
  const blocked = tasks.filter((item) => item.estado === 'Bloqueado').length;
  const expired = tasks.filter((item) => item.estado === 'Caducada').length;
  const overdue = tasks.filter((item) => {
    if (isClosed(item) || !item.deadline) return false;
    return item.deadline < today;
  }).length;
  const open = tasks.length - done - expired;
  return {
    total: tasks.length,
    done,
    open,
    blocked,
    overdue,
    expired,
    share: tasks.length ? done / tasks.length : 0,
  };
}

export function upcomingTasks(tasks: ChecklistTask[], today = todayIso(), limit = 4): ChecklistTask[] {
  return tasks
    .filter((item) => !isClosed(item) && item.deadline)
    .sort((a, b) => {
      const da = a.deadline || '9999';
      const db = b.deadline || '9999';
      if (da !== db) return da.localeCompare(db);
      return a.titulo.localeCompare(b.titulo, 'es');
    })
    .slice(0, limit);
}

export function sortByDeadline(
  tasks: ChecklistTask[],
  dir: 'asc' | 'desc' = 'asc',
  completedLast = false,
): ChecklistTask[] {
  const sign = dir === 'desc' ? -1 : 1;
  return tasks.slice().sort((a, b) => {
    if (completedLast) {
      if (isClosed(a) && !isClosed(b)) return 1;
      if (!isClosed(a) && isClosed(b)) return -1;
    }
    if (!a.deadline && !b.deadline) return a.titulo.localeCompare(b.titulo, 'es');
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    const cmp = a.deadline.localeCompare(b.deadline);
    if (cmp) return cmp * sign;
    return a.titulo.localeCompare(b.titulo, 'es');
  });
}

export function groupByArea(tasks: ChecklistTask[]): Array<{ area: string; tasks: ChecklistTask[] }> {
  const order: string[] = [];
  const map = new Map<string, ChecklistTask[]>();
  tasks.forEach((item) => {
    const area = item.area.trim() || 'Sin área';
    if (!map.has(area)) {
      map.set(area, []);
      order.push(area);
    }
    map.get(area)!.push(item);
  });
  return order.map((area) => ({
    area,
    tasks: sortByDeadline(map.get(area) || [], 'asc', true),
  }));
}

export function toggleTask(task: ChecklistTask): ChecklistTask {
  if (task.estado === 'Caducada') return task;
  if (task.estado === 'Completado') {
    return { ...task, estado: 'Pendiente', completedAt: null };
  }
  return { ...task, estado: 'Completado', completedAt: nowIso() };
}

function nextDeadlineFor(task: ChecklistTask, today: string): string {
  const from = task.deadline && task.deadline > today ? task.deadline : today;
  if (task.repeat === 'weekly') return firstWorkingDayOnOrAfter(addDaysIso(from, 7));
  return nextWorkingDayAfter(from);
}

export function completeChecklistTask(
  task: ChecklistTask,
  tasks: ChecklistTask[],
  today = todayIso(),
): { tasks: ChecklistTask[]; spawned: boolean; ended: boolean } {
  const done: ChecklistTask = { ...task, estado: 'Completado', completedAt: nowIso() };
  const nextTasks = tasks.map((item) => (item.id === task.id ? done : item));
  if (!task.repeat || task.repeat === 'none') {
    return { tasks: nextTasks, spawned: false, ended: false };
  }
  const seriesId = task.seriesId || task.id;
  const nextDeadline = nextDeadlineFor(task, today);
  if (task.repeatUntil && nextDeadline > task.repeatUntil) {
    return { tasks: nextTasks, spawned: false, ended: true };
  }
  const exists = nextTasks.some((item) => (
    (item.seriesId || item.id) === seriesId
    && item.deadline === nextDeadline
    && !isClosed(item)
  ));
  if (exists) return { tasks: nextTasks, spawned: false, ended: false };
  const next: ChecklistTask = {
    ...emptyTask(),
    area: task.area,
    titulo: task.titulo,
    responsable: task.responsable,
    deadline: nextDeadline,
    estado: 'Pendiente',
    repeat: task.repeat,
    repeatUntil: task.repeatUntil,
    seriesId,
  };
  return { tasks: [...nextTasks, next], spawned: true, ended: false };
}

export function expireOverdueSeries(
  tasks: ChecklistTask[],
  today = todayIso(),
): { tasks: ChecklistTask[]; expired: number } {
  let expired = 0;
  const next = tasks.map((task) => {
    if (isClosed(task)) return task;
    if (!task.repeat || task.repeat === 'none' || !task.repeatUntil) return task;
    if (task.repeatUntil >= today) return task;
    expired += 1;
    return { ...task, estado: 'Caducada' as const };
  });
  return { tasks: next, expired };
}

export function mergeImportedTasks(state: ChecklistState, incoming: ChecklistTask[]): { state: ChecklistState; added: number; updated: number } {
  let tasks = [...state.tasks];
  let added = 0;
  let updated = 0;
  incoming.forEach((item) => {
    const hit = tasks.find((row) => (
      (item.id && row.id === item.id)
      || (row.area.toLocaleLowerCase('es') === item.area.toLocaleLowerCase('es')
        && row.titulo.toLocaleLowerCase('es') === item.titulo.toLocaleLowerCase('es'))
    ));
    if (hit) {
      updated += 1;
      tasks = tasks.map((row) => (row.id === hit.id ? {
        ...row,
        area: item.area || row.area,
        titulo: item.titulo || row.titulo,
        deadline: item.deadline ?? row.deadline,
        responsable: item.responsable || row.responsable,
        estado: item.estado,
        comentarios: item.comentarios || row.comentarios,
        completedAt: item.estado === 'Completado' ? (row.completedAt || nowIso()) : null,
        repeat: item.repeat || row.repeat,
        repeatUntil: item.repeatUntil ?? row.repeatUntil,
        seriesId: item.seriesId || row.seriesId,
      } : row));
      return;
    }
    added += 1;
    tasks = [...tasks, { ...item, id: item.id || newId('ck') }];
  });
  return { state: { ...state, tasks }, added, updated };
}
