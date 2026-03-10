# Fraud Ops Risk Console

Monorepo for Fraud Analytics + Case Investigation + Evidence Review.

## Quick Start
1. `./scripts/bootstrap.ps1`
2. `./scripts/docker_preflight.ps1`
3. `./scripts/up.ps1`
4. `./scripts/proof_serviceops.ps1`

Docker Desktop readiness note:
- `docker version` must show both `Client:` and `Server:` sections before `./scripts/up.ps1` can work.
- If only the `Client:` section appears, Docker Desktop is installed but the engine is not ready yet.
- Run `docker context ls`, `docker info`, and start Docker Desktop before retrying.

## Build
- Java services: `mvn -q -DskipTests package`
- Web app: run from `apps/web`

## Docker Connectivity Repair
- If Docker builds fail before app code runs with errors like `proxyconnect tcp`, `lookup http.docker.internal`, or base image metadata resolution failures, this is a Docker Desktop machine/runtime issue, not an app compile failure.
- Run `./scripts/fix_docker_desktop_proxy.ps1 -Apply`
- Then run `./scripts/docker_preflight.ps1`
- Then run `./scripts/up.ps1`
- If Docker Desktop still has a manual proxy configured, clear it in:
  - `Settings -> Resources -> Proxies -> disable manual proxy / clear invalid values -> Apply & Restart`

## Product Focus
- Upload transaction datasets and PDF evidence
- Run anomaly detection and inspect suspicious records
- Generate linked cases and investigator audit history

## Layout
- `apps/`: frontends
- `services/`: backend services
- `shared/`: contracts and shared libs
- `infra/`: local infra and observability
- `docs/`: architecture and governance docs
