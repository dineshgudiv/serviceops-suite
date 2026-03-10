ALTER TABLE itsm.problems
  ADD COLUMN IF NOT EXISTS service_key TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS root_cause TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS known_error TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE itsm.problems
SET status = CASE UPPER(status)
  WHEN 'OPEN' THEN 'CREATED'
  ELSE UPPER(status)
END
WHERE status IS NOT NULL;

ALTER TABLE itsm.problems DROP CONSTRAINT IF EXISTS problems_status_check;
ALTER TABLE itsm.problems
  ADD CONSTRAINT problems_status_check
  CHECK (status IN ('CREATED', 'INCIDENT_LINKED', 'ROOT_CAUSE_IDENTIFIED', 'KNOWN_ERROR', 'CLOSED'));

CREATE TABLE IF NOT EXISTS itsm.problem_incidents (
  problem_id BIGINT NOT NULL REFERENCES itsm.problems(id) ON DELETE CASCADE,
  incident_id BIGINT NOT NULL REFERENCES itsm.incidents(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, incident_id)
);
