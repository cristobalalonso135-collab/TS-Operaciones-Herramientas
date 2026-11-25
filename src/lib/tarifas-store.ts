import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asReservasCatalog, emptyReservasCatalog, type ReservasCatalog } from '@/lib/reservas-model';
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

function looksLikePayload(value: unknown): value is { products: unknown[]; reservas?: unknown } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { products?: unknown }).products));
}

function reservasOf(value: unknown): ReservasCatalog | undefined {
  if (!looksLikePayload(value) || value.reservas == null) return undefined;
  return asReservasCatalog(value.reservas);
}

function writeLocal(products: TarifaProduct[], reservas?: ReservasCatalog) {
  if (typeof window === 'undefined') return;
  const prev = readLocalPayload();
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify({
    products,
    reservas: reservas ?? prev.reservas ?? emptyReservasCatalog(),
  }));
}

function readLocalPayload(): { products: TarifaProduct[]; reservas?: ReservasCatalog } {
  if (typeof window === 'undefined') return { products: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return { products: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (looksLikePayload(parsed)) {
      return { products: normalize(parsed.products), reservas: reservasOf(parsed) };
    }
    if (Array.isArray(parsed)) return { products: normalize(parsed) };
    return { products: [] };
  } catch {
    return { products: [] };
  }
}

function readLocal(seed: TarifaProduct[]): TarifaProduct[] {
  const local = readLocalPayload();
  return local.products.length > 0 ? local.products : seed;
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadTarifasCatalog(seed: TarifaProduct[]): Promise<{
  products: TarifaProduct[];
  reservas?: ReservasCatalog;
  backend: TarifasBackend;
  setupSql?: string;
}> {
  const fallback = normalize(seed);
  const local = readLocalPayload();
  try {
    const client = requireClient();
    const { data, error } = await client.from('tarifas_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) {
        return {
          products: local.products.length > 0 ? local.products : fallback,
          reservas: local.reservas,
          backend: 'local',
          setupSql: TARIFAS_SETUP_SQL,
        };
      }
      throw new Error(error.message);
    }
    if (looksLikePayload(data?.payload) && data.payload.products.length > 0) {
      return {
        products: normalize(data.payload.products),
        reservas: reservasOf(data.payload),
        backend: 'supabase',
      };
    }
    return { products: fallback, reservas: reservasOf(data?.payload) || local.reservas, backend: 'supabase' };
  } catch {
    return {
      products: local.products.length > 0 ? local.products : fallback,
      reservas: local.reservas,
      backend: 'local',
      setupSql: TARIFAS_SETUP_SQL,
    };
  }
}

export async function saveTarifasCatalog(
  products: TarifaProduct[],
  backend: TarifasBackend,
  reservas?: ReservasCatalog,
): Promise<void> {
  const next = normalize(products);
  const nextReservas = asReservasCatalog(reservas ?? readLocalPayload().reservas ?? emptyReservasCatalog());
  writeLocal(next, nextReservas);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('tarifas_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: { products: next, reservas: nextReservas },
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}
