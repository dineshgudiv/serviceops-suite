# Event Topics and Schemas

## Broker
Kafka is the event backbone.

## Topic Naming
`<domain>.<entity>.<event>.v<major>`

Example: `itsm.incident.created.v1`

## Schema Versioning Rules
- Schemas live in `shared/contracts/events`.
- Backward-compatible changes:
  - Add optional fields
  - Add new event types on new topics
- Breaking changes require a new major topic suffix (`v2`, `v3`, ...).
- Producers must be able to dual-publish during migrations when required.
- Consumers must ignore unknown fields.

## Governance
- Every schema change requires compatibility notes in PR.
- CI must validate schema shape and required fields before merge.
