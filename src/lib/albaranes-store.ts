import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { seedAlbaranesState, type AlbaranesState, type Carga } from '@/lib/albaranes-model';

const LOCAL_KEY = 'ts-albaranes-v1';
const STORE_ID = 'main';
const CARGA_PREFIX = 'carga:';

export const ALBARANES_SETUP_SQL = `CREATE TABLE IF NOT EXISTS albaranes_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE albaranes_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS albaranes_store_read ON albaranes_store;
DROP POLICY IF EXISTS albaranes_store_insert ON albaranes_store;
DROP POLICY IF EXISTS albaranes_store_update ON albaranes_store;
DROP POLICY IF EXISTS albaranes_store_delete ON albaranes_store;

CREATE POLICY albaranes_store_read ON albaranes_store FOR SELECT USING (true);
CREATE POLICY albaranes_store_insert ON albaranes_store FOR INSERT WITH CHECK (true);
CREATE POLICY albaranes_store_update ON albaranes_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY albaranes_store_delete ON albaranes_store FOR DELETE USING (true);`;

export type AlbaranesBackend = 'supabase' | 'local';

function isState(value: unknown): value is AlbaranesState {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AlbaranesState>;
  return Array.isArray(row.rules) && Array.isArray(row.agents) && Array.isArray(row.cargas);
}

function normalize(state: AlbaranesState): AlbaranesState {
  const seeded = seedAlbaranesState();
  return {
    rules: state.rules.length > 0 ? state.rules : seeded.rules,
    agents: Array.isArray(state.agents) ? state.agents : [],
    colectivos: Array.isArray(state.colectivos) ? state.colectivos : [],
    cargas: Array.isArray(state.cargas) ? state.cargas : [],
    disappeared: Array.isArray(state.disappeared) ? state.disappeared : [],
    evaluations: Array.isArray(state.evaluations) ? state.evaluations : [],
    lots: Array.isArray(state.lots) ? state.lots : [],
    communications: Array.isArray(state.communications) ? state.communications : [],
  };
}

function compactCarga(carga: Carga): Carga {
  return carga;
}

function readLocal(): AlbaranesState {
  if (typeof window === 'undefined') return seedAlbaranesState();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return seedAlbaranesState();
    const parsed = JSON.parse(raw) as unknown;
    return isState(parsed) ? normalize(parsed) : seedAlbaranesState();
  } catch {
    return seedAlbaranesState();
  }
}

function writeLocal(state: AlbaranesState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

type RemoteRead = { kind: 'ok'; payload: AlbaranesState | null } | { kind: 'missing' };

async function readDedicated(): Promise<RemoteRead> {
  const client = requireClient();
  const { data: mainRow, error: mainError } = await client.from('albaranes_store').select('payload').eq('id', STORE_ID).maybeSingle();
  if (mainError) {
    if (isMissingTableError(mainError.message)) return { kind: 'missing' };
    throw new Error(mainError.message);
  }
  if (!isState(mainRow?.payload)) return { kind: 'ok', payload: null };
  const { data: cargaRows, error: cargaError } = await client.from('albaranes_store').select('payload').like('id', `${CARGA_PREFIX}%`);
  if (cargaError) {
    if (isMissingTableError(cargaError.message)) return { kind: 'missing' };
    throw new Error(cargaError.message);
  }
  const cargas = (cargaRows || [])
    .map((row) => row.payload as Carga)
    .filter((row) => row && row.id && Array.isArray(row.rows))
    .sort((a, b) => a.loadedAt.localeCompare(b.loadedAt));
  return {
    kind: 'ok',
    payload: normalize({
      ...mainRow.payload,
      cargas: cargas.length > 0 ? cargas : mainRow.payload.cargas,
    }),
  };
}

async function writeDedicated(state: AlbaranesState): Promise<void> {
  const client = requireClient();
  const meta: AlbaranesState = { ...state, cargas: [] };
  const rows = [
    { id: STORE_ID, saved_at: new Date().toISOString(), payload: meta },
    ...state.cargas.map((carga) => ({
      id: `${CARGA_PREFIX}${carga.id}`,
      saved_at: carga.loadedAt,
      payload: compactCarga(carga),
    })),
  ];
  const { error } = await client.from('albaranes_store').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function loadAlbaranesState(): Promise<{ state: AlbaranesState; backend: AlbaranesBackend; setupSql?: string }> {
  try {
    const dedicated = await readDedicated();
    if (dedicated.kind === 'missing') return { state: readLocal(), backend: 'local', setupSql: ALBARANES_SETUP_SQL };
    if (dedicated.kind === 'ok' && dedicated.payload) return { state: dedicated.payload, backend: 'supabase' };
    const seeded = seedAlbaranesState();
    if (dedicated.kind === 'ok') {
      await writeDedicated(seeded);
      return { state: seeded, backend: 'supabase' };
    }
    return { state: readLocal(), backend: 'local', setupSql: ALBARANES_SETUP_SQL };
  } catch {
    return { state: readLocal(), backend: 'local', setupSql: ALBARANES_SETUP_SQL };
  }
}

export async function saveAlbaranesState(state: AlbaranesState, backend: AlbaranesBackend): Promise<void> {
  const next = normalize(state);
  writeLocal(next);
  if (backend !== 'supabase') return;
  await writeDedicated(next);
}
