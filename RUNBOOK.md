# RUNBOOK

Fraud Ops Risk Console local run instructions.

## Start Real Stack
- `./scripts/docker_preflight.ps1`
- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build`
- Health check: `curl http://127.0.0.1:8080/healthz`

## Docker Hub / Proxy Failure
- Symptom examples:
  - `failed to resolve source metadata`
  - `proxyconnect tcp`
  - `lookup http.docker.internal ... i/o timeout`
- Meaning:
  - Docker Desktop / BuildKit cannot reach Docker Hub base images.
  - This is a machine/runtime proxy or DNS problem, not an app build problem.
- Safe recovery:
  - `./scripts/fix_docker_desktop_proxy.ps1 -Apply`
  - `./scripts/docker_preflight.ps1`
  - `./scripts/up.ps1`
- If still broken, open Docker Desktop and verify:
  - `Settings -> Resources -> Proxies`
  - remove manual proxy values
  - `Apply & Restart`
- For diagnostics:
  - `./scripts/docker_net_report.ps1`

## Stop Stack
- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down -v --remove-orphans`

## Real Proof Gate
- Run: `./scripts/proof_serviceops.ps1`
- This proof fails if compose resolves to only `gateway-mock`.
- Proof flow: seed -> login -> create incident -> verify audit -> verify `/login` is 200.

## Web Access
- `http://127.0.0.1:8080/login`

## Notes
- `gateway-mock` exists only behind profile `mock` in `infra/docker-compose.dev.yml` and is not default.
- Session token in web app is stored only in httpOnly cookie (`serviceops_session`).
