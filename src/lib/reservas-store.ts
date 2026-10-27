import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { asReservasCatalog, emptyReservasCatalog, type ReservasCatalog } from '@/lib/reservas-model';

const LOCAL_KEY = 'ts-reservas-curves-v1';
const DRAFT_KEY = 'ts-reservas-draft-v1';
const STORE_ID = 'main';

export const RESERVAS_SETUP_SQL = `CREATE TABLE IF NOT EXISTS reservas_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE reservas_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservas_store_read ON reservas_store;
DROP POLICY IF EXISTS reservas_store_insert ON reservas_store;
DROP POLICY IF EXISTS reservas_store_update ON reservas_store;
DROP POLICY IF EXISTS reservas_store_delete ON reservas_store;

CREATE POLICY reservas_store_read ON reservas_store FOR SELECT USING (true);
CREATE POLICY reservas_store_insert ON reservas_store FOR INSERT WITH CHECK (true);
CREATE POLICY reservas_store_update ON reservas_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY reservas_store_delete ON reservas_store FOR DELETE USING (true);`;

export type ReservasBackend = 'supabase' | 'local';

function writeLocal(catalog: ReservasCatalog) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(catalog));
}

function readLocal(): ReservasCatalog {
  if (typeof window === 'undefined') return emptyReservasCatalog();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyReservasCatalog();
    return asReservasCatalog(JSON.parse(raw));
  } catch {
    return emptyReservasCatalog();
  }
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

export async function loadReservasCatalog(): Promise<{
  catalog: ReservasCatalog;
  backend: ReservasBackend;
  setupSql?: string;
}> {
  try {
    const client = requireClient();
    const { data, error } = await client.from('reservas_store').select('payload').eq('id', STORE_ID).maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) return { catalog: readLocal(), backend: 'local', setupSql: RESERVAS_SETUP_SQL };
      throw new Error(error.message);
    }
    if (data?.payload) return { catalog: asReservasCatalog(data.payload), backend: 'supabase' };
    return { catalog: emptyReservasCatalog(), backend: 'supabase' };
  } catch {
    return { catalog: readLocal(), backend: 'local', setupSql: RESERVAS_SETUP_SQL };
  }
}

export async function saveReservasCatalog(catalog: ReservasCatalog, backend: ReservasBackend): Promise<void> {
  const next = asReservasCatalog(catalog);
  writeLocal(next);
  if (backend === 'local') return;
  const client = requireClient();
  const { error } = await client.from('reservas_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: next,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export interface ReservaDraft {
  players: number;
  mixAdult: number;
  lineIds: string[];
  lines: { id: string; adultQty: number; youthQty: number; onesizeQty: number }[];
}

export function readReservaDraft(): ReservaDraft {
  if (typeof window === 'undefined') return { players: 0, mixAdult: 70, lineIds: [], lines: [] };
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return { players: 0, mixAdult: 70, lineIds: [], lines: [] };
    const parsed = JSON.parse(raw) as Partial<ReservaDraft>;
    return {
      players: Number(parsed.players) || 0,
      mixAdult: Number(parsed.mixAdult) || 70,
      lineIds: Array.isArray(parsed.lineIds) ? parsed.lineIds.map(String) : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines.map((line) => ({
        id: String(line.id || ''),
        adultQty: Number(line.adultQty) || 0,
        youthQty: Number(line.youthQty) || 0,
        onesizeQty: Number(line.onesizeQty) || 0,
      })).filter((line) => line.id) : [],
    };
  } catch {
    return { players: 0, mixAdult: 70, lineIds: [], lines: [] };
  }
}

export function writeReservaDraft(draft: ReservaDraft) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
