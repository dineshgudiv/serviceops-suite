# Java Test Tooling Blocker

Status: active in this workspace

Evidence:
- `mvn` is not installed in the current workspace shell
- no Maven wrapper (`mvnw`, `mvnw.cmd`) exists in the service directories

Impact:
- Authored Java unit tests under `services/*/src/test/java/**` cannot be executed from this workspace today.
- This blocks runtime-independent Java test proof for:
  - ITSM lifecycle tests
  - workflow approval tests
  - CMDB controller tests
  - knowledge controller tests
  - dashboard summary tests

What is still true:
- The Java test files exist on disk and are referenced in the relevant proof docs.
- Web static checks can still be executed:
  - `cd apps/web && npm run typecheck`
  - `cd apps/web && npm run build`

What would remove the blocker:
1. install Maven on the machine and ensure `mvn` is on `PATH`, or
2. add a checked-in Maven wrapper to each Java service root

Runtime validation note from this session:
- Runtime endpoint checks were attempted separately and failed before compose startup because the local Docker daemon was unavailable from this session.
