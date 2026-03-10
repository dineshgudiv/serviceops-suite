ALTER TABLE cmdb.cis
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod',
  ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'MED',
  ADD COLUMN IF NOT EXISTS service_key TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE cmdb.relationships
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cmdb_cis_org_service ON cmdb.cis(org_key, service_key);
CREATE INDEX IF NOT EXISTS idx_cmdb_rel_org_from ON cmdb.relationships(org_key, from_ci_key);
CREATE INDEX IF NOT EXISTS idx_cmdb_rel_org_to ON cmdb.relationships(org_key, to_ci_key);
