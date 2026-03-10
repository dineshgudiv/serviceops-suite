# API Index and Conventions

## Auth
All APIs require bearer JWT unless marked public.

## Pagination
Use cursor-based pagination where possible:
- `limit` (max 200)
- `cursor`

## Error Envelope
Standard error response:
```json
{ "code": "string", "message": "string", "requestId": "string" }
```

## Contract Versioning Rules
- OpenAPI specs are stored in `shared/contracts/openapi`.
- Version each service spec with semantic versioning in `info.version`.
- `MAJOR`: breaking change (removed fields/endpoints, incompatible type changes).
- `MINOR`: backward-compatible additions.
- `PATCH`: documentation/examples/non-breaking clarifications.
- CI enforces non-breaking changes via `ci/contracts/openapi_diff.ps1`.
- Any major bump must include migration guidance in PR description and `RUNBOOK.md`.
