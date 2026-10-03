import { asRepeat, asStatus, newId, nowIso, type ChecklistSubtask, type ChecklistTask } from '@/lib/checklist-model';

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value).toLocaleLowerCase('es');
}

function findCol(header: string[], aliases: string[]): number | null {
  for (const alias of aliases) {
    const exact = header.findIndex((name) => name === alias);
    if (exact >= 0) return exact;
  }
  return null;
}

function parsePasos(value: unknown): ChecklistSubtask[] {
  const text = cellText(value);
  if (!text) return [];
  return text.split('|').flatMap((part) => {
    const chunk = part.trim();
    if (!chunk) return [];
    const done = /^✓\s+/.test(chunk) || /\s*\[hecho\]\s*$/i.test(chunk);
    const cleaned = chunk.replace(/^✓\s+/, '').replace(/\s*\[hecho\]\s*$/i, '').trim();
    const match = cleaned.match(/^(.*?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?\s*$/);
    const titulo = (match?.[1] || cleaned).trim();
    if (!titulo) return [];
    return [{
      id: newId('st'),
      titulo,
      deadline: match?.[2] || null,
      done,
      completedAt: done ? nowIso() : null,
    }];
  });
}

function formatPasos(steps: ChecklistSubtask[]): string {
  return (steps || []).map((step) => {
    const date = step.deadline ? ` (${step.deadline})` : '';
    return `${step.done ? '✓ ' : ''}${step.titulo}${date}`;
  }).join(' | ');
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const text = cellText(value);
  if (!text) return null;
  if (text.includes('T') && !Number.isNaN(Date.parse(text))) {
    const parsed = new Date(text);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(us[1])).padStart(2, '0')}-${String(Number(us[2])).padStart(2, '0')}`;
  }
  return null;
}

export function pickChecklistRows(sheets: Record<string, unknown[][]>): unknown[][] {
  const entries = Object.entries(sheets);
  if (!entries.length) return [];
  const named = entries.find(([name]) => name.toLocaleLowerCase('es').includes('checklist'));
  if (named) return named[1];
  const withTarea = entries.find(([, rows]) =>
    (rows || []).some((row) =>
      (row || []).some((cell) => String(cell ?? '').toLocaleLowerCase('es').includes('tarea'))
    )
  );
  return (withTarea || entries[0])[1] || [];
}

export function parseChecklistSheet(rows: unknown[][]): { nombre?: string; fechaEvento?: string; tasks: ChecklistTask[] } {
  if (!rows.length) return { tasks: [] };
  const titleRow = rows.find((row) => cellText(row?.[1] || row?.[0]).toLocaleLowerCase('es').includes('checklist') || cellText(row?.[0]).length > 3);
  const nombre = titleRow ? cellText(titleRow[1] || titleRow[0]) : '';
  const eventRow = rows.find((row) => (row || []).some((cell) => normalizeHeader(cell).includes('fecha evento') || normalizeHeader(cell).startsWith('evento')));
  let fechaEvento: string | null = null;
  if (eventRow) {
    const joined = (eventRow || []).map(cellText).join(' ');
    fechaEvento = parseDate(joined.replace(/fecha evento:?/i, '').trim()) || parseDate(eventRow[1]) || parseDate(eventRow[0]);
  }
  const headerIndex = rows.findIndex((row) => {
    const joined = (row || []).map(normalizeHeader).join(' | ');
    return joined.includes('tarea') && (joined.includes('área') || joined.includes('area') || joined.includes('estado'));
  });
  const start = headerIndex >= 0 ? headerIndex : 0;
  const header = (rows[start] || []).map(normalizeHeader);
  const col = {
    id: findCol(header, ['id']),
    area: findCol(header, ['área', 'area']),
    tarea: findCol(header, ['tarea', 'titulo', 'título', 'descripcion', 'descripción']),
    deadline: findCol(header, ['deadline', 'fecha', 'vencimiento', 'plazo']),
    responsable: findCol(header, ['responsable', 'owner', 'dueño']),
    estado: findCol(header, ['estado', 'status']),
    comentarios: findCol(header, ['comentarios', 'comentario', 'notas', 'nota']),
    repeat: findCol(header, ['repetición', 'repeticion', 'repeat']),
    until: findCol(header, ['hasta', 'repeat until', 'fin']),
    ask: findCol(header, ['al completar', 'ask']),
    completed: findCol(header, ['completada', 'completedat', 'completed at']),
    created: findCol(header, ['creada', 'createdat', 'created at']),
    series: findCol(header, ['serie', 'seriesid', 'series']),
    pasos: findCol(header, ['pasos', 'subtareas', 'subtasks']),
  };
  const tasks = rows.slice(start + 1).flatMap((row) => {
    const titulo = cellText(col.tarea == null ? '' : row[col.tarea]);
    if (!titulo) return [];
    const estado = asStatus(cellText(col.estado == null ? '' : row[col.estado]));
    const id = cellText(col.id == null ? '' : row[col.id]) || newId('ck');
    const repeat = asRepeat(col.repeat == null ? '' : row[col.repeat]);
    const repeatUntil = parseDate(col.until == null ? '' : row[col.until]);
    const askText = cellText(col.ask == null ? '' : row[col.ask]).toLocaleLowerCase('es');
    const askOnComplete = repeat !== 'none' && (['sí', 'si', '1', 'true', 'al completar'].includes(askText) || !repeatUntil);
    const completedAt = parseDate(col.completed == null ? '' : row[col.completed]);
    return [{
      id,
      area: cellText(col.area == null ? '' : row[col.area]),
      titulo,
      deadline: parseDate(col.deadline == null ? '' : row[col.deadline]),
      responsable: cellText(col.responsable == null ? '' : row[col.responsable]),
      estado,
      comentarios: cellText(col.comentarios == null ? '' : row[col.comentarios]),
      completedAt: completedAt ? `${completedAt}T00:00:00.000Z` : (estado === 'Completado' ? nowIso() : null),
      createdAt: parseDate(col.created == null ? '' : row[col.created]) || nowIso(),
      repeat,
      repeatUntil,
      seriesId: cellText(col.series == null ? '' : row[col.series]) || (repeat === 'none' ? null : id),
      askOnComplete,
      subtasks: parsePasos(col.pasos == null ? '' : row[col.pasos]),
    }];
  });
  return { nombre: nombre || undefined, fechaEvento: fechaEvento || undefined, tasks };
}

export function checklistToAoa(nombre: string, fechaEvento: string, tasks: ChecklistTask[]): unknown[][] {
  return [
    [nombre],
    ['Fecha evento', fechaEvento || ''],
    [],
    ['Id', 'Área', 'Tarea', 'Deadline', 'Responsable', 'Estado', 'Comentarios', 'Repetición', 'Hasta', 'Al completar', 'Completada', 'Creada', 'Serie', 'Pasos'],
    ...tasks.map((item) => [
      item.id,
      item.area,
      item.titulo,
      item.deadline || '',
      item.responsable,
      item.estado,
      item.comentarios,
      item.repeat === 'weekdays' ? 'días laborables' : item.repeat === 'weekly' ? 'cada semana' : '',
      item.repeatUntil || '',
      item.askOnComplete ? 'sí' : '',
      item.completedAt ? item.completedAt.slice(0, 10) : '',
      item.createdAt ? item.createdAt.slice(0, 10) : '',
      item.seriesId || '',
      formatPasos(item.subtasks || []),
    ]),
  ];
}
