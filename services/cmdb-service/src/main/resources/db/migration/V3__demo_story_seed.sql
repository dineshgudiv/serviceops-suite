INSERT INTO cmdb.cis(org_key, ci_key, name, type, status, owner, environment, criticality, service_key, updated_at)
SELECT 'demo', 'ci-orders-api', 'Orders API', 'APPLICATION', 'ACTIVE', 'platform-ops', 'prod', 'HIGH', 'svc-ordering', now()
WHERE NOT EXISTS (
  SELECT 1 FROM cmdb.cis WHERE org_key = 'demo' AND ci_key = 'ci-orders-api'
);

INSERT INTO cmdb.cis(org_key, ci_key, name, type, status, owner, environment, criticality, service_key, updated_at)
SELECT 'demo', 'ci-orders-db-primary', 'Orders PostgreSQL Primary', 'DATABASE', 'ACTIVE', 'dba-team', 'prod', 'HIGH', 'svc-ordering', now()
WHERE NOT EXISTS (
  SELECT 1 FROM cmdb.cis WHERE org_key = 'demo' AND ci_key = 'ci-orders-db-primary'
);

INSERT INTO cmdb.relationships(org_key, from_ci_key, to_ci_key, rel_type, source, confidence)
SELECT 'demo', 'ci-orders-api', 'ci-orders-db-primary', 'depends_on', 'demo_seed', 1.0
WHERE NOT EXISTS (
  SELECT 1
  FROM cmdb.relationships
  WHERE org_key = 'demo'
    AND from_ci_key = 'ci-orders-api'
    AND to_ci_key = 'ci-orders-db-primary'
    AND rel_type = 'depends_on'
);
