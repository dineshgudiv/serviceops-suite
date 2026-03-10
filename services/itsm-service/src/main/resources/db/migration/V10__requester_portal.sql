ALTER TABLE itsm.service_requests
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

ALTER TABLE itsm.timeline_entries
  ADD COLUMN IF NOT EXISTS service_request_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_service_requests_org_creator
  ON itsm.service_requests(org_key, created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_service_request
  ON itsm.timeline_entries(org_key, service_request_id, created_at DESC);
