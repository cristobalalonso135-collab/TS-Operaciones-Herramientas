import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import { es } from 'date-fns/locale';

export const SNAPSHOT_STORAGE = 'seguimiento-weekly-snapshots';
const MAX_SNAPSHOTS = 104;

export interface TrackingSnapshot {
  weekKey: string;
  savedAt: string;
  weekLabel: string;
  periodLabel: string;
  fyStart: number;
  fromMonth: number;
  toMonth: number;
  periodDays: number;
  facturacion: number;
  budget: number;
  facturacionLy: number;
  gm: number;
  gmBudget: number;
  gmLy: number;
  freePct: number | null;
  genPct: number | null;
  deuda: number;
  deudaVencida: number;
  debtPct: number | null;
  debtDuePct: number | null;
  dso: number | null;
  dsoDue: number | null;
  hasDebt: boolean;
  files: {
    operation: string | null;
    budget: string | null;
    debt: string | null;
    extra: string[];
  };
}

export function weekKeyFromDate(date = new Date()): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

export function weekLabelFromDate(date = new Date()): string {
  return `Sem ${getISOWeek(date)} · ${format(date, 'd MMM', { locale: es })}`;
}

export function vsBudgetPct(actual: number, budget: number): number | null {
  if (budget === 0) return null;
  return ((actual - budget) / Math.abs(budget)) * 100;
}

export function marginPct(gm: number, facturacion: number): number | null {
  if (facturacion === 0) return null;
  return (gm / facturacion) * 100;
}

function isSnapshot(value: unknown): value is TrackingSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<TrackingSnapshot>;
  return typeof row.weekKey === 'string' && typeof row.savedAt === 'string' && typeof row.facturacion === 'number';
}

export function parseSnapshots(raw: string | null): TrackingSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).sort(compareSnapshots).slice(0, MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

export function compareSnapshots(a: TrackingSnapshot, b: TrackingSnapshot): number {
  if (a.weekKey === b.weekKey) return b.savedAt.localeCompare(a.savedAt);
  return b.weekKey.localeCompare(a.weekKey);
}

export function upsertSnapshot(list: TrackingSnapshot[], next: TrackingSnapshot): TrackingSnapshot[] {
  return [next, ...list.filter((row) => row.weekKey !== next.weekKey)].sort(compareSnapshots).slice(0, MAX_SNAPSHOTS);
}

export function snapshotsChronological(list: TrackingSnapshot[]): TrackingSnapshot[] {
  return [...list].sort((a, b) => a.weekKey.localeCompare(b.weekKey) || a.savedAt.localeCompare(b.savedAt));
}

export function downloadSnapshotsJson(list: TrackingSnapshot[]): void {
  const blob = new Blob([JSON.stringify({ version: 1, snapshots: list }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'seguimiento-fotos.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function parseSnapshotBackup(raw: string): TrackingSnapshot[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed.filter(isSnapshot);
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { snapshots?: unknown }).snapshots)) {
    return ((parsed as { snapshots: unknown[] }).snapshots).filter(isSnapshot);
  }
  throw new Error('Ese JSON no trae fotos de seguimiento.');
}
