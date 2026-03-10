CREATE TABLE IF NOT EXISTS sla.policies (
  id BIGSERIAL PRIMARY KEY,
  org_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  target_minutes INT NOT NULL,
  UNIQUE(org_key, severity)
);
INSERT INTO sla.policies(org_key,severity,target_minutes) VALUES
('demo','P1',30),('demo','P2',120),('demo','P3',480)
ON CONFLICT (org_key,severity) DO NOTHING;
