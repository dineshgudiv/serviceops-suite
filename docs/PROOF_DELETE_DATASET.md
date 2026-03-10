# PROOF_DELETE_DATASET

## Inspection Findings

### FOUND
- Server-backed fraud workspace persistence is file-based, not DB-backed, through:
  - `apps/web/src/lib/fraud/server-storage.ts`
  - `apps/web/src/app/api/fraud/workspace/route.ts`
- Dataset ingestion and mutation already existed through:
  - `apps/web/src/app/data-upload/page.tsx`
  - `apps/web/src/app/api/fraud/datasets/[datasetId]/route.ts`
  - `apps/web/src/hooks/useFraudServerWorkspace.ts`
- Derived artifacts already existed per dataset:
  - dataset files in `datasets/<datasetId>`
  - runs in `workspace.runs`
  - cases in `workspace.cases`
  - reports in `workspace.reports`
  - jobs in `workspace.jobs`
  - document metadata in `workspace.documents`
- Audit subsystem already existed through:
  - `apps/web/src/lib/fraud/audit.ts`
  - `apps/web/src/app/api/fraud/audit/route.ts`
  - `apps/web/src/app/audit-log/page.tsx`
- RBAC pattern already existed in fraud settings through:
  - `apps/web/src/app/api/fraud/settings/route.ts`

### MISSING
- No server-backed dataset delete endpoint existed.
- No visible delete-dataset action existed in the active server-backed UI.
- No server-backed dataset cleanup logic existed for:
  - dataset artifact folders
  - report folders
  - workspace runs/cases/reports/jobs/documents
  - staged upload sessions
- No active-dataset delete confirmation gate existed.
- No dataset deletion audit event existed.

### BROKEN
- The old browser-local fraud workspace had a `clearActiveDataset` path in `apps/web/src/lib/fraud/workspace.ts`, but that was not the active large-data server-backed workflow.
- `active: true` mutation was already being sent from the new UI path, but the server dataset route was not applying it before this fix.

### RISK
- The fraud platform does not currently use relational DB tables for the active fraud workspace. The deletion surface is filesystem + workspace JSON, so cleanup must remove both persistent workspace entries and on-disk artifact folders.
- Background workers could race against dataset deletion. This was mitigated by removing matching workspace jobs and deleting the dataset, which causes workers to exit safely when they no longer find the dataset/job.

## Deletion Strategy Chosen
- Strategy: hard delete
- Why:
  - the active fraud platform stores datasets and derived artifacts in server workspace JSON and filesystem artifact folders
  - the product behavior requested complete dataset removal from the visible workflow
  - audit retention is preserved separately through `workspace.auditEvents`
- Result:
  - dataset records are removed
  - derived artifacts are removed
  - audit history retains the deletion event

## Files Changed
- `apps/web/src/lib/fraud/server-storage.ts`
  - added `deleteDatasetDeep()` for end-to-end hard deletion and artifact cleanup
- `apps/web/src/app/api/fraud/datasets/[datasetId]/route.ts`
  - added RBAC-aware `DELETE`
  - added active-dataset confirmation gate
  - fixed `active: true` handling
- `apps/web/src/app/api/fraud/workspace/route.ts`
  - added workspace permissions payload for dataset management UI
- `apps/web/src/lib/fraud/server-types.ts`
  - extended workspace response typing with permissions
- `apps/web/src/hooks/useFraudServerWorkspace.ts`
  - added workspace permissions
  - added `deleteDataset()`
- `apps/web/src/app/data-upload/page.tsx`
  - added uploaded-datasets management panel
  - added delete confirmation UI
  - added immediate UI refresh after deletion
- `apps/web/src/lib/fraud/audit.ts`
  - classified `dataset_deleted` as a data event
- `apps/web/src/app/audit-log/page.tsx`
  - linked `dataset_deleted` events back to Data Upload
- `apps/web/tests/smoke/fraud-dataset-delete.spec.ts`
  - added smoke proof for dataset deletion

## Endpoint Changes
- Added/changed:
  - `DELETE /api/fraud/datasets/[datasetId]`
    - `404 DATASET_NOT_FOUND` for missing dataset
    - `403 FORBIDDEN` for unauthorized deletion
    - `409 ACTIVE_DATASET_DELETE_REQUIRES_CONFIRMATION` when deleting the active dataset without explicit confirmation
    - `200` on successful deletion
- Existing route improved:
  - `PUT /api/fraud/datasets/[datasetId]`
    - now correctly applies `active: true`

## How Deletion Works Now
1. User opens `Data Upload`.
2. User sees the `Uploaded datasets` panel with one delete action per dataset.
3. User clicks `Delete dataset`.
4. UI shows confirmation with:
   - dataset name
   - active-dataset impact
   - derived artifact impact summary
5. UI calls:
   - `DELETE /api/fraud/datasets/[datasetId]?force=1`
6. Server:
   - validates dataset exists
   - enforces RBAC
   - removes dataset from `workspace.datasets`
   - clears or switches `activeDatasetId`
   - removes linked runs, cases, reports, jobs, and documents from workspace state
   - removes dataset artifact folder
   - removes matching report folders
   - removes matching staged upload folders
   - writes `dataset_deleted` audit event
7. Hook refreshes workspace state.
8. UI immediately updates:
   - dataset disappears
   - active dataset panel refreshes
   - counts refresh

## Cleanup Coverage
- Removed from server workspace:
  - dataset summary
  - runs
  - cases
  - reports
  - jobs
  - linked documents
- Removed from disk:
  - `datasets/<datasetId>`
  - `reports/<reportId>`
  - staged upload session folders whose manifest matches the dataset id
- Retained:
  - audit events, including the deletion event

## Active Dataset Safety
- Active dataset deletion is blocked unless explicitly confirmed.
- UI always uses explicit confirmation for delete.
- After delete:
  - if another dataset exists, it becomes the new active dataset
  - otherwise `activeDatasetId` is cleared safely

## RBAC
- Reused existing fraud settings RBAC pattern:
  - authenticated `admin` can delete
  - authenticated non-admin is blocked
  - local unauthenticated workspace mode remains editable for local operator flow
- Enforcement lives in:
  - `apps/web/src/app/api/fraud/datasets/[datasetId]/route.ts`

## Audit
- New event:
  - `dataset_deleted`
- Captures:
  - actor
  - dataset id
  - dataset name
  - deletion mode
  - active-dataset flag
  - removed counts

## Test Commands Run
- `npm run typecheck`
- `npx playwright test tests/smoke/fraud-dataset-delete.spec.ts -c playwright.smoke.config.ts`
  - with `SMOKE_BASE_URL=http://127.0.0.1:3000`

## Test Results
- `typecheck`: PASS
- `fraud-dataset-delete.spec.ts`: PASS
  - verified:
    - dataset upload path available
    - missing dataset delete returns `404`
    - active dataset delete without confirmation returns `409`
    - confirmed delete succeeds
    - dataset disappears from UI
    - workspace no longer contains the dataset
    - linked runs/cases/reports are removed
    - `dataset_deleted` audit event exists

## Known Limitations
- Unauthorized delete execution is enforced in code, but I validated it statically rather than with a live authenticated non-admin smoke path in this local workspace mode.
- The active fraud platform uses filesystem + workspace JSON persistence, not SQL tables, so there are no DB migrations associated with this delete flow.
