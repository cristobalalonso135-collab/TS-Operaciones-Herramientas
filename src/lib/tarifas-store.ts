import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asProduct, type TarifaProduct } from '@/lib/tarifas-model';

const LOCAL_KEY = 'ts-tarifas-v1';
const STORE_ID = 'main';

export const TARIFAS_SETUP_SQL = `CREATE TABLE IF NOT EXISTS tarifas_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE tarifas_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarifas_store_read ON tarifas_store;
DROP POLICY IF EXISTS tarifas_store_insert ON tarifas_store;
DROP POLICY IF EXISTS tarifas_store_update ON tarifas_store;
DROP POLICY IF EXISTS tarifas_store_delete ON tarifas_store;

CREATE POLICY tarifas_store_read ON tarifas_store FOR SELECT USING (true);
CREATE POLICY tarifas_store_insert ON tarifas_store FOR INSERT WITH CHECK (true);
CREATE POLICY tarifas_store_update ON tarifas_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY tarifas_store_delete ON tarifas_store FOR DELETE USING (true);`;

export type TarifasBackend = 'supabase' | 'local';

function normalize(products: unknown): TarifaProduct[] {
  if (!Array.isArray(products)) return [];
  return products.map(asProduct).filter((item) => item.name);
}

function looksLikePayload(value: unknown): value is { products: unknown[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { products?: unknown }).products));
}

function writeLocal(products: TarifaProduct[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ products }));
}

function readLocal(seed: TarifaProduct[]): TarifaProduct[] {
  if (typeof window === 'undefined') return seed;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as unknown;
    if (looksLikePayload(parsed) && parsed.products.length > 0) return normalize(parsed.products);
    if (Array.isArray(parsed) && parsed.length > 0) return normalize(parsed);
    return seed;
  } catch {
    return seed;
  }
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadTarifasCatalog(seed: TarifaProduct[]): Promise<{
  products: TarifaProduct[];
  backend: TarifasBackend;
  setupSql?: string;
}> {
  const fallback = normalize(seed);
  try {
    const client = requireClient();
    const { data, error } = await client.from('tarifas_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { products: readLocal(fallback), backend: 'local', setupSql: TARIFAS_SETUP_SQL };
      throw new Error(error.message);
    }
    if (looksLikePayload(data?.payload) && data.payload.products.length > 0) {
      return { products: normalize(data.payload.products), backend: 'supabase' };
    }
    return { products: fallback, backend: 'supabase' };
  } catch {
    return { products: readLocal(fallback), backend: 'local', setupSql: TARIFAS_SETUP_SQL };
  }
}

export async function saveTarifasCatalog(products: TarifaProduct[], backend: TarifasBackend): Promise<void> {
  const next = normalize(products);
  writeLocal(next);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('tarifas_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: { products: next },
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
