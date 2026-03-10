INSERT INTO knowledge.documents(
  org_key,
  title,
  content,
  source_type,
  source_ref,
  approval_status,
  visibility,
  service_key,
  ci_key,
  environment,
  tags,
  excerpt,
  created_by,
  updated_at
)
SELECT
  'demo',
  'Orders API database saturation postmortem',
  'Summary: Orders API latency breached the P1 target after the primary PostgreSQL instance exhausted the application connection pool. Resolution: cap burst concurrency, tune pool sizing, and promote read replica guardrails.',
  'postmortem',
  'chg-orders-db-capacity',
  'approved',
  'viewer',
  'svc-ordering',
  'ci-orders-db-primary',
  'prod',
  'postmortem,orders,database,sla',
  'Orders API latency breached the P1 target after the primary PostgreSQL instance exhausted the application connection pool.',
  'admin@demo.local',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM knowledge.documents
  WHERE org_key = 'demo'
    AND title = 'Orders API database saturation postmortem'
);
