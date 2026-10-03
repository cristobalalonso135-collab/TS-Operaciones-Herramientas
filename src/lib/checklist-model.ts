export type ChecklistStatus = 'Pendiente' | 'En curso' | 'Completado' | 'Bloqueado' | 'Caducada';

export const CHECKLIST_STATUSES: ChecklistStatus[] = ['Pendiente', 'En curso', 'Completado', 'Bloqueado', 'Caducada'];

export interface ChecklistSubtask {
  id: string;
  titulo: string;
  deadline: string | null;
  done: boolean;
  completedAt: string | null;
}

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
  subtasks: ChecklistSubtask[];
}

export interface ChecklistState {
  id: string;
  nombre: string;
  fechaEvento: string;
  tasks: ChecklistTask[];
}

export interface ChecklistLibrary {
  lists: ChecklistState[];
}

export const CONVENTION_CHECKLIST_ID = 'convencion-2728';
export const CONVENTION_CHECKLIST_NAME = 'I Convención Teamsports 27/28';

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

export function isClosed(task: ChecklistTask): boolean {
  return task.estado === 'Completado' || task.estado === 'Caducada';
}

export function subtaskProgress(task: ChecklistTask): { done: number; total: number } {
  const total = task.subtasks?.length || 0;
  const done = (task.subtasks || []).filter((item) => item.done).length;
  return { done, total };
}

export function effectiveDeadline(task: ChecklistTask): string | null {
  const open = (task.subtasks || []).filter((item) => !item.done && item.deadline).map((item) => item.deadline as string);
  const dates = [task.deadline, ...open].filter((value): value is string => Boolean(value)).sort();
  return dates[0] || null;
}

export function isTaskOverdue(task: ChecklistTask, today = todayIso()): boolean {
  if (isClosed(task)) return false;
  if (task.deadline && task.deadline < today) return true;
  return (task.subtasks || []).some((item) => !item.done && item.deadline && item.deadline < today);
}

export function toggleSubtask(task: ChecklistTask, subId: string): ChecklistTask {
  return {
    ...task,
    subtasks: (task.subtasks || []).map((item) => {
      if (item.id !== subId) return item;
      const done = !item.done;
      return { ...item, done, completedAt: done ? nowIso() : null };
    }),
  };
}

export function emptySubtask(): ChecklistSubtask {
  return {
    id: newId('st'),
    titulo: '',
    deadline: null,
    done: false,
    completedAt: null,
  };
}

export function normalizeSubtasks(value: unknown): ChecklistSubtask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<ChecklistSubtask>;
    const titulo = String(row.titulo || '').trim();
    if (!titulo) return [];
    const done = row.done === true;
    return [{
      id: row.id || newId('st'),
      titulo,
      deadline: row.deadline || null,
      done,
      completedAt: row.completedAt || (done ? nowIso() : null),
    }];
  });
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
    subtasks: [],
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
    subtasks: [],
  });
  return {
    id: CONVENTION_CHECKLIST_ID,
    nombre: CONVENTION_CHECKLIST_NAME,
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
        subtasks: normalizeSubtasks(item.subtasks),
      };
    }).filter((item) => item.titulo)
    : seeded.tasks;
  return {
    id: String(state?.id || '').trim() || newId('cl'),
    nombre: canonicalChecklistName(String(state?.nombre || '').trim() || seeded.nombre),
    fechaEvento: String(state?.fechaEvento || '').slice(0, 10) || seeded.fechaEvento,
    tasks,
  };
}

function canonicalChecklistName(nombre: string): string {
  if (nombre === 'I Convención Teamsports GS 27/28') return CONVENTION_CHECKLIST_NAME;
  return nombre;
}

export function emptyChecklist(): ChecklistState {
  return {
    id: newId('cl'),
    nombre: 'Nueva checklist',
    fechaEvento: '',
    tasks: [],
  };
}

export function cloneChecklist(source: ChecklistState): ChecklistState {
  return {
    id: newId('cl'),
    nombre: `Copia de ${source.nombre}`,
    fechaEvento: '',
    tasks: source.tasks.map((task) => ({
      ...emptyTask(),
      area: task.area,
      titulo: task.titulo,
      responsable: task.responsable,
      comentarios: '',
      subtasks: (task.subtasks || []).map((step) => ({
        ...emptySubtask(),
        titulo: step.titulo,
      })),
    })),
  };
}

export function asChecklistLibrary(value: unknown): ChecklistLibrary {
  if (value && typeof value === 'object' && Array.isArray((value as ChecklistLibrary).lists)) {
    const lists = (value as ChecklistLibrary).lists.map((item) => normalizeChecklist(item));
    if (lists.length) return { lists };
  }
  if (value && typeof value === 'object' && Array.isArray((value as ChecklistState).tasks)) {
    const board = normalizeChecklist({
      ...(value as ChecklistState),
      id: (value as ChecklistState).id || CONVENTION_CHECKLIST_ID,
    });
    return { lists: [board] };
  }
  return { lists: [seedChecklistState()] };
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
  const overdue = tasks.filter((item) => isTaskOverdue(item, today)).length;
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
    .filter((item) => !isClosed(item) && effectiveDeadline(item))
    .sort((a, b) => {
      const da = effectiveDeadline(a) || '9999';
      const db = effectiveDeadline(b) || '9999';
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
    if (!a.deadline && !b.deadline) {
      const ea = effectiveDeadline(a);
      const eb = effectiveDeadline(b);
      if (!ea && !eb) return a.titulo.localeCompare(b.titulo, 'es');
      if (!ea) return 1;
      if (!eb) return -1;
      const cmpEff = ea.localeCompare(eb);
      if (cmpEff) return cmpEff * sign;
      return a.titulo.localeCompare(b.titulo, 'es');
    }
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    const cmp = a.deadline.localeCompare(b.deadline);
    if (cmp) return cmp * sign;
    return a.titulo.localeCompare(b.titulo, 'es');
  });
}

export function moveById<T extends { id: string }>(items: T[], fromId: string, toId: string): T[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
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
    tasks: map.get(area) || [],
  }));
}

export function toggleTask(task: ChecklistTask): ChecklistTask {
  if (task.estado === 'Caducada') return task;
  if (task.estado === 'Completado') {
    return { ...task, estado: 'Pendiente', completedAt: null };
  }
  return { ...task, estado: 'Completado', completedAt: nowIso() };
}

export function completeChecklistTask(
  task: ChecklistTask,
  tasks: ChecklistTask[],
): { tasks: ChecklistTask[] } {
  const done: ChecklistTask = { ...task, estado: 'Completado', completedAt: nowIso() };
  return { tasks: tasks.map((item) => (item.id === task.id ? done : item)) };
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
        subtasks: item.subtasks?.length ? item.subtasks : row.subtasks,
      } : row));
      return;
    }
    added += 1;
    tasks = [...tasks, { ...item, id: item.id || newId('ck') }];
  });
  return { state: { ...state, tasks }, added, updated };
}
