# End-to-End Proof

Date: 2026-03-08

Status: FAIL / BLOCKED in this session

## What was required

- Incident lifecycle proof
- Change lifecycle proof
- Problem lifecycle proof
- RBAC 403 proof
- Audit event presence proof
- Dashboard truthfulness proof

## What actually happened

End-to-end execution could not begin because the clean runtime baseline failed before compose startup:
- Docker engine server API unavailable
- smoke script failed at `docker compose ps`
- host gateway checks returned connection refused

## Incident workflow

Runtime result:
- blocked

Reason:
- no running gateway at `127.0.0.1:8080`
- no compose-backed services available for HTTP or DB verification

Trace status:
- server-side lifecycle and invalid transition enforcement exist in `IncidentService`
- audit dispatch code exists for all required incident lifecycle events

## Change workflow

Runtime result:
- blocked

Reason:
- no running compose environment

Trace status:
- server-side lifecycle enforcement exists in `ChangeService`
- admin-only approval/rejection exists in `ChangeApprovalService`
- audit dispatch code exists for all required change lifecycle events

## Problem workflow

Runtime result:
- blocked

Reason:
- no running compose environment

Trace status:
- server-side lifecycle enforcement exists in `ProblemService`
- incident linkage check and invalid transition checks exist
- audit dispatch code exists for all required problem lifecycle events

## RBAC and audit runtime proof

Runtime result:
- blocked

Trace status:
- readonly incident mutation rejection path exists
- readonly problem mutation rejection path exists
- readonly CMDB write rejection path exists
- non-admin knowledge publish rejection path exists
- admin-only change approval/rejection rejection path exists

## Dashboard truthfulness

Trace result:
- summary KPIs are backed by real SQL queries in `DashboardController`
- shell counters are backed by BFF calls for incidents, situations, problems, changes, catalog, CMDB, knowledge, and audit
- `/system-admin`, `/service-catalog`, and `/integrations` contain broken UI-to-backend paths

Runtime result:
- blocked because the web stack was not reachable
