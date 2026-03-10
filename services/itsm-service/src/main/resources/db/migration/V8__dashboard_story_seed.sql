INSERT INTO itsm.catalog_services(org_key, service_key, name, owner, sla_tier)
SELECT 'demo', 'svc-ordering', 'Ordering Service', 'platform-ops', 'gold'
WHERE NOT EXISTS (
  SELECT 1 FROM itsm.catalog_services WHERE org_key = 'demo' AND service_key = 'svc-ordering'
);

INSERT INTO itsm.incidents(
  org_key,
  title,
  description,
  severity,
  status,
  created_by,
  assigned_to,
  service_key,
  ci_key,
  environment,
  created_at,
  updated_at,
  resolved_at
)
SELECT
  'demo',
  'Orders API latency spike from database pool exhaustion',
  'Customer checkouts slowed after the primary database connection pool saturated under burst traffic.',
  'P1',
  'RESOLVED',
  'admin@demo.local',
  'oncall-db',
  'svc-ordering',
  'ci-orders-db-primary',
  'prod',
  now() - interval '1 day 2 hours',
  now() - interval '1 day 1 hour 5 minutes',
  now() - interval '1 day 1 hour'
WHERE NOT EXISTS (
  SELECT 1
  FROM itsm.incidents
  WHERE org_key = 'demo'
    AND title = 'Orders API latency spike from database pool exhaustion'
);

INSERT INTO itsm.incidents(
  org_key,
  title,
  description,
  severity,
  status,
  created_by,
  assigned_to,
  service_key,
  ci_key,
  environment,
  created_at,
  updated_at,
  resolved_at
)
SELECT
  'demo',
  'Read replica lag still threatening order history lookups',
  'Replica lag continued after the primary fix and is breaching the P2 target for read-heavy requests.',
  'P2',
  'INVESTIGATING',
  'admin@demo.local',
  'oncall-app',
  'svc-ordering',
  'ci-orders-db-primary',
  'prod',
  now() - interval '4 hours',
  now() - interval '45 minutes',
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM itsm.incidents
  WHERE org_key = 'demo'
    AND title = 'Read replica lag still threatening order history lookups'
);

INSERT INTO itsm.problems(
  org_key,
  title,
  status,
  owner,
  service_key,
  summary,
  root_cause,
  known_error,
  created_at,
  updated_at
)
SELECT
  'demo',
  'Ordering database saturation under burst checkout load',
  'KNOWN_ERROR',
  'platform-ops',
  'svc-ordering',
  'Repeated database saturation impacts checkout latency and read replica freshness.',
  'Application pool burst limits were higher than the primary PostgreSQL max connection budget.',
  'Throttle burst concurrency and apply the reviewed pool sizing change before major promotions.',
  now() - interval '1 day',
  now() - interval '30 minutes'
WHERE NOT EXISTS (
  SELECT 1
  FROM itsm.problems
  WHERE org_key = 'demo'
    AND title = 'Ordering database saturation under burst checkout load'
);

INSERT INTO itsm.problem_incidents(problem_id, incident_id)
SELECT p.id, i.id
FROM itsm.problems p
JOIN itsm.incidents i ON i.org_key = p.org_key
WHERE p.org_key = 'demo'
  AND p.title = 'Ordering database saturation under burst checkout load'
  AND i.title = 'Orders API latency spike from database pool exhaustion'
ON CONFLICT DO NOTHING;

INSERT INTO itsm.problem_incidents(problem_id, incident_id)
SELECT p.id, i.id
FROM itsm.problems p
JOIN itsm.incidents i ON i.org_key = p.org_key
WHERE p.org_key = 'demo'
  AND p.title = 'Ordering database saturation under burst checkout load'
  AND i.title = 'Read replica lag still threatening order history lookups'
ON CONFLICT DO NOTHING;

INSERT INTO itsm.changes(
  org_key,
  title,
  status,
  risk,
  created_at,
  updated_at,
  service_key,
  ci_key,
  environment,
  owner,
  requested_by,
  approved_by,
  plan,
  rollback_plan,
  preview_command,
  change_window_start,
  change_window_end,
  approved_at,
  implemented_at,
  reviewed_at
)
SELECT
  'demo',
  'Increase orders DB pool guardrails and replica alerting',
  'REVIEWED',
  'P2',
  now() - interval '20 hours',
  now() - interval '10 minutes',
  'svc-ordering',
  'ci-orders-db-primary',
  'prod',
  'platform-ops',
  'admin@demo.local',
  'admin@demo.local',
  'Tune pool ceilings, add replica lag alert thresholds, and cap burst concurrency in the API.',
  'Rollback to previous pool settings and disable new alert thresholds.',
  'svcctl preview apply --service svc-ordering --change chg-orders-db-capacity',
  now() - interval '18 hours',
  now() - interval '17 hours',
  now() - interval '18 hours',
  now() - interval '17 hours 20 minutes',
  now() - interval '16 hours 30 minutes'
WHERE NOT EXISTS (
  SELECT 1
  FROM itsm.changes
  WHERE org_key = 'demo'
    AND title = 'Increase orders DB pool guardrails and replica alerting'
);
