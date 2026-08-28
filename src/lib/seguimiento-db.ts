import { supabase, supabaseConfigured } from '@/lib/supabase';
import { compareSnapshots, type TrackingSnapshot } from '@/lib/seguimiento-snapshots';

const TABLE = 'seguimiento_snapshots';

export const SNAPSHOT_SETUP_SQL = `CREATE TABLE IF NOT EXISTS seguimiento_snapshots (
  week_key TEXT PRIMARY KEY,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE seguimiento_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seguimiento_snapshots_read ON seguimiento_snapshots;
DROP POLICY IF EXISTS seguimiento_snapshots_insert ON seguimiento_snapshots;
DROP POLICY IF EXISTS seguimiento_snapshots_update ON seguimiento_snapshots;
DROP POLICY IF EXISTS seguimiento_snapshots_delete ON seguimiento_snapshots;

CREATE POLICY seguimiento_snapshots_read ON seguimiento_snapshots FOR SELECT USING (true);
CREATE POLICY seguimiento_snapshots_insert ON seguimiento_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY seguimiento_snapshots_update ON seguimiento_snapshots FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY seguimiento_snapshots_delete ON seguimiento_snapshots FOR DELETE USING (true);`;

type SnapshotRow = {
  week_key: string;
  saved_at: string;
  payload: TrackingSnapshot;
};

function requireClient() {
  if (!supabase || !supabaseConfigured) {
    throw new Error('Faltan las claves de Supabase en Vercel (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  }
  return supabase;
}

export function isMissingTableError(message: string): boolean {
  return /schema cache|could not find the table|does not exist|PGRST205|42P01/i.test(message);
}

export async function fetchSnapshotsFromDb(): Promise<TrackingSnapshot[]> {
  const client = requireClient();
  const { data, error } = await client.from(TABLE).select('payload').order('week_key', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Pick<SnapshotRow, 'payload'>[])
    .map((row) => row.payload)
    .filter((payload): payload is TrackingSnapshot => Boolean(payload && payload.weekKey));
  return rows.sort(compareSnapshots);
}

export async function upsertSnapshotRow(snapshot: TrackingSnapshot): Promise<void> {
  const client = requireClient();
  const { error } = await client.from(TABLE).upsert({
    week_key: snapshot.weekKey,
    saved_at: snapshot.savedAt,
    payload: snapshot,
  }, { onConflict: 'week_key' });
  if (error) throw new Error(error.message);
}

export async function deleteSnapshotRow(weekKey: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from(TABLE).delete().eq('week_key', weekKey);
  if (error) throw new Error(error.message);
}
