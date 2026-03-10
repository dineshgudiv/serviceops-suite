# Smoke Proof

Date: 2026-03-08

Status: FAIL in this session

## Command run

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-validate.ps1
```

## Actual script output summary

The script failed immediately at compose inspection:

```text
FAIL: docker compose ps failed
SMOKE VALIDATION: FAIL (1 issue(s))
request returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json?...,
check if the server supports the requested API version
```

## Required checks not reached

Because `docker compose ps` failed, the script did not reach proof of:
- compose status
- host `/health` returns `200`
- host `/login` returns `200`
- internal `/actuator/health` endpoints return `status=UP`

## Conclusion

`scripts/smoke-validate.ps1` did not pass in this session.
