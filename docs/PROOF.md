# ServiceOps Proof Report

Date: 2026-03-07

## Current Evidence
- `apps/web`: `npm run typecheck` -> PASS
- `apps/web`: `npm run build` -> PASS
- `scripts/docker_preflight.ps1` -> PASS
- `scripts/fix_docker_desktop_proxy.ps1 -SkipRestart` -> PASS
- `scripts/up.ps1` -> PASS
- `scripts/proof_serviceops.ps1` -> PASS
- [`PROOF_RUN.md`](C:\Users\91889\Music\projects\serviceops-suite\PROOF_RUN.md) records the latest verified gate output

## Repo-side Hardening In This Pass
- `scripts/docker_preflight.ps1`
  - checks the actual base images this repo depends on: `postgres`, `nginx`, `node`, `maven`, `eclipse-temurin`
  - distinguishes daemon startup failures from Docker Hub proxy/DNS pull failures
  - treats successful pull output correctly instead of false-failing on healthy pulls
- `scripts/fix_docker_desktop_proxy.ps1`
  - no longer misclassifies Docker Desktop's normal `http.docker.internal:3128` proxy lines as broken
  - verifies required image pulls using output-aware success detection
- `scripts/up.ps1`
  - clears stale compose containers with `down --remove-orphans` before `up`
  - preserves volumes while preventing stale container-name conflicts from poisoning startup
- `scripts/proof_serviceops.ps1`
  - records `MACHINE_ISSUE` when Docker is unavailable before proof can start
  - records `PASS`/`PARTIAL`/`FAIL` based on actual runtime evidence once the stack is up
  - tears down safely only when the stack actually started
- `apps/web/src/app/dashboard/layout.tsx`
  - enforces server-side redirect for signed-out `/dashboard` access
  - disables caching for that auth boundary

## Truth Map
- REAL
  - `auth-service` email/password login
  - JWT issue
  - `/api/auth/me`
  - web session bootstrap via `/api/session/me`
  - `audit-service`
  - `itsm-service` incidents/problems/changes/catalog
  - narrow public `/api/gw/health`
  - `/getting-started`
- PARTIAL
  - `cmdb-service` remains demo-level even though current proof path passes
  - `knowledge-service` remains demo-level even though current proof path passes
  - `integrations-service` remains demo-level even though current proof path passes
  - `sla-service` remains demo-level even though current proof path passes
- STUB
  - `workflow-service` execution/approval behavior remains stubbed; current proof validates the expected `501`
- BROKEN
  - no confirmed repo-contained blocker remains on the current proof path
- MACHINE ISSUE
  - Docker Desktop proxy/DNS/runtime failures are still machine-level risks, but the repo now detects and classifies them early

## Latest Proof Status
- `CORE: PASS`
- `EXTENDED: PASS`
- `OVERALL: PASS`

## Next Verification Step
1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\proof_serviceops.ps1`.
2. If Docker Desktop regresses again, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker_preflight.ps1`.
3. Only use `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix_docker_desktop_proxy.ps1 -Apply` if preflight classifies a Docker proxy/runtime issue.
