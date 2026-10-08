import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asEstadoState, emptyEstadoState, type EstadoState } from '@/lib/estado-model';

const LOCAL_KEY = 'ts-estado-v1';
const STORE_ID = 'main';

export const ESTADO_SETUP_SQL = `CREATE TABLE IF NOT EXISTS estado_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE estado_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estado_store_read ON estado_store;
DROP POLICY IF EXISTS estado_store_insert ON estado_store;
DROP POLICY IF EXISTS estado_store_update ON estado_store;
DROP POLICY IF EXISTS estado_store_delete ON estado_store;

CREATE POLICY estado_store_read ON estado_store FOR SELECT USING (true);
CREATE POLICY estado_store_insert ON estado_store FOR INSERT WITH CHECK (true);
CREATE POLICY estado_store_update ON estado_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY estado_store_delete ON estado_store FOR DELETE USING (true);`;

export type EstadoBackend = 'supabase' | 'local';

function readLocal(): EstadoState {
  if (typeof window === 'undefined') return emptyEstadoState();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyEstadoState();
    return asEstadoState(JSON.parse(raw));
  } catch {
    return emptyEstadoState();
  }
}

function writeLocal(state: EstadoState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadEstadoState(): Promise<{ state: EstadoState; backend: EstadoBackend }> {
  try {
    const client = requireClient();
    const { data, error } = await client.from('estado_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { state: readLocal(), backend: 'local' };
      throw new Error(error.message);
    }
    if (data?.payload) {
      return { state: asEstadoState(data.payload), backend: 'supabase' };
    }
    const empty = emptyEstadoState();
    const { error: upError } = await client.from('estado_store').upsert({
      id: STORE_ID,
      saved_at: new Date().toISOString(),
      payload: empty,
    }, { onConflict: 'id' });
    if (upError) {
      if (isMissingTableError(upError.message)) return { state: empty, backend: 'local' };
      throw new Error(upError.message);
    }
    return { state: empty, backend: 'supabase' };
  } catch {
    return { state: readLocal(), backend: 'local' };
  }
}

export async function saveEstadoState(state: EstadoState, backend: EstadoBackend): Promise<void> {
  const next = asEstadoState(state);
  writeLocal(next);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('estado_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
