import { todayIso } from '@/lib/albaranes-model';
import type { DataRow, FraccionarRow } from '@/lib/fraccionar-excel';

export interface FraccionarZonaCount {
  zona: string;
  count: number;
  uds: number;
  udsLiberables: number;
}

export interface FraccionarCarga {
  id: string;
  loadDate: string;
  loadedAt: string;
  fileName: string;
  total: number;
  matched: number;
  missingAlbaran: number;
  missingCode: number;
  unknownClub: number;
  zonas: FraccionarZonaCount[];
}

export interface FraccionarState {
  cargas: FraccionarCarga[];
}

export function emptyFraccionarState(): FraccionarState {
  return { cargas: [] };
}

function newCargaId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `fr-${crypto.randomUUID()}`;
  return `fr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function zonaName(value: string): string {
  return value.trim() || '(sin zona)';
}

export function snapshotFraccionarCarga(
  data: DataRow[],
  joined: FraccionarRow[],
  fileName: string,
  loadDate = todayIso(),
): FraccionarCarga {
  const byZona = new Map<string, FraccionarZonaCount>();
  data.forEach((row) => {
    const zona = zonaName(row.zona);
    const current = byZona.get(zona) || { zona, count: 0, uds: 0, udsLiberables: 0 };
    current.count += 1;
    current.uds += row.unidades || 0;
    current.udsLiberables += row.udsLiberables || 0;
    byZona.set(zona, current);
  });
  const zonas = Array.from(byZona.values()).sort(
    (a, b) => b.count - a.count || a.zona.localeCompare(b.zona, 'es'),
  );
  return {
    id: newCargaId(),
    loadDate,
    loadedAt: new Date().toISOString(),
    fileName,
    total: data.length,
    matched: joined.filter((row) => !row.issue).length,
    missingAlbaran: joined.filter((row) => row.issue === 'Sin albarán en el CSV').length,
    missingCode: joined.filter((row) => row.issue === 'Sin código de colectivo').length,
    unknownClub: joined.filter((row) => row.issue === 'Colectivo desconocido').length,
    zonas,
  };
}

export function sameFraccionarPhoto(left: FraccionarCarga, right: FraccionarCarga): boolean {
  if (left.loadDate !== right.loadDate || left.total !== right.total || left.matched !== right.matched) return false;
  if (left.zonas.length !== right.zonas.length) return false;
  return left.zonas.every((item, index) => {
    const other = right.zonas[index];
    return other
      && item.zona === other.zona
      && item.count === other.count
      && item.uds === other.uds
      && item.udsLiberables === other.udsLiberables;
  });
}

export function upsertFraccionarCarga(state: FraccionarState, carga: FraccionarCarga): FraccionarState {
  const cargas = state.cargas.filter((item) => item.loadDate !== carga.loadDate);
  cargas.push(carga);
  cargas.sort((a, b) => a.loadDate.localeCompare(b.loadDate));
  const from = new Date();
  from.setDate(from.getDate() - 120);
  const keepFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  return { cargas: cargas.filter((item) => item.loadDate >= keepFrom) };
}

export function asFraccionarState(value: unknown): FraccionarState {
  if (!value || typeof value !== 'object') return emptyFraccionarState();
  const raw = value as { cargas?: unknown };
  if (!Array.isArray(raw.cargas)) return emptyFraccionarState();
  const cargas = raw.cargas.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<FraccionarCarga>;
    if (typeof row.loadDate !== 'string' || !row.loadDate) return [];
    const zonas = Array.isArray(row.zonas)
      ? row.zonas.flatMap((zona) => {
        if (!zona || typeof zona !== 'object') return [];
        const cell = zona as Partial<FraccionarZonaCount>;
        const name = String(cell.zona || '').trim() || '(sin zona)';
        return [{
          zona: name,
          count: Number(cell.count) || 0,
          uds: Number(cell.uds) || 0,
          udsLiberables: Number(cell.udsLiberables) || 0,
        }];
      })
      : [];
    return [{
      id: typeof row.id === 'string' && row.id ? row.id : newCargaId(),
      loadDate: row.loadDate,
      loadedAt: typeof row.loadedAt === 'string' ? row.loadedAt : row.loadDate,
      fileName: typeof row.fileName === 'string' ? row.fileName : '',
      total: Number(row.total) || zonas.reduce((sum, zona) => sum + zona.count, 0),
      matched: Number(row.matched) || 0,
      missingAlbaran: Number(row.missingAlbaran) || 0,
      missingCode: Number(row.missingCode) || 0,
      unknownClub: Number(row.unknownClub) || 0,
      zonas,
    }];
  });
  cargas.sort((a, b) => a.loadDate.localeCompare(b.loadDate));
  return { cargas };
}

export function historyZonaMatrix(state: FraccionarState): {
  dates: string[];
  rows: Array<{ zona: string; values: Array<{ count: number; uds: number; udsLiberables: number }> }>;
  totals: Array<{ count: number; uds: number; udsLiberables: number }>;
} {
  const dates = state.cargas.map((item) => item.loadDate);
  const names = new Set<string>();
  state.cargas.forEach((carga) => carga.zonas.forEach((item) => names.add(item.zona)));
  const last = state.cargas[state.cargas.length - 1];
  const lastCount = new Map((last?.zonas || []).map((item) => [item.zona, item.count]));
  const zonas = Array.from(names).sort(
    (a, b) => (lastCount.get(b) || 0) - (lastCount.get(a) || 0) || a.localeCompare(b, 'es'),
  );
  const rows = zonas.map((zona) => ({
    zona,
    values: state.cargas.map((carga) => {
      const hit = carga.zonas.find((item) => item.zona === zona);
      return { count: hit?.count || 0, uds: hit?.uds || 0, udsLiberables: hit?.udsLiberables || 0 };
    }),
  }));
  const totals = state.cargas.map((carga) => ({
    count: carga.total || carga.zonas.reduce((sum, item) => sum + item.count, 0),
    uds: carga.zonas.reduce((sum, item) => sum + item.uds, 0),
    udsLiberables: carga.zonas.reduce((sum, item) => sum + item.udsLiberables, 0),
  }));
  return { dates, rows, totals };
}
