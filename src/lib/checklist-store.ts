import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import {
  asChecklistLibrary,
  seedChecklistState,
  type ChecklistLibrary,
} from '@/lib/checklist-model';

const LOCAL_KEY = 'ts-checklist-v2';
const LOCAL_KEY_V1 = 'ts-checklist-v1';
const STORE_ID = 'main';

export const CHECKLIST_SETUP_SQL = `CREATE TABLE IF NOT EXISTS checklist_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE checklist_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_store_read ON checklist_store;
DROP POLICY IF EXISTS checklist_store_insert ON checklist_store;
DROP POLICY IF EXISTS checklist_store_update ON checklist_store;
DROP POLICY IF EXISTS checklist_store_delete ON checklist_store;

CREATE POLICY checklist_store_read ON checklist_store FOR SELECT USING (true);
CREATE POLICY checklist_store_insert ON checklist_store FOR INSERT WITH CHECK (true);
CREATE POLICY checklist_store_update ON checklist_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY checklist_store_delete ON checklist_store FOR DELETE USING (true);`;

export type ChecklistBackend = 'supabase' | 'local';

function looksLikePayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as { lists?: unknown; tasks?: unknown };
  return Array.isArray(row.lists) || Array.isArray(row.tasks);
}

function wasLegacy(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as { lists?: unknown; tasks?: unknown };
  return Array.isArray(row.tasks) && !Array.isArray(row.lists);
}

function readLocal(): ChecklistLibrary {
  if (typeof window === 'undefined') return { lists: [seedChecklistState()] };
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY) || window.localStorage.getItem(LOCAL_KEY_V1);
    if (!raw) return { lists: [seedChecklistState()] };
    const parsed = JSON.parse(raw) as unknown;
    return looksLikePayload(parsed) ? asChecklistLibrary(parsed) : { lists: [seedChecklistState()] };
  } catch {
    return { lists: [seedChecklistState()] };
  }
}

function writeLocal(library: ChecklistLibrary) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(library));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadChecklistLibrary(): Promise<{ library: ChecklistLibrary; backend: ChecklistBackend; setupSql?: string; migrated?: boolean }> {
  try {
    const client = requireClient();
    const { data, error } = await client.from('checklist_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { library: readLocal(), backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
      throw new Error(error.message);
    }
    if (data?.payload && looksLikePayload(data.payload)) {
      const migrated = wasLegacy(data.payload);
      return { library: asChecklistLibrary(data.payload), backend: 'supabase', migrated };
    }
    const seeded = { lists: [seedChecklistState()] };
    const { error: upError } = await client.from('checklist_store').upsert({
      id: STORE_ID,
      saved_at: new Date().toISOString(),
      payload: seeded,
    }, { onConflict: 'id' });
    if (upError) {
      if (isMissingTableError(upError.message)) return { library: seeded, backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
      throw new Error(upError.message);
    }
    return { library: seeded, backend: 'supabase' };
  } catch {
    return { library: readLocal(), backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
  }
}

export async function saveChecklistLibrary(library: ChecklistLibrary, backend: ChecklistBackend): Promise<void> {
  const next = asChecklistLibrary(library);
  writeLocal(next);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('checklist_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message);
  }
}
