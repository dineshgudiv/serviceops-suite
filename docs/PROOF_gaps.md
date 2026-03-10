# Gap Proof

Date: 2026-03-08

Status: Updated with session results

## Runtime blocker confirmed this session

The dominant blocker was not application code. It was the local Docker runtime:
- Docker engine API calls returned `500 Internal Server Error`
- `com.docker.service` was stopped
- starting that service was not permitted from this session
- gateway host checks failed with `127.0.0.1:8080` connection refused

## Runtime gaps proved by failure

- clean compose startup: not achieved
- service health convergence: not achieved
- smoke script pass: not achieved
- host `/health` and `/login` 200 checks: not achieved
- workflow HTTP execution: blocked
- audit persistence proof by query: blocked

## Route and truthfulness gaps confirmed by trace

- `/system-admin` is broken
  - UI points to `/api/bff/system/health`, `/config`, `/flags`
  - BFF allowlist only permits `auth`, `itsm`, `audit`, `sla`, `cmdb`, `knowledge`, `integrations`, `workflow`
  - no backend `/api/system/*` routes exist

- `/service-catalog` is broken
  - UI points to `/api/bff/catalog/services*`
  - BFF does not allow `catalog`
  - nginx does not expose `/api/catalog/*`

- `/integrations` is broken
  - UI expects `/api/bff/integrations`, `/test`, `/deliveries`
  - backend actually exposes `/api/integrations/notifications` and `/api/integrations/test-notification`

- `/dashboard` is only partial
  - KPI summary is backed by a real SQL query path
  - service health widget/path is not backed by any real backend endpoint
  - recommendation/evidence panel is truthful only when incident records already contain stored evidence/recommendation fields

- `/incidents`, `/changes`, `/problems` remain partial in UI terms
  - server lifecycle code exists
  - activity timelines are not audit-backed in the UI
  - create actions are still not fully exposed across all pages
