ALTER TABLE itsm.incidents ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE itsm.incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE itsm.incidents
SET status = CASE UPPER(status)
  WHEN 'OPEN' THEN 'NEW'
  WHEN 'ACK' THEN 'ASSIGNED'
  WHEN 'IN_PROGRESS' THEN 'INVESTIGATING'
  ELSE UPPER(status)
END
WHERE status IS NOT NULL;

ALTER TABLE itsm.incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE itsm.incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('NEW', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'CLOSED'));
