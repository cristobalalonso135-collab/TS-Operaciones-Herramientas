import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asFraccionarState, emptyFraccionarState, type FraccionarState } from '@/lib/fraccionar-model';

const LOCAL_KEY = 'ts-fraccionar-v1';
const STORE_ID = 'main';

export const FRACCIONAR_SETUP_SQL = `CREATE TABLE IF NOT EXISTS fraccionar_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE fraccionar_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fraccionar_store_read ON fraccionar_store;
DROP POLICY IF EXISTS fraccionar_store_insert ON fraccionar_store;
DROP POLICY IF EXISTS fraccionar_store_update ON fraccionar_store;
DROP POLICY IF EXISTS fraccionar_store_delete ON fraccionar_store;

CREATE POLICY fraccionar_store_read ON fraccionar_store FOR SELECT USING (true);
CREATE POLICY fraccionar_store_insert ON fraccionar_store FOR INSERT WITH CHECK (true);
CREATE POLICY fraccionar_store_update ON fraccionar_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY fraccionar_store_delete ON fraccionar_store FOR DELETE USING (true);`;

export type FraccionarBackend = 'supabase' | 'local';

function readLocal(): FraccionarState {
  if (typeof window === 'undefined') return emptyFraccionarState();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyFraccionarState();
    return asFraccionarState(JSON.parse(raw));
  } catch {
    return emptyFraccionarState();
  }
}

function writeLocal(state: FraccionarState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadFraccionarState(): Promise<{
  state: FraccionarState;
  backend: FraccionarBackend;
  setupSql?: string;
}> {
  try {
    const client = requireClient();
    const { data, error } = await client.from('fraccionar_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { state: readLocal(), backend: 'local', setupSql: FRACCIONAR_SETUP_SQL };
      throw new Error(error.message);
    }
    if (data?.payload) return { state: asFraccionarState(data.payload), backend: 'supabase' };
    const seeded = emptyFraccionarState();
    const { error: upError } = await client.from('fraccionar_store').upsert({
      id: STORE_ID,
      saved_at: new Date().toISOString(),
      payload: seeded,
    }, { onConflict: 'id' });
    if (upError) {
      if (isMissingTableError(upError.message)) return { state: seeded, backend: 'local', setupSql: FRACCIONAR_SETUP_SQL };
      throw new Error(upError.message);
    }
    return { state: seeded, backend: 'supabase' };
  } catch {
    return { state: readLocal(), backend: 'local', setupSql: FRACCIONAR_SETUP_SQL };
  }
}

export async function saveFraccionarState(state: FraccionarState, backend: FraccionarBackend): Promise<void> {
  const next = asFraccionarState(state);
  writeLocal(next);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('fraccionar_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
