CREATE TABLE IF NOT EXISTS cmdb.cis (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  ci_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(org_key, ci_key)
);
CREATE TABLE IF NOT EXISTS cmdb.relationships (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  from_ci_key TEXT NOT NULL,
  to_ci_key TEXT NOT NULL,
  rel_type TEXT NOT NULL
);
