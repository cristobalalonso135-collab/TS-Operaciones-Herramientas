import { supabase, supabaseConfigured } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/seguimiento-db';
import { normalizeArchive } from '@/lib/trade-archive';
import {
  ADIDAS_SEED_TERMS,
  EMPTY_ABONOS_STATE,
  EMPTY_CATALOGS,
  mergeCatalog,
  asOrigin,
  asSource,
  asStatus,
  abonosNeedRewrite,
  excessAmount,
  normalizeAttachments,
  receivedTotalFor,
  resolveManualStatus,
  syncAmountEstimate,
  shortPersonName,
  type AbonoCase,
  type AbonosCatalogs,
  type AbonosState,
  type CatalogKind,
} from '@/lib/abonos-model';

const LOCAL_KEY = 'ts-abonos-v1';
const STORE_ID = 'main';
export const ABONOS_SNAPSHOT_KEY = '__abonos_store__';

export const ABONOS_SETUP_SQL = `CREATE TABLE IF NOT EXISTS abonos_store (
  id TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE abonos_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abonos_store_read ON abonos_store;
DROP POLICY IF EXISTS abonos_store_insert ON abonos_store;
DROP POLICY IF EXISTS abonos_store_update ON abonos_store;
DROP POLICY IF EXISTS abonos_store_delete ON abonos_store;

CREATE POLICY abonos_store_read ON abonos_store FOR SELECT USING (true);
CREATE POLICY abonos_store_insert ON abonos_store FOR INSERT WITH CHECK (true);
CREATE POLICY abonos_store_update ON abonos_store FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY abonos_store_delete ON abonos_store FOR DELETE USING (true);`;

export type AbonosBackend = 'supabase' | 'local';

function remapLegacyArea(area: string): string {
  return area.trim().toLocaleLowerCase('es') === 'broadcast' ? 'Pro Clubs' : area;
}

function isPablo(value: string): boolean {
  return value.trim().toLocaleLowerCase('es').startsWith('pablo');
}

function isAbonosPayload(value: unknown): value is AbonosState {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AbonosState>;
  return Array.isArray(row.cases) && Array.isArray(row.receipts) && Array.isArray(row.tradeTerms);
}

function seedState(state: AbonosState): AbonosState {
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const cases = state.cases.map((row) => {
    const responsible = shortPersonName(row.responsible || row.addedBy);
    let status: AbonosState['cases'][number]['status'] = asStatus(row.status) || (isPablo(responsible) ? '' : 'Pendiente');
    const received = receivedTotalFor(row.id, receipts);
    const synced = syncAmountEstimate({
      amountMode: row.amountMode,
      estimated: typeof row.estimated === 'boolean' ? row.estimated : null,
      status,
    });
    const estimated = synced.estimated;
    if (status === 'A cuenta' || status === 'Exceso' || (estimated && received > 0.009)) {
      status = resolveManualStatus(status, row.expectedAmount, received, estimated);
    } else if (status === 'Liquidado' && excessAmount(row.expectedAmount, received) > 0.009) {
      status = 'Exceso';
    }
    const stored = row as AbonoCase & { comment?: string };
    const { comment: legacyComment, ...rest } = stored;
    return {
      ...rest,
      addedBy: shortPersonName(row.addedBy),
      responsible,
      area: remapLegacyArea(row.area),
      origin: asOrigin(row.origin),
      source: asSource(String(row.source || '')),
      informedBy: String(row.informedBy || '').trim(),
      attachments: normalizeAttachments(row.attachments),
      estimated,
      amountMode: synced.amountMode,
      amountCondition: String(row.amountCondition || '').trim(),
      concept: String(stored.concept || legacyComment || '').trim(),
      notes: String(stored.notes || '').trim(),
      status,
      communicatedAmount: typeof row.communicatedAmount === 'number' ? row.communicatedAmount : null,
    };
  });
  const catalogs: AbonosCatalogs = {
    brands: mergeCatalog(EMPTY_CATALOGS.brands, [...state.catalogs.brands, ...cases.map((row) => row.brand), ...state.tradeTerms.map((row) => row.brand)]),
    types: mergeCatalog(EMPTY_CATALOGS.types, [...state.catalogs.types, ...cases.map((row) => row.type)]),
    areas: mergeCatalog(EMPTY_CATALOGS.areas, [...state.catalogs.areas, ...cases.map((row) => row.area)])
      .filter((area) => area.trim().toLocaleLowerCase('es') !== 'broadcast'),
    teams: mergeCatalog(EMPTY_CATALOGS.teams, [...state.catalogs.teams, ...cases.map((row) => row.teamMotivo)]),
  };
  const tradeTerms = state.tradeTerms.length > 0
    ? state.tradeTerms
    : ADIDAS_SEED_TERMS.map((term) => ({ ...term, id: crypto.randomUUID() }));
  return {
    ...state,
    cases,
    catalogs,
    tradeTerms,
    claims: Array.isArray(state.claims) ? state.claims : [],
    archive: normalizeArchive(state.archive),
  };
}

function readLocal(): AbonosState {
  if (typeof window === 'undefined') return seedState(EMPTY_ABONOS_STATE);
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return seedState(EMPTY_ABONOS_STATE);
    const parsed = JSON.parse(raw) as Partial<AbonosState>;
    return seedState({
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
      tradeTerms: Array.isArray(parsed.tradeTerms) ? parsed.tradeTerms : [],
      catalogs: parsed.catalogs || EMPTY_CATALOGS,
      archive: parsed.archive,
    });
  } catch {
    return seedState(EMPTY_ABONOS_STATE);
  }
}

function writeLocal(state: AbonosState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function requireClient() {
  if (!supabase || !supabaseConfigured) {
    throw new Error('Faltan las claves de Supabase.');
  }
  return supabase;
}

type RemoteRead = { kind: 'ok'; payload: AbonosState | null } | { kind: 'missing' };

async function readDedicated(): Promise<RemoteRead> {
  const client = requireClient();
  const { data, error } = await client.from('abonos_store').select('payload').eq('id', STORE_ID).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return { kind: 'missing' };
    throw new Error(error.message);
  }
  return { kind: 'ok', payload: isAbonosPayload(data?.payload) ? data.payload : null };
}

async function readSharedSnapshot(): Promise<RemoteRead> {
  const client = requireClient();
  const { data, error } = await client.from('seguimiento_snapshots').select('payload').eq('week_key', ABONOS_SNAPSHOT_KEY).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) return { kind: 'missing' };
    throw new Error(error.message);
  }
  return { kind: 'ok', payload: isAbonosPayload(data?.payload) ? data.payload : null };
}

async function writeDedicated(state: AbonosState): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('abonos_store').upsert({
    id: STORE_ID,
    saved_at: new Date().toISOString(),
    payload: state,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

async function writeSharedSnapshot(state: AbonosState): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('seguimiento_snapshots').upsert({
    week_key: ABONOS_SNAPSHOT_KEY,
    saved_at: new Date().toISOString(),
    payload: state,
  }, { onConflict: 'week_key' });
  if (error) throw new Error(error.message);
}

export async function loadAbonosState(): Promise<{ state: AbonosState; backend: AbonosBackend; setupSql?: string }> {
  try {
    const dedicated = await readDedicated();
    if (dedicated.kind === 'ok' && dedicated.payload) {
      const state = seedState(dedicated.payload);
      if (abonosNeedRewrite(dedicated.payload)) await writeDedicated(state);
      return { state, backend: 'supabase' };
    }

    const shared = await readSharedSnapshot();
    if (shared.kind === 'ok' && shared.payload) {
      const state = seedState(shared.payload);
      if (dedicated.kind === 'ok') await writeDedicated(state);
      return { state, backend: 'supabase' };
    }

    const seeded = seedState(EMPTY_ABONOS_STATE);
    if (dedicated.kind === 'ok') {
      await writeDedicated(seeded);
      return { state: seeded, backend: 'supabase' };
    }
    if (shared.kind === 'ok') {
      await writeSharedSnapshot(seeded);
      return { state: seeded, backend: 'supabase' };
    }

    return { state: readLocal(), backend: 'local', setupSql: ABONOS_SETUP_SQL };
  } catch {
    return { state: readLocal(), backend: 'local', setupSql: ABONOS_SETUP_SQL };
  }
}

export async function saveAbonosState(state: AbonosState, backend: AbonosBackend): Promise<void> {
  const next = seedState(state);
  writeLocal(next);
  if (backend !== 'supabase') return;
  try {
    await writeDedicated(next);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingTableError(message)) throw error;
  }
  await writeSharedSnapshot(next);
}

const BACKUP_PREFIX = 'backup-';
const LOCAL_BACKUPS_KEY = 'ts-abonos-backups-v1';

export interface AbonosBackup {
  id: string;
  savedAt: string;
  count: number;
  reason: string;
}

function backupId(state: AbonosState): string {
  return `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}__${state.cases.length}`;
}

function parseBackupId(id: string, savedAt: string, reason = ''): AbonosBackup {
  const count = Number(id.split('__')[1]);
  return { id, savedAt, count: Number.isFinite(count) ? count : 0, reason };
}

/** Saves a full copy of the abonos state (cases, cobros, documents, trade terms) before a risky change. */
export async function createAbonosBackup(state: AbonosState, backend: AbonosBackend, reason: string): Promise<AbonosBackup> {
  const id = backupId(state);
  const savedAt = new Date().toISOString();
  const payload = { ...state, backupReason: reason };
  if (backend === 'supabase') {
    const client = requireClient();
    const { error } = await client.from('abonos_store').insert({ id, saved_at: savedAt, payload });
    if (error) throw new Error(`No he podido guardar la copia de seguridad: ${error.message}`);
  } else {
    const list = readLocalBackups();
    list.unshift({ id, savedAt, reason, payload });
    window.localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(list.slice(0, 5)));
  }
  return parseBackupId(id, savedAt, reason);
}

function readLocalBackups(): Array<{ id: string; savedAt: string; reason: string; payload: AbonosState }> {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_BACKUPS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listAbonosBackups(backend: AbonosBackend): Promise<AbonosBackup[]> {
  if (backend !== 'supabase') {
    return readLocalBackups().map((item) => parseBackupId(item.id, item.savedAt, item.reason));
  }
  const client = requireClient();
  const { data, error } = await client
    .from('abonos_store')
    .select('id, saved_at')
    .like('id', `${BACKUP_PREFIX}%`)
    .order('saved_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => parseBackupId(String(row.id), String(row.saved_at)));
}

export async function loadAbonosBackup(id: string, backend: AbonosBackend): Promise<AbonosState> {
  if (backend !== 'supabase') {
    const found = readLocalBackups().find((item) => item.id === id);
    if (!found) throw new Error('No encuentro esa copia.');
    return seedState(found.payload);
  }
  const client = requireClient();
  const { data, error } = await client.from('abonos_store').select('payload').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!isAbonosPayload(data?.payload)) throw new Error('La copia no tiene datos de abonos.');
  const { backupReason: _reason, ...rest } = data.payload as AbonosState & { backupReason?: string };
  return seedState(rest);
}

export function addCatalogValue(catalogs: AbonosCatalogs, kind: CatalogKind, value: string): AbonosCatalogs {
  const trimmed = value.trim();
  if (!trimmed) return catalogs;
  if (kind === 'brand') return { ...catalogs, brands: mergeCatalog(catalogs.brands, [trimmed]) };
  if (kind === 'type') return { ...catalogs, types: mergeCatalog(catalogs.types, [trimmed]) };
  if (kind === 'area') return { ...catalogs, areas: mergeCatalog(catalogs.areas, [trimmed]) };
  return { ...catalogs, teams: mergeCatalog(catalogs.teams, [trimmed]) };
}
