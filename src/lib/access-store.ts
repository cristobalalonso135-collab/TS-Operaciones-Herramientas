import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asDirectory, emptyDirectory, type AccessDirectory } from '@/lib/access-model';

const STORE_ID = 'main';
const TABLE = 'access_store';

export const ACCESS_SETUP_SQL = `CREATE TABLE IF NOT EXISTS access_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE access_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_store_read ON access_store;
DROP POLICY IF EXISTS access_store_insert ON access_store;
DROP POLICY IF EXISTS access_store_update ON access_store;
DROP POLICY IF EXISTS access_store_delete ON access_store;

CREATE POLICY access_store_read ON access_store FOR SELECT USING (true);
CREATE POLICY access_store_insert ON access_store FOR INSERT WITH CHECK (true);
CREATE POLICY access_store_update ON access_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY access_store_delete ON access_store FOR DELETE USING (true);`;

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadAccessDirectory(): Promise<{ directory: AccessDirectory; setupSql?: string }> {
  try {
    const client = requireClient();
    const { data, error } = await client.from(TABLE).select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { directory: emptyDirectory(), setupSql: ACCESS_SETUP_SQL };
      throw new Error(error.message);
    }
    return { directory: asDirectory(data?.payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isMissingTableError(message) || /Faltan las claves/.test(message)) {
      return { directory: emptyDirectory(), setupSql: ACCESS_SETUP_SQL };
    }
    throw error;
  }
}

export async function saveAccessDirectory(directory: AccessDirectory): Promise<void> {
  const next = asDirectory(directory);
  const client = requireClient();
  const { error } = await client.from(TABLE).upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
