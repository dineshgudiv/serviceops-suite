CREATE TABLE IF NOT EXISTS itsm.problems (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itsm.changes (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  risk TEXT NOT NULL DEFAULT 'MEDIUM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itsm.catalog_services (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  service_key TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  sla_tier TEXT NOT NULL DEFAULT 'silver',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_key, service_key)
);
