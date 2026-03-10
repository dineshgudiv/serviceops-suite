# PROOF_VERCEL_BUILD_FIX

## Original failures found

### 1. `xlsx` import error

- File: `apps/web/src/app/api/fraud/datasets/[datasetId]/preview/route.ts`
- Original error:
  - `Attempted import error: 'xlsx' does not contain a default export (imported as 'XLSX').`
- Root cause:
  - `xlsx` is consumed in this repo as a CommonJS-style module.
  - The preview route used `import XLSX from 'xlsx';`, which breaks the production build under Next.js 14.

### 2. Windows local build cleanup failure

- Original error:
  - `EPERM: operation not permitted, open ...\\.next\\trace`
- Root cause:
  - A locked Windows `.next\trace` file made local cleanup unreliable.
  - This was a local artifact/locking issue, not the real app compile failure.

### 3. Vercel/runtime risk audit result

- The audited fraud API routes build successfully, but they use server-side filesystem persistence through:
  - `apps/web/src/lib/fraud/server-storage.ts`
  - `os.tmpdir()`-backed fraud workspace storage
- This does not block the frontend production build.
- It does remain a runtime limitation on Vercel because local filesystem state is ephemeral across serverless executions.

## Exact files changed

- `apps/web/src/app/api/fraud/datasets/[datasetId]/preview/route.ts`
  - Fixed `xlsx` import interop.
- `apps/web/package.json`
  - Added reproducible local production verification script.
- `apps/web/next.config.js`
  - Added configurable `distDir` so local verification builds can avoid locked `.next` artifacts.
- `apps/web/scripts/clean-next.mjs`
  - Added cross-platform `.next` cleanup script with non-fatal handling for locked Windows artifacts.
- `apps/web/scripts/verify-build.mjs`
  - Added isolated verification build runner using `NEXT_DIST_DIR=.next-verify`.
- `.gitignore`
  - Ignored `.next-verify` build output.
- `apps/web/tsconfig.json`
  - Included `.next-verify/types/**/*.ts` so verification builds do not mutate config unexpectedly on every run.

## Exact code/config changes made

### `xlsx` import fix

- Changed:
  - `import XLSX from 'xlsx';`
- To:
  - `import * as XLSX from 'xlsx';`

### Local production build hardening

- Added:
  - `npm run clean:next`
  - `npm run verify:build`
- `verify:build` now:
  - cleans `.next-verify`
  - runs `next build` with `NEXT_DIST_DIR=.next-verify`
- This avoids dependency on deleting a locked default `.next` directory on Windows.

### Next config hardening

- Added:
  - `distDir: process.env.NEXT_DIST_DIR || '.next'`
- Result:
  - normal deploys still use `.next`
  - local verification can safely use `.next-verify`

## Commands run

From `apps/web`:

```powershell
npm run verify:build
npm run typecheck
```

## Local build result

- `npm run verify:build`: PASS
- `npm run typecheck`: PASS

The production build completed successfully and emitted the full Next.js route summary.

## Remaining Vercel/runtime limitations

### Important limitation

The app is now safe to redeploy from a **build** perspective.

However, the fraud workspace runtime still uses local filesystem persistence:

- uploads
- parsed dataset artifacts
- generated reports
- workspace state

This is implemented via `apps/web/src/lib/fraud/server-storage.ts` and writes under `os.tmpdir()`.

### Practical implication on Vercel

- The frontend now builds successfully for Vercel.
- The fraud API routes can compile under Vercel.
- But durable fraud dataset/report state is **not production-safe on Vercel serverless** without external persistent storage.
- On Vercel, local disk is ephemeral and should not be treated as durable dataset storage.

## Explicit redeploy statement

- **Build/deploy candidate status:** YES, the Next.js frontend is now safe to redeploy from a production-build standpoint.
- **Runtime durability status for fraud storage on Vercel:** NOT fully production-safe until file-backed fraud storage is replaced or backed by external persistent storage.
