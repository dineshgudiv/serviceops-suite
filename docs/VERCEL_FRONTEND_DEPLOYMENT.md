# Vercel Frontend Deployment

## Scope

Deploy only the Next.js frontend in `apps/web` to Vercel.

The following stay external to Vercel:

- auth-service
- itsm-service
- audit-service
- knowledge-service
- cmdb-service
- integrations/gateway stack
- postgres and other Docker infrastructure

## Vercel Project Settings

- Framework Preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave empty

## Required Environment Variables

- `NEXT_PUBLIC_APP_URL`
  - Public URL of the deployed frontend
  - Example: `https://serviceops-web.vercel.app`

- `NEXT_PUBLIC_API_BASE_URL`
  - Public external backend base URL used by the frontend's same-origin API routes
  - Example: `https://api.serviceops.example`

## Optional Environment Variables

- `GATEWAY_INTERNAL_URL`
  - Server-side override for Vercel functions if you want server-side API routes to call a different backend origin than the browser-exposed value
  - Example: `https://internal-api.serviceops.example`

- `NEXT_PUBLIC_ENV`
  - UI/debug label only
  - Example: `prod`

## Runtime Model

Browser requests stay on the frontend origin:

- `/api/session/*`
- `/api/bff/*`

Those Next.js routes then call the external backend base URL configured above.

## Local Development

Local development still works without extra production env configuration:

- `npm run dev` in `apps/web`
- default development fallback remains `http://127.0.0.1:8080`

## Canonical Routes

- `/` redirects to `/dashboard`
- `/dashboard` is the canonical product entry
