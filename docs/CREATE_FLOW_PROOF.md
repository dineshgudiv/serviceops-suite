# Create Flow Proof

## Scope

This change closes the discoverability gap for creating work items by adding:

- a global `Create` launcher in the app header
- dashboard quick actions
- module-local create CTAs
- dedicated real create routes for incidents, service requests, changes, and problems
- real persistence for service requests

## What Was Found

- The shell/header already existed in [`apps/web/src/components/AppShell.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/components/AppShell.tsx).
- Real persisted create flows already existed for incidents, changes, and problems in `itsm-service`.
- The web app already had a same-origin BFF proxy in [`apps/web/src/app/api/bff/[...path]/route.ts`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/api/bff/[...path]/route.ts).
- Structured backend errors already used `{ request_id, code, message, details? }`.
- Audit logging hooks already existed in `itsm-service`.
- Catalog data existed, but there was no real service-request persistence flow or create UX entry point.

## What Was Missing

- No global, obvious create entry point in the header.
- No dashboard quick-action routing into real create flows.
- No consistent shared create experience across modules.
- No dedicated service request persistence path in backend or database.
- No list-page success handling for created IDs.
- No smoke coverage for the end-to-end global create incident path.

## Frontend Flow

Header/dashboard/module CTA -> Next.js route -> shared create page -> `api` client -> `/api/bff/itsm/...` -> gateway -> `itsm-service` -> PostgreSQL -> response -> redirect back to owning list with `?created=...` -> list refresh and success banner.

Implemented routes:

- `/incidents/new`
- `/catalog/request`
- `/changes/new`
- `/problems/new`

Create submit endpoints used:

- `POST /api/itsm/incidents`
- `POST /api/itsm/service-requests`
- `POST /api/itsm/changes`
- `POST /api/itsm/problems`

Read endpoints used for form/list hydration:

- `GET /api/session/me`
- `GET /api/itsm/catalog`
- `GET /api/itsm/incidents`
- `GET /api/itsm/service-requests`

## Backend Flow

The create routes persist to real tables in `itsm-service`:

- `itsm.incidents`
- `itsm.changes`
- `itsm.problems`
- `itsm.service_requests`

Migration added:

- [`services/itsm-service/src/main/resources/db/migration/V9__create_flow_fields.sql`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/resources/db/migration/V9__create_flow_fields.sql)

Audit hooks used:

- incident create continues through existing incident audit behavior
- change create continues through existing change audit behavior
- problem create continues through existing problem audit behavior
- service request create now emits `service_request.created`

## DB Tables / Entities Touched

- `itsm.incidents`
  - added `impact`, `urgency`, `category`, `requester`, `attachment_name`
- `itsm.changes`
  - added `description`, `reason`
- `itsm.problems`
  - added `impact_summary`
- `itsm.service_requests`
  - new table for real catalog-backed requests

Java records/services touched:

- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java)

## Files Changed

Frontend:

- [`apps/web/src/components/AppShell.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/components/AppShell.tsx)
- [`apps/web/src/components/create/CreateWorkItemLauncher.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/components/create/CreateWorkItemLauncher.tsx)
- [`apps/web/src/components/create/CreateWorkItemPage.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/components/create/CreateWorkItemPage.tsx)
- [`apps/web/src/app/dashboard/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/dashboard/page.tsx)
- [`apps/web/src/app/incidents/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/incidents/page.tsx)
- [`apps/web/src/app/incidents/new/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/incidents/new/page.tsx)
- [`apps/web/src/app/catalog/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/catalog/page.tsx)
- [`apps/web/src/app/catalog/request/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/catalog/request/page.tsx)
- [`apps/web/src/app/changes/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/changes/page.tsx)
- [`apps/web/src/app/changes/new/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/changes/new/page.tsx)
- [`apps/web/src/app/problems/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/problems/page.tsx)
- [`apps/web/src/app/problems/new/page.tsx`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/problems/new/page.tsx)
- [`apps/web/tests/smoke/auth-and-onboarding.spec.ts`](/C:/Users/91889/Music/projects/serviceops-suite/apps/web/tests/smoke/auth-and-onboarding.spec.ts)

Backend:

- [`services/itsm-service/src/main/resources/db/migration/V9__create_flow_fields.sql`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/resources/db/migration/V9__create_flow_fields.sql)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/IncidentService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ChangeService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ProblemService.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestRecord.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestRecord.java)
- [`services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestService.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ServiceRequestService.java)
- [`services/itsm-service/src/test/java/com/serviceops/itsm/api/ServiceRequestServiceTest.java`](/C:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/test/java/com/serviceops/itsm/api/ServiceRequestServiceTest.java)

## Validation and Error Handling

- Client-side validation prevents incomplete submit.
- Server-side validation returns structured errors.
- UI preserves backend `code` and `request_id` in error messages.
- Dedicated forbidden UX is shown when role is not allowed for the chosen work item.

## Accessibility

- Header create control uses a real button with `aria-label="Create work item"`.
- The launcher menu exposes real menu items for keyboard navigation.
- Dedicated create routes avoid modal focus-trap regressions in the current shell.
- CTA buttons and route links use proper interactive semantics.

## Test Commands

Executed successfully:

- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml build itsm-service`
- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml build web`
- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --no-build itsm-service web gateway`
- `npm run smoke -- --grep "global create submits an incident and it appears in the incidents list"` from `apps/web`
- `docker run --rm -v "C:\Users\91889\Music\projects\serviceops-suite:/workspace" -w /workspace/services/itsm-service maven:3.9.9-eclipse-temurin-21 mvn -q -Dtest=ServiceRequestServiceTest test`

Manual verification completed:

1. Sign in at `/login`.
2. Open header `Create`.
3. Confirm four options are present: incident, service request, change, problem.
4. Open `/incidents/new`.
5. Submit a real incident.
6. Verify redirect to `/incidents` with created banner.
7. Verify created ID and row in real incidents list.

Observed evidence:

- created record: `INC-3`
- created title: `Principal create flow verification 1772988`

## Known Limitations

- The current repo RBAC model exposes `ADMIN`, `ANALYST`, and `READONLY`; it does not contain a separate requester role. The create UX therefore allows `ADMIN` and `ANALYST` and shows forbidden UX for unsupported roles.
- Attachment transport does not exist in the current repo. The incident form stores an attachment reference name only and labels that limitation explicitly in the UI.
- This proof executes the full end-to-end smoke for incident creation. Change, problem, and service-request forms are wired to real routes and persistence, but were not each exercised with separate automated smoke coverage in this change.
