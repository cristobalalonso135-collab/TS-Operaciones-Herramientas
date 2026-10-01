import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import {
  normalizeChecklist,
  seedChecklistState,
  type ChecklistState,
} from '@/lib/checklist-model';

const LOCAL_KEY = 'ts-checklist-v1';
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

function isState(value: unknown): value is ChecklistState {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as ChecklistState).tasks);
}

function readLocal(): ChecklistState {
  if (typeof window === 'undefined') return seedChecklistState();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return seedChecklistState();
    const parsed = JSON.parse(raw) as unknown;
    return isState(parsed) ? normalizeChecklist(parsed) : seedChecklistState();
  } catch {
    return seedChecklistState();
  }
}

function writeLocal(state: ChecklistState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadChecklistState(): Promise<{ state: ChecklistState; backend: ChecklistBackend; setupSql?: string }> {
  try {
    const client = requireClient();
    const { data, error } = await client.from('checklist_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { state: readLocal(), backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
      throw new Error(error.message);
    }
    if (data?.payload && isState(data.payload)) {
      return { state: normalizeChecklist(data.payload), backend: 'supabase' };
    }
    const seeded = seedChecklistState();
    const { error: upError } = await client.from('checklist_store').upsert({
      id: STORE_ID,
      saved_at: new Date().toISOString(),
      payload: seeded,
    }, { onConflict: 'id' });
    if (upError) {
      if (isMissingTableError(upError.message)) return { state: seeded, backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
      throw new Error(upError.message);
    }
    return { state: seeded, backend: 'supabase' };
  } catch {
    return { state: readLocal(), backend: 'local', setupSql: CHECKLIST_SETUP_SQL };
  }
}

export async function saveChecklistState(state: ChecklistState, backend: ChecklistBackend): Promise<void> {
  const next = normalizeChecklist(state);
  if (backend === 'local') {
    writeLocal(next);
    return;
  }
  const client = requireClient();
  const { error } = await client.from('checklist_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) {
    writeLocal(next);
    throw new Error(error.message);
  }
}
