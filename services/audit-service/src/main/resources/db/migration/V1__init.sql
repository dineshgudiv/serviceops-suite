CREATE TABLE IF NOT EXISTS audit.audit_events (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  prev_hash TEXT,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
