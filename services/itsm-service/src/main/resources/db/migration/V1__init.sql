CREATE TABLE IF NOT EXISTS itsm.incidents (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  title TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
