CREATE TABLE IF NOT EXISTS integrations.notifications (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrations.webhook_events (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
