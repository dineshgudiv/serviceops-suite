ALTER TABLE itsm.incidents
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'P3',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS service_key TEXT,
  ADD COLUMN IF NOT EXISTS ci_key TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE itsm.changes
  ADD COLUMN IF NOT EXISTS service_key TEXT,
  ADD COLUMN IF NOT EXISTS ci_key TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod',
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS itsm.alert_events (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  source TEXT NOT NULL DEFAULT 'manual',
  service_key TEXT,
  ci_key TEXT,
  environment TEXT NOT NULL DEFAULT 'prod',
  fingerprint TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_key, alert_key)
);

CREATE TABLE IF NOT EXISTS itsm.deploy_events (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  deploy_key TEXT NOT NULL,
  service_key TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'prod',
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCEEDED',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_key, deploy_key)
);

CREATE TABLE IF NOT EXISTS itsm.situations (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  situation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  severity TEXT NOT NULL DEFAULT 'P3',
  service_key TEXT,
  environment TEXT NOT NULL DEFAULT 'prod',
  summary TEXT NOT NULL DEFAULT '',
  incident_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_key, situation_key)
);

CREATE TABLE IF NOT EXISTS itsm.situation_alerts (
  situation_id BIGINT NOT NULL REFERENCES itsm.situations(id) ON DELETE CASCADE,
  alert_id BIGINT NOT NULL REFERENCES itsm.alert_events(id) ON DELETE CASCADE,
  PRIMARY KEY (situation_id, alert_id)
);

CREATE TABLE IF NOT EXISTS itsm.evidence (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itsm.timeline_entries (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  incident_id BIGINT,
  situation_id BIGINT,
  entry_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itsm_alert_org_service ON itsm.alert_events(org_key, service_key, environment);
CREATE INDEX IF NOT EXISTS idx_itsm_situation_org_service ON itsm.situations(org_key, service_key, environment);
