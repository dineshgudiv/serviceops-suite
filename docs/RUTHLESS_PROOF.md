# Ruthless Proof

## What existed before

- The internal console already had real incident, change, problem, catalog, knowledge, audit, and dashboard routes.
- The web app already used same-origin BFF routing through `apps/web/src/app/api/bff/[...path]/route.ts`.
- Incident creation and lifecycle were already backed by `itsm-service` and PostgreSQL.
- Dashboard summary data was already backed by `services/itsm-service/src/main/java/com/serviceops/itsm/api/DashboardController.java`.
- A requester portal route tree had been started, with real incident and service-request creation plus requester-owned list/detail reads.

## What was fake or partial

- Service requests persisted, but agent lifecycle work was partial:
  - no assign endpoint
  - no approve/reject/fulfill/close lifecycle
  - no agent-authored public note endpoint
- Several internal ITSM list endpoints relied too much on frontend hiding:
  - requester users could still hit internal queue APIs unless the backend service itself blocked them
- The repo still contains seeded prototype components under `apps/web/src/components/serviceops/*` importing `apps/web/src/lib/seed/serviceops.ts`.
  - These were not the app-router pages audited for the main console, but they remain a prototype artifact in-tree.
- Dashboard is mostly real, but SLA remains thin:
  - `services/sla-service/src/main/java/com/serviceops/sla/api/SlaController.java` computes per-incident breach state from created time and policy
  - there is no pause-on-waiting-user logic
  - there is no broader SLA event engine beyond threshold checks
- Notifications are still shallow:
  - `integrations-service` records test notifications, but requester/agent workflow notifications are not yet wired end-to-end

## What was implemented in this pass

- Added server-side lifecycle support for service requests:
  - assign
  - approve
  - reject
  - fulfill
  - close
  - public note/comment
- Added real DB fields for service-request lifecycle and evidence:
  - `assigned_to`
  - `resolution_summary`
  - `approved_by`
  - `rejected_by`
  - `approved_at`
  - `rejected_at`
  - `fulfilled_at`
  - `closed_at`
- Tightened server-side RBAC on internal queue APIs:
  - incident queue access now requires analyst/admin
  - change queue access now requires analyst/admin
  - problem queue access now requires analyst/admin
  - internal catalog mutations and dependency/detail endpoints now require analyst/admin
- Hardened requester create behavior:
  - blank requester values on incident/service-request create now fall back to the authenticated subject
- Wired the internal catalog queue UI to the new real service-request lifecycle endpoints.
- Extended requester service-request detail data so requester pages can reflect assignee and resolution content from the same persisted entity.

## Routes and endpoints touched

Frontend routes used:

- `/portal`
- `/portal/knowledge`
- `/portal/catalog`
- `/portal/request-service`
- `/portal/report-issue`
- `/portal/my-requests`
- `/portal/requests/[kind]/[id]`
- `/catalog`

Backend endpoints added:

- `POST /api/itsm/service-requests/{id}/assign`
- `POST /api/itsm/service-requests/{id}/approve`
- `POST /api/itsm/service-requests/{id}/reject`
- `POST /api/itsm/service-requests/{id}/fulfill`
- `POST /api/itsm/service-requests/{id}/close`
- `POST /api/itsm/service-requests/{id}/comments`

Backend endpoints tightened:

- `GET /api/itsm/incidents`
- `GET /api/itsm/problems`
- `GET /api/itsm/changes`
- `POST /api/itsm/catalog`
- `PATCH|PUT /api/itsm/catalog/{serviceKey}`
- `DELETE /api/itsm/catalog/{serviceKey}`
- `GET /api/itsm/catalog/{serviceKey}`
- `GET /api/itsm/catalog/{serviceKey}/dependencies`

## Services, entities, and tables touched

Services:

- `services/itsm-service`

Tables:

- `itsm.service_requests`
- `itsm.timeline_entries`
- `itsm.incidents` (RBAC access path only in this pass)

Code entities:

- `ServiceRequestService`
- `ServiceRequestRecord`
- `ServiceRequestStatus`
- `RequesterPortalService`
- `IncidentService`
- `ChangeService`
- `ProblemService`
- `ItsmController`

## RBAC model

- `REQUESTER`
  - allowed: requester portal routes, requester-owned request list/detail/comment, create incident, create service request, requester-safe knowledge and catalog browsing
  - forbidden: internal incident/problem/change queues, internal-only console modules, catalog admin mutations
- `ANALYST`
  - allowed: internal console routes and internal queue APIs
  - allowed: work service requests and incidents
- `ADMIN`
  - allowed: all analyst capabilities plus admin-only flows already present in the repo

## Lifecycle model

Incident:

- `NEW -> ASSIGNED -> INVESTIGATING -> RESOLVED -> CLOSED`

Service Request:

- `SUBMITTED -> APPROVED -> FULFILLED -> CLOSED`
- `SUBMITTED -> REJECTED -> CLOSED`

Transition enforcement:

- invalid transitions raise structured backend errors
- service-request transitions append timeline entries and emit audit events

## Dashboard metric sources

Current dashboard summary source:

- `services/itsm-service/src/main/java/com/serviceops/itsm/api/DashboardController.java`

Backed metrics:

- `open_incidents_count`
- `mttr_minutes`
- `resolved_incidents_count`
- `current_sla_breaches_count`
- `sla_breach_pct`
- `systems_impacted_count`
- `knowledge_documents_count`
- `cmdb_ci_count`
- `audit_activity_24h_count`
- `incidents_by_severity`
- `problems_by_status`
- `changes_by_status`
- `tickets_by_service`
- `breaches_by_day`
- `recent_incidents`

## SLA logic

Current SLA source:

- `services/sla-service/src/main/java/com/serviceops/sla/api/SlaController.java`
- dashboard breach aggregation in `DashboardController`

What is real:

- severity-based breach checks against `sla.policies.target_minutes`
- breach counts derived from persisted incident age versus policy target

What is still limited:

- no pause/resume for waiting-on-user
- no richer SLA event history beyond threshold-based checks
- no full policy engine by assignment group or request type

## Files changed in this pass

- `apps/web/src/app/catalog/page.tsx`
- `apps/web/src/app/portal/request-service/page.tsx`
- `apps/web/src/app/portal/requests/[kind]/[id]/page.tsx`
- `apps/web/tests/smoke/auth-and-onboarding.spec.ts`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeService.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentService.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemService.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/RequesterPortalService.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestRecord.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestService.java`
- `services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestStatus.java`
- `services/itsm-service/src/main/resources/db/migration/V11__service_request_lifecycle.sql`
- `services/itsm-service/src/test/java/com/serviceops/itsm/api/ServiceRequestServiceTest.java`

## Test commands

Verified in this session:

- `npm run build` from `apps/web`

Previously verified before the current environment regressed:

- focused Playwright smoke for global incident create
- portal requester create-path smokes after earlier fixes were partially passing

Blocked in this session:

- containerized Java/Maven verification
- docker-compose runtime validation
- proof gate rerun

Evidence:

- `mvn` not installed in local PATH
- `java` not installed in local PATH
- Docker Desktop Windows service `com.docker.service` is stopped and could not be started from this session
- containerized Maven commands fail because the Docker Linux engine pipe is unavailable

## Manual verification once Docker is available

1. Start Docker Desktop and ensure `com.docker.service` is running.
2. Run `./scripts/up.ps1`.
3. Log in as admin and invite a requester.
4. Log in as requester and submit a service request.
5. Open `/portal/my-requests` and confirm the request is listed.
6. Log in as admin and open `/catalog`.
7. Confirm the same `SR-*` appears in Recent Service Requests.
8. Use `Assign to me`, then `Approve`, then `Fulfill`, then `Close`.
9. Log back in as requester and open the same request detail.
10. Confirm status, assignee, timeline updates, and resolution are visible.
11. Repeat for incident creation and internal incident lifecycle.
12. Run `./scripts/proof_serviceops.ps1`.

## Known limitations and blockers

- Backend compile/runtime validation is currently blocked by local environment, not resolved code proof:
  - Docker Desktop service unavailable
  - no local Java/Maven toolchain
- Internal service-request working UI currently uses prompt-based inputs for fulfillment summary and public note entry.
  - Functional, but not the final interaction quality for a 9/10 internal workflow surface.
- Notifications are not yet wired end-to-end for requester/agent lifecycle events.
- SLA remains threshold-based and does not yet support pause/resume semantics.
- Seeded prototype components still exist in `apps/web/src/components/serviceops/*` and should be removed or isolated after confirming no live route depends on them.
