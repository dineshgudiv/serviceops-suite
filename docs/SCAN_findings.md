# Scan Findings

Date: 2026-03-08

Checkpoint status:
- No `.git` directory exists at [serviceops-suite](/c:/Users/91889/Music/projects/serviceops-suite), its parent, or grandparent.
- A real git checkpoint branch/commit could not be created from this workspace state.

Scan scope:
- Searched source directories for `TODO`, `FIXME`, `stub`, `hardcoded`, `demo`, `mock`, `placeholder`
- Ignored generated noise as non-findings:
  - `apps/web/node_modules/**`
  - `services/**/target/**`
  - `apps/web/tsconfig.tsbuildinfo`

## Critical-path blockers

1. [apps/web/src/app/system-admin/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/system-admin/page.tsx)
- Exact text:
  - `health: '/api/bff/system/health', // TODO verify`
  - `config: '/api/bff/system/config', // TODO verify`
  - `featureFlags: '/api/bff/system/flags'`
- Classification: `critical-path blocker`
- Why it matters:
  - The route renders as a real admin surface, but there is no matching backend controller under any Spring service for `/api/system/**`.
  - [WorkflowController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/workflow-service/src/main/java/com/serviceops/workflow/api/WorkflowController.java) only exposes `/api/workflow/health/contracts` plus not-implemented approvals, not system health/config/flags.
- What would replace it:
  - Real backend endpoints such as `/api/system/health`, `/api/system/config`, `/api/system/flags`
  - A real controller class plus a persistence-backed or config-backed feature-flag store

2. [apps/web/src/app/service-catalog/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/service-catalog/page.tsx)
- Exact text:
  - `list: '/api/bff/catalog/services', // TODO verify`
  - `get: (id: string) => \`/api/bff/catalog/services/\${encodeURIComponent(id)}\`, // optional`
  - `deps: (id: string) => \`/api/bff/catalog/services/\${encodeURIComponent(id)}/dependencies\`, // optional`
- Classification: `critical-path blocker`
- Why it matters:
  - The UI calls `/api/bff/catalog/**`, but [nginx.conf](/c:/Users/91889/Music/projects/serviceops-suite/infra/nginx/nginx.conf) and [route.ts](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/api/bff/[...path]/route.ts) only support service roots like `itsm`, `cmdb`, `knowledge`, `integrations`, `audit`, `workflow`, `auth`, `sla`.
  - The real catalog endpoints live under ITSM:
    - [ItsmController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java): `/api/itsm/catalog/**`
- What would replace it:
  - Rewire UI to `/api/bff/itsm/catalog`
  - Keep dependency lookup on a real supported path backed by `itsm.catalog_services` and `cmdb.relationships`

3. [services/workflow-service/src/main/java/com/serviceops/workflow/api/WorkflowController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/workflow-service/src/main/java/com/serviceops/workflow/api/WorkflowController.java)
- Exact text:
  - `"state", "not_implemented"`
  - `throw new ApiException(... "NOT_IMPLEMENTED", "Approval execution is deferred in this slice")`
- Classification: `critical-path blocker`
- Why it matters:
  - [apps/web/src/app/changes/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/changes/page.tsx) exposes approve/reject actions through `/api/bff/workflow/approvals/{id}/approve|reject`.
  - The backend explicitly throws `NOT_IMPLEMENTED`, so change approval is not real.
- What would replace it:
  - Real approval state machine methods that mutate a persisted change/approval record
  - Server-side RBAC and audit emission on approve/reject

4. [services/knowledge-service/src/main/java/com/serviceops/knowledge/api/KnowledgeController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/knowledge-service/src/main/java/com/serviceops/knowledge/api/KnowledgeController.java)
- Exact text:
  - `throw new ApiException(... "NOT_IMPLEMENTED", "RAG evaluation harness is scaffolded but not implemented in this slice")`
- Classification: `critical-path blocker`
- Why it matters:
  - A publicly exposed API contract exists for `/api/knowledge/rag-eval`, but the implementation is intentionally absent.
- What would replace it:
  - A real evaluation harness backed by persisted evaluation runs/results tables

5. [apps/web/src/app/incidents/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/incidents/page.tsx)
- Exact text:
  - `incidentActions(selected.status)`
  - `Assignment is only legal while the incident is in NEW.`
  - `The backend enforces the legal transition matrix. Freeform status writes are no longer used.`
- Classification: `technical debt`
- Why it matters:
  - The critical-path freeform lifecycle mutation was removed, but the page still carries generalized scaffold comments near the API block and its Activity tab is not backed by a real audit query yet.
- What would replace it:
  - A create-incident action in the UI
  - An incident-scoped audit query rendered into the Activity tab

6. [apps/web/src/app/changes/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/changes/page.tsx)
- Exact text:
  - `approve: (id: string) => \`/api/bff/workflow/approvals/\${encodeURIComponent(id)}/approve\`, // optional`
  - `reject: (id: string) => \`/api/bff/workflow/approvals/\${encodeURIComponent(id)}/reject\`, // optional`
- Classification: `critical-path blocker`
- Why it matters:
  - The UI exposes approval controls, but the backend workflow approval path is not implemented.
- What would replace it:
  - Real approval/rejection methods backed by persisted state and audit events

7. [apps/web/src/app/problems/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/problems/page.tsx)
- Exact text:
  - `linkIncident: ... '/link-incident'`
  - `createChange: ... '/create-change'`
- Classification: `critical-path blocker`
- Why it matters:
  - [ItsmController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/itsm-service/src/main/java/com/serviceops/itsm/api/ItsmController.java) does not expose problem linkage or create-change endpoints.
- What would replace it:
  - Real problem-incident relationship table plus linkage/create-change endpoints

## Technical debt

1. [apps/web/src/app/dashboard/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/dashboard/page.tsx)
- Exact text:
  - `IMPORTANT: Adjust these endpoints to your repo’s REAL BFF routes.`
  - endpoint comments marked `// TODO verify`
- Classification: `technical debt`
- Why it matters:
  - The route uses real ITSM list endpoints, but the page still carries scaffolding language and computes many KPIs client-side from incident lists instead of dedicated summary APIs.

2. [apps/web/src/app/catalog/page.tsx](/c:/Users/91889/Music/projects/serviceops-suite/apps/web/src/app/catalog/page.tsx)
- Exact text:
  - service-management UI built on real `/api/bff/itsm/catalog` paths, but still includes generalized scaffolding comments
- Classification: `technical debt`

3. [infra/docker-compose.dev.yml](/c:/Users/91889/Music/projects/serviceops-suite/infra/docker-compose.dev.yml)
- Exact text:
  - `profiles: ["mock"]`
  - `container_name: serviceops-gateway-mock`
- Classification: `technical debt`
- Why it matters:
  - Mock mode exists in repo. It is isolated behind the `mock` profile and not the default runtime path, so it is not currently a critical-path blocker.

4. [services/auth-service/src/main/java/com/serviceops/auth/api/AuthController.java](/c:/Users/91889/Music/projects/serviceops-suite/services/auth-service/src/main/java/com/serviceops/auth/api/AuthController.java)
- Exact text:
  - `ensureOrg("demo", "Demo Org")`
  - `admin@demo.local`
  - `Admin123!demo`
- Classification: `technical debt`
- Why it matters:
  - Seed data is intentionally demo data. It is acceptable for local bootstrap but is not realistic production seed coverage.

## Harmless

1. [infra/kafka/topics.sh](/c:/Users/91889/Music/projects/serviceops-suite/infra/kafka/topics.sh)
- Exact text:
  - `Create Kafka topics (placeholder):`
- Classification: `harmless`
- Why:
  - Kafka is not part of the active compose stack for the verified baseline.

## Summary

- Critical-path blockers found: `6`
- Technical debt items called out: `5`
- Harmless items called out: `1`
