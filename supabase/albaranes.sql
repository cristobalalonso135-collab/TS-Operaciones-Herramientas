CREATE TABLE IF NOT EXISTS albaranes_store (
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
CREATE POLICY albaranes_store_delete ON albaranes_store FOR DELETE USING (true);
