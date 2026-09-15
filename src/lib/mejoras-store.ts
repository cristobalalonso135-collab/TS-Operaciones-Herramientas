import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import {
  EMPTY_CATALOGS,
  asChannel,
  asModule,
  asStatus,
  mergeCatalog,
  normalizeAttachments,
  type MejorasCatalogs,
  type MejorasState,
  type MejoraCase,
} from '@/lib/mejoras-model';
import { buildSeedCases } from '@/lib/mejoras-seed';

const LOCAL_KEY = 'ts-mejoras-v1';
const STORE_ID = 'main';
export const MEJORAS_SNAPSHOT_KEY = '__mejoras_store__';

export const MEJORAS_SETUP_SQL = `CREATE TABLE IF NOT EXISTS mejoras_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE mejoras_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mejoras_store_read ON mejoras_store;
DROP POLICY IF EXISTS mejoras_store_insert ON mejoras_store;
DROP POLICY IF EXISTS mejoras_store_update ON mejoras_store;
DROP POLICY IF EXISTS mejoras_store_delete ON mejoras_store;

CREATE POLICY mejoras_store_read ON mejoras_store FOR SELECT USING (true);
CREATE POLICY mejoras_store_insert ON mejoras_store FOR INSERT WITH CHECK (true);
CREATE POLICY mejoras_store_update ON mejoras_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY mejoras_store_delete ON mejoras_store FOR DELETE USING (true);`;

export type MejorasBackend = 'supabase' | 'local';

function isMejorasPayload(value: unknown): value is MejorasState {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MejorasState>;
  return Array.isArray(row.cases);
}

function normalizeState(state: MejorasState): MejorasState {
  const cases: MejoraCase[] = state.cases.map((row) => ({
    ...row,
    module: asModule(row.module),
    channel: asChannel(row.channel),
    informedBy: String(row.informedBy || '').trim(),
    channelNote: String(row.channelNote || '').trim(),
    status: asStatus(row.status),
    attachments: normalizeAttachments(row.attachments),
    year: row.year || 2027,
  }));
  const catalogs: MejorasCatalogs = {
    areas: mergeCatalog(EMPTY_CATALOGS.areas, [...(state.catalogs?.areas || []), ...cases.map((row) => row.area)]),
    requesters: mergeCatalog(EMPTY_CATALOGS.requesters, [...(state.catalogs?.requesters || []), ...cases.map((row) => row.requester)]),
  };
  return { cases, catalogs };
}

function initialState(): MejorasState {
  return normalizeState({ cases: buildSeedCases(), catalogs: EMPTY_CATALOGS });
}

function readLocal(): MejorasState {
  if (typeof window === 'undefined') return initialState();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<MejorasState>;
    return normalizeState({
      cases: Array.isArray(parsed.cases) && parsed.cases.length > 0 ? parsed.cases : buildSeedCases(),
      catalogs: parsed.catalogs || EMPTY_CATALOGS,
    });
  } catch {
    return initialState();
  }
}

function writeLocal(state: MejorasState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) {
    throw new Error('Faltan las claves de Supabase.');
  }
  return supabase;
}

type RemoteRead = { kind: 'ok'; payload: MejorasState | null } | { kind: 'missing' };

async function readDedicated(): Promise<RemoteRead> {
  const client = requireClient();
  const { data, error } = await client.from('mejoras_store').select('payload').eq('id', STORE_ID).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return { kind: 'missing' };
    throw new Error(error.message);
  }
  return { kind: 'ok', payload: isMejorasPayload(data?.payload) ? data.payload : null };
}

async function readSharedSnapshot(): Promise<RemoteRead> {
  const client = requireClient();
  const { data, error } = await client.from('seguimiento_snapshots').select('payload').eq('week_key', MEJORAS_SNAPSHOT_KEY).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return { kind: 'missing' };
    throw new Error(error.message);
  }
  return { kind: 'ok', payload: isMejorasPayload(data?.payload) ? data.payload : null };
}

async function writeDedicated(state: MejorasState): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('mejoras_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: state,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

async function writeSharedSnapshot(state: MejorasState): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('seguimiento_snapshots').upsert({
    week_key: MEJORAS_SNAPSHOT_KEY,
    saved_at: new Date().toISOString(),
    payload: state,
  }, { onConflict: 'week_key' });
  if (error) throw new Error(error.message);
}

export async function loadMejorasState(): Promise<{ state: MejorasState; backend: MejorasBackend; setupSql?: string }> {
  try {
    const dedicated = await readDedicated();
    if (dedicated.kind === 'ok' && dedicated.payload) {
      const state = dedicated.payload.cases.length > 0
        ? normalizeState(dedicated.payload)
        : initialState();
      if (dedicated.payload.cases.length === 0) await writeDedicated(state);
      return { state, backend: 'supabase' };
    }

    const shared = await readSharedSnapshot();
    if (shared.kind === 'ok' && shared.payload) {
      const state = shared.payload.cases.length > 0 ? normalizeState(shared.payload) : initialState();
      if (dedicated.kind === 'ok') await writeDedicated(state);
      return { state, backend: 'supabase' };
    }

    const seeded = initialState();
    if (dedicated.kind === 'ok') {
      await writeDedicated(seeded);
      return { state: seeded, backend: 'supabase' };
    }
    if (shared.kind === 'ok') {
      await writeSharedSnapshot(seeded);
      return { state: seeded, backend: 'supabase' };
    }

    return { state: readLocal(), backend: 'local', setupSql: MEJORAS_SETUP_SQL };
  } catch {
    return { state: readLocal(), backend: 'local', setupSql: MEJORAS_SETUP_SQL };
  }
}

export async function saveMejorasState(state: MejorasState, backend: MejorasBackend): Promise<void> {
  const next = normalizeState(state);
  if (backend === 'local') {
    writeLocal(next);
    return;
  }
  try {
    await writeDedicated(next);
  } catch (err) {
    if (err instanceof Error && isMissingTableError(err.message)) {
      await writeSharedSnapshot(next);
      return;
    }
    throw err;
  }
}

export function addCatalogValue(catalogs: MejorasCatalogs, kind: 'area' | 'requester', value: string): MejorasCatalogs {
  const trimmed = value.trim();
  if (!trimmed) return catalogs;
  if (kind === 'area') return { ...catalogs, areas: mergeCatalog(catalogs.areas, [trimmed]) };
  return { ...catalogs, requesters: mergeCatalog(catalogs.requesters, [trimmed]) };
}
