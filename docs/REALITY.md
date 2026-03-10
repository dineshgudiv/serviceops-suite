# Reality Audit

Date: 2026-03-05

## Phase 0 Truth Snapshot (Before Fix)

`docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml config --services`

```text
gateway-mock
```

Status: TRASH (mock-only stack)

## Current Compose Services (After Fix)

```text
postgres
auth-service
audit-service
itsm-service
web
gateway
```

## Tree (top 3 levels)

### infra/
```text
f infra/docker-compose.dev.yml
f infra/docker-compose.yml
d infra/grafana
d infra/grafana/dashboards
f infra/grafana/dashboards/.gitkeep
f infra/grafana/dashboards/README.md
d infra/grafana/provisioning
f infra/grafana/provisioning/.gitkeep
f infra/grafana/provisioning/README.md
d infra/kafka
f infra/kafka/topics.sh
d infra/loki
f infra/loki/loki.yml
d infra/nginx
f infra/nginx/nginx.conf
d infra/opensearch
f infra/opensearch/opensearch.yml
d infra/postgres
d infra/postgres/init
f infra/postgres/init/001_schemas.sql
d infra/prometheus
f infra/prometheus/alerts.yml
f infra/prometheus/prometheus.yml
d infra/tempo
f infra/tempo/tempo.yml
```

### services/
```text
d services/audit-service
f services/audit-service/Dockerfile
f services/audit-service/pom.xml
d services/audit-service/src
d services/auth-service
f services/auth-service/Dockerfile
f services/auth-service/pom.xml
d services/auth-service/src
d services/cmdb-service
d services/gateway
d services/integrations-service
d services/itsm-service
f services/itsm-service/Dockerfile
f services/itsm-service/pom.xml
d services/itsm-service/src
d services/knowledge-service
d services/sla-service
d services/workflow-service
```

### apps/web/
```text
f apps/web/Dockerfile
f apps/web/middleware.ts
f apps/web/next.config.js
f apps/web/package.json
d apps/web/public
f apps/web/public/README.md
d apps/web/src
d apps/web/src/app
d apps/web/src/components
d apps/web/src/lib
d apps/web/src/styles
```

## Empty Directories Snapshot

Before implementation:
- Empty directory count: 53
- Top 30 recorded in initial audit (see docs/EMPTY_DIRS.md)

After cleanup:
- Empty directories remaining: 0 (PowerShell false-positive may appear for `apps/web/src/app/api/bff/[...path]` due wildcard parsing; directory contains files)
