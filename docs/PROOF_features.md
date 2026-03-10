# Feature Proof

Date: 2026-03-08

Status: Mixed

Runtime workflow proof was blocked in this session by Docker daemon failure. The classifications below separate:
- what was actually executed in this session
- what was only traceable from code and route wiring

## Static validation actually executed

Commands:

```powershell
cd apps/web
npm run typecheck
npm run build
```

Actual results:
- `npm run typecheck`: passed
- `npm run build`: passed
- build emitted ESLint warnings, not fatal:
  - `src/app/audit/page.tsx`: missing `useEffect` dependency `load`
  - `src/components/AppShell.tsx`: missing `useEffect` dependency `refreshCounts`
- build emitted Next.js deopt warnings for pages using `useSearchParams()`:
  - `/accept-invite`
  - `/reset-password`
  - `/verify-email`
  - `/login`

## Lifecycle, RBAC, and audit trace results

These were trace-verified from code, not runtime-proven in this session.

Incident:
- create: `POST /api/itsm/incidents`
- assign: `POST /api/itsm/incidents/{id}/assign`
- investigate: `POST /api/itsm/incidents/{id}/investigate`
- resolve: `POST /api/itsm/incidents/{id}/resolve`
- close: `POST /api/itsm/incidents/{id}/close`
- server-side invalid transition rejection exists via `INCIDENT_INVALID_TRANSITION`
- role guard exists via `RoleGuard.requireAnalystOrAdmin(...)`
- audit dispatch exists for:
  - `incident.created`
  - `incident.assigned`
  - `incident.investigating`
  - `incident.resolved`
  - `incident.closed`

Change:
- create draft: `POST /api/itsm/changes`
- submit: `POST /api/itsm/changes/{id}/submit`
- approve/reject: `POST /api/workflow/approvals/{id}/approve|reject`
- implement: `POST /api/itsm/changes/{id}/implement`
- review: `POST /api/itsm/changes/{id}/review`
- server-side invalid transition rejection exists via `CHANGE_INVALID_TRANSITION`
- analyst/admin role guard exists for create/submit/implement/review
- admin-only guard exists for approve/reject and returns `FORBIDDEN_ROLE`
- audit dispatch exists for:
  - `change.created`
  - `change.submitted`
  - `change.approved`
  - `change.rejected`
  - `change.implemented`
  - `change.reviewed`

Problem:
- create: `POST /api/itsm/problems`
- link incident: `POST /api/itsm/problems/{id}/link-incident`
- root cause: `POST /api/itsm/problems/{id}/root-cause`
- known error: `POST /api/itsm/problems/{id}/known-error`
- close: `POST /api/itsm/problems/{id}/close`
- server-side invalid transition rejection exists via `PROBLEM_INVALID_TRANSITION`
- analyst/admin role guard exists
- audit dispatch exists for:
  - `problem.created`
  - `problem.incident_linked`
  - `problem.root_cause_recorded`
  - `problem.known_error_marked`
  - `problem.closed`

CMDB:
- privileged writes exist:
  - `POST /api/cmdb/cis`
  - `POST /api/cmdb/relationships`
- readonly rejection path exists with `FORBIDDEN_ROLE`
- audit dispatch exists for:
  - `cmdb.ci_created`
  - `cmdb.relationship_created`

Knowledge:
- document write endpoint exists: `POST /api/knowledge/documents`
- draft/write requires `ANALYST` or `ADMIN`
- approved publish requires `ADMIN`
- non-admin publish rejection path exists with `FORBIDDEN_ROLE`
- audit dispatch exists for:
  - `knowledge.document_created`
  - `knowledge.document_published`

## What could not be completed in this session

Not runtime-proven because compose never started:
- incident lifecycle execution
- change lifecycle execution
- problem lifecycle execution
- RBAC 403 API calls
- audit persistence queries
- gateway/web HTTP workflow proof
