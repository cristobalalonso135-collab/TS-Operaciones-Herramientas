import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import {
  attachListing,
  listingSnapshot,
  photoCarga,
  seedAlbaranesState,
  type AlbaranesState,
} from '@/lib/albaranes-model';

const LOCAL_KEY = 'ts-albaranes-v1';
const STORE_ID = 'main';
const LISTING_ID = 'listing';
const LISTING_CHUNK = 'listing:';
const LISTING_CHUNK_SIZE = 4000;

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
    cargas: state.cargas.map((carga) => photoCarga(carga)),
    disappeared: [],
    evaluations: state.evaluations.filter((item) => item.loadDate >= from),
    communications: state.communications
      .filter((item) => item.loadDate >= from)
      .map((item) => ({ ...item, cuerpoHtml: item.cuerpoHtml })),
  };
}

function keepLastDetail(state: AlbaranesState): AlbaranesState {
  const lastId = state.cargas[state.cargas.length - 1]?.id;
  return {
    ...state,
    cargas: state.cargas.map((carga) => (
      carga.id === lastId
        ? { ...carga, rows: [] }
        : photoCarga(carga)
    )),
  };
}

function normalize(state: AlbaranesState): AlbaranesState {
  const seeded = seedAlbaranesState();
  return keepLastDetail({
    rules: state.rules.length > 0 ? state.rules : seeded.rules,
    agents: Array.isArray(state.agents) ? state.agents : [],
    colectivos: Array.isArray(state.colectivos) ? state.colectivos : [],
    colectivosFileName: typeof state.colectivosFileName === 'string' ? state.colectivosFileName : '',
    colectivosLoadedAt: typeof state.colectivosLoadedAt === 'string' ? state.colectivosLoadedAt : '',
    emailsFileName: typeof state.emailsFileName === 'string' ? state.emailsFileName : '',
    emailsLoadedAt: typeof state.emailsLoadedAt === 'string' ? state.emailsLoadedAt : '',
    cargas: Array.isArray(state.cargas) ? state.cargas : [],
    disappeared: [],
    evaluations: Array.isArray(state.evaluations) ? state.evaluations : [],
    lots: Array.isArray(state.lots) ? state.lots : [],
    communications: Array.isArray(state.communications) ? state.communications : [],
  });
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

async function clearListingRows(): Promise<void> {
  const client = requireClient();
  const { error: chunkError } = await client.from('albaranes_store').delete().like('id', `${LISTING_CHUNK}%`);
  if (chunkError) throw new Error(chunkError.message);
}

async function writeListing(state: AlbaranesState): Promise<void> {
  const snap = listingSnapshot(state);
  if (!snap) return;
  const client = requireClient();
  await clearListingRows();
  const packed = snap.listing;
  const now = new Date().toISOString();
  if (packed.length <= LISTING_CHUNK_SIZE) {
    const { error } = await client.from('albaranes_store').upsert({
      id: LISTING_ID,
      saved_at: now,
      payload: snap,
    }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    return;
  }
  const chunks: typeof packed[] = [];
  for (let i = 0; i < packed.length; i += LISTING_CHUNK_SIZE) {
    chunks.push(packed.slice(i, i + LISTING_CHUNK_SIZE));
  }
  const { error: metaError } = await client.from('albaranes_store').upsert({
    id: LISTING_ID,
    saved_at: now,
    payload: { ...snap, listing: [], chunkCount: chunks.length },
  }, { onConflict: 'id' });
  if (metaError) throw new Error(metaError.message);
  for (let i = 0; i < chunks.length; i += 1) {
    const { error } = await client.from('albaranes_store').upsert({
      id: `${LISTING_CHUNK}${i}`,
      saved_at: now,
      payload: { listing: chunks[i] },
    }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function readListing(): Promise<{ listing?: unknown; incidents?: unknown } | null> {
  const client = requireClient();
  const { data, error } = await client.from('albaranes_store').select('payload').eq('id', LISTING_ID).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return null;
    throw new Error(error.message);
  }
  const payload = data?.payload as { listing?: unknown; incidents?: unknown; chunkCount?: number } | null;
  if (!payload) return null;
  const chunkCount = Number(payload.chunkCount || 0);
  if (chunkCount <= 0) return payload;
  const ids = Array.from({ length: chunkCount }, (_, i) => `${LISTING_CHUNK}${i}`);
  const { data: rows, error: chunkError } = await client.from('albaranes_store').select('id, payload').in('id', ids);
  if (chunkError) throw new Error(chunkError.message);
  const byId = new Map((rows || []).map((row) => [row.id as string, row.payload as { listing?: unknown }]));
  const listing = ids.flatMap((id) => {
    const chunk = byId.get(id)?.listing;
    return Array.isArray(chunk) ? chunk : [];
  });
  return { ...payload, listing };
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
  await writeListing(state);
}

export async function loadAlbaranesState(): Promise<{ state: AlbaranesState; backend: AlbaranesBackend; setupSql?: string }> {
  try {
    const dedicated = await readDedicated();
    if (dedicated.kind === 'missing') return { state: readLocal(), backend: 'local', setupSql: ALBARANES_SETUP_SQL };
    if (dedicated.kind === 'ok' && dedicated.payload) {
      clearLocal();
      const listing = await readListing();
      return { state: attachListing(dedicated.payload, listing), backend: 'supabase' };
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
