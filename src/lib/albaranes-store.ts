import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { photoCarga, seedAlbaranesState, type AlbaranesState } from '@/lib/albaranes-model';

const LOCAL_KEY = 'ts-albaranes-v1';
const STORE_ID = 'main';

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

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function photoState(state: AlbaranesState): AlbaranesState {
  const from = daysAgo(45);
  return {
    ...state,
    cargas: state.cargas.map(photoCarga),
    disappeared: [],
    evaluations: state.evaluations.filter((item) => item.loadDate >= from),
    communications: state.communications
      .filter((item) => item.loadDate >= from)
      .map((item) => ({ ...item, cuerpoHtml: item.cuerpoHtml })),
  };
}

function normalize(state: AlbaranesState): AlbaranesState {
  const seeded = seedAlbaranesState();
  return {
    rules: state.rules.length > 0 ? state.rules : seeded.rules,
    agents: Array.isArray(state.agents) ? state.agents : [],
    colectivos: Array.isArray(state.colectivos) ? state.colectivos : [],
    cargas: (Array.isArray(state.cargas) ? state.cargas : []).map(photoCarga),
    disappeared: [],
    evaluations: Array.isArray(state.evaluations) ? state.evaluations : [],
    lots: Array.isArray(state.lots) ? state.lots : [],
    communications: Array.isArray(state.communications) ? state.communications : [],
  };
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

function clearLocal() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* quota */
  }
}

function writeLocal(state: AlbaranesState) {
  if (typeof window === 'undefined') return;
  try {
    clearLocal();
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(photoState(state)));
  } catch {
    clearLocal();
  }
}

function requireClient() {
  if (!supabase || !supabaseConfigured) throw new Error('Faltan las claves de Supabase.');
  return supabase;
}

type RemoteRead = { kind: 'ok'; payload: AlbaranesState | null } | { kind: 'missing' };

async function readDedicated(): Promise<RemoteRead> {
  const client = requireClient();
  const { data, error } = await client.from('albaranes_store').select('payload').eq('id', STORE_ID).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return { kind: 'missing' };
    throw new Error(error.message);
  }
  if (!isState(data?.payload)) return { kind: 'ok', payload: null };
  return { kind: 'ok', payload: normalize(data.payload) };
}

async function writeDedicated(state: AlbaranesState): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('albaranes_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: photoState(state),
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  await client.from('albaranes_store').delete().like('id', 'carga:%');
}

export async function loadAlbaranesState(): Promise<{ state: AlbaranesState; backend: AlbaranesBackend; setupSql?: string }> {
  try {
    const dedicated = await readDedicated();
    if (dedicated.kind === 'missing') return { state: readLocal(), backend: 'local', setupSql: ALBARANES_SETUP_SQL };
    if (dedicated.kind === 'ok' && dedicated.payload) {
      clearLocal();
      return { state: dedicated.payload, backend: 'supabase' };
    }
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
  if (backend === 'supabase') {
    await writeDedicated(state);
    clearLocal();
    return;
  }
  writeLocal(next);
}
