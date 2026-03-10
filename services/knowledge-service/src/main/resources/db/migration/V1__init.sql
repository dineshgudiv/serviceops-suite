CREATE TABLE IF NOT EXISTS knowledge.documents (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
