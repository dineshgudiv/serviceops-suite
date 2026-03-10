# Proof ServiceOps Real Stack

Date: 2026-03-07 23:04:11 +05:30

CORE: PASS
- [PASS] seed endpoint: email=admin@demo.local
- [PASS] direct auth login: access_token returned
- [PASS] direct auth /me: user=admin@demo.local
- [PASS] web session login: session cookie issued
- [PASS] web session bootstrap: user=admin@demo.local
- [PASS] protected route redirects when signed out: status=307
- [PASS] gateway health probe: {"ok":true,"service":"gateway"}
- [PASS] login page reachable: status=200
- [PASS] getting-started page reachable with session: html returned
- [PASS] incidents list non-empty: count=7
- [PASS] problems list reachable: count=7
- [PASS] changes list reachable: count=7
- [PASS] catalog list reachable: count=1

EXTENDED: PASS
- [PASS] audit verify: ok=true
- [PASS] SLA endpoint: incident_id=7
- [PASS] CMDB list reachable: count=1
- [PASS] knowledge upload and ask: citations=4
- [PASS] integrations notification test: notification test returned 200
- [PASS] workflow contract returns 501: expected 501

OVERALL: PASS
