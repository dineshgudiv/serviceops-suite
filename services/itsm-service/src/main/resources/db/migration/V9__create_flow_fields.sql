ALTER TABLE itsm.incidents
  ADD COLUMN IF NOT EXISTS impact TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS requester TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

ALTER TABLE itsm.changes
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';

ALTER TABLE itsm.problems
  ADD COLUMN IF NOT EXISTS impact_summary TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS itsm.service_requests (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  service_key TEXT NOT NULL,
  short_description TEXT NOT NULL,
  justification TEXT NOT NULL,
  created_by_user_id TEXT,
  requester TEXT NOT NULL,
  approval_target TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_org_created
  ON itsm.service_requests(org_key, created_at DESC);
