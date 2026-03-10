# Dashboard Product Audit Proof

Date: 2026-03-09

## Root Cause

The broken dashboard/product surface came from four concrete issues:

1. The dashboard page was a separate handcrafted screen that only summarized incidents and a single ITSM summary endpoint. It did not surface admin or integrations summaries, and it implied module coverage that was not actually wired.
2. The shell still contained fake affordances:
   - organization dropdown looked interactive but was not wired
   - global search field looked global but had no action
   - integrations counters queried a nonexistent `/api/bff/integrations` endpoint
3. The repo still contained stale competing UI code:
   - `apps/web/src/components/serviceops/*`
   - `apps/web/src/lib/seed/serviceops.ts`
4. Duplicate or stale routes existed inside the app:
   - `audit` vs `audit-log`
   - `service-catalog` vs `catalog`
   - `system-admin` vs `admin`

## Files Changed

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/integrations/page.tsx`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/GetStartedPanel.tsx`
- `apps/web/src/app/audit/page.tsx`
- `apps/web/src/app/service-catalog/page.tsx`
- `apps/web/src/app/system-admin/page.tsx`
- `infra/nginx/nginx.conf`
- removed `apps/web/src/components/serviceops/*`
- removed `apps/web/src/lib/seed/serviceops.ts`

## What Changed

- Dashboard was rebuilt as the canonical overview page using real repo-backed endpoints:
  - `/api/bff/itsm/dashboard/summary`
  - `/api/bff/itsm/incidents`
  - `/api/session/me`
  - `/api/bff/auth/orgs/{orgId}/users`
  - `/api/bff/integrations/notifications`
- App shell now:
  - stops pretending org is switchable when it is session-bound
  - routes header search into incidents search instead of doing nothing
  - shows integrations counter from real notification history
- Integrations page now uses real integrations endpoints:
  - `/api/bff/integrations/notifications`
  - `/api/bff/integrations/test-notification`
  - unsupported destination/enabled/workflow counts are labeled unavailable
- Getting Started now counts real notification history instead of a nonexistent integrations list endpoint.
- Legacy duplicate UI code was removed.
- Duplicate routes were collapsed to canonical routes where practical.
- Gateway nginx is configured so browser traffic on `8080` redirects to `http://localhost:3000`.

## Validation

Commands run:

```powershell
cd apps/web
npm run typecheck
npm run lint
curl.exe -I http://localhost:3000/
curl.exe -I http://localhost:3000/dashboard
curl.exe -I http://localhost:3000/getting-started
curl.exe -I http://localhost:3000/integrations
curl.exe -I http://localhost:3000/incidents
curl.exe -I http://localhost:3000/problems
curl.exe -I http://localhost:3000/changes
curl.exe -I http://localhost:3000/admin
curl.exe -I http://localhost:3000/status
./scripts/up.ps1
```

Observed results:

- `npm run typecheck` passed
- `npm run lint` passed with one pre-existing warning outside the dashboard path:
  - `src/app/portal/requests/[kind]/[id]/page.tsx`
- `GET /` returned `307` to `/dashboard`
- `GET /dashboard` returned `307` to `/login` when unauthenticated
- `GET /getting-started`, `/integrations`, `/incidents`, `/problems`, `/changes`, and `/admin` returned `307` to `/login` when unauthenticated
- `GET /status` returned `404`
- `npm run typecheck` passed
- `npm run lint` passed with one pre-existing warning outside the dashboard path:
  - `src/app/portal/requests/[kind]/[id]/page.tsx`
- `./scripts/up.ps1` failed before stack start because Docker Desktop could not resolve `registry-1.docker.io`

## Known Limits

- `status`, `topology`, `on-call`, and a dedicated `search` page are not present in this repo as working module routes; the dashboard now labels them `NOT AVAILABLE IN REPO`.
- Full authenticated dashboard validation is blocked until Docker Desktop networking is fixed and the backend stack can seed/login successfully.
- The `8080` redirect is configured in nginx, but runtime verification is blocked by the Docker preflight failure.
