$ErrorActionPreference="Continue"

Write-Host "=== SERVICEOPS TRUTH REPORT ===" -ForegroundColor Cyan
$ROOT=(Get-Location).Path
Write-Host ("Repo: {0}" -f $ROOT)

# --- Docker state ---
try { docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0) } catch { $dockerOk = $false }
if(-not $dockerOk){
  Write-Host "❌ Docker not available/running. Start Docker Desktop." -ForegroundColor Red
  exit 1
}

$running = @()
try { $running = @(docker ps --format "{{.Names}}") } catch { $running = @() }

$hasMock = ($running | Where-Object { $_ -like "*gateway-mock*" }).Count -gt 0
Write-Host ""
Write-Host "== PROOF LEGITIMACY ==" -ForegroundColor Yellow
if($hasMock){
  Write-Host "❌ gateway-mock is running → your PASS can be FAKE (trash-proof)." -ForegroundColor Red
} else {
  Write-Host "✅ No gateway-mock detected." -ForegroundColor Green
}

# required core containers (adjust names if your compose uses different names)
$required = @("serviceops-postgres","serviceops-auth","serviceops-itsm","serviceops-audit","serviceops-gateway")
$missingContainers = @($required | Where-Object { $running -notcontains $_ })

if($missingContainers.Count -gt 0){
  Write-Host ("❌ Missing core containers: {0}" -f ($missingContainers -join ", ")) -ForegroundColor Red
} else {
  Write-Host "✅ Core containers present." -ForegroundColor Green
}

Write-Host ""
Write-Host "== RUNNING CONTAINERS ==" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"

# --- Compose services defined ---
Write-Host ""
Write-Host "== COMPOSE SERVICES (defined) ==" -ForegroundColor Cyan
$composeServices = @()
try {
  $composeServices = @(docker compose -f .\infra\docker-compose.yml -f .\infra\docker-compose.dev.yml config --services 2>$null)
} catch { $composeServices = @() }

if(@($composeServices).Count -gt 0){
  $composeServices | ForEach-Object { Write-Host (" - " + $_) }
} else {
  Write-Host "⚠️ Could not read compose services (compose error or file missing)." -ForegroundColor DarkYellow
}

# --- Missing critical files ---
Write-Host ""
Write-Host "== MISSING CRITICAL FILES (WHAT YOU MUST BUILD) ==" -ForegroundColor Red
$Need = @(
  "infra\nginx\nginx.conf",
  "infra\postgres\init\001_schemas.sql",
  "services\auth-service\src\main\resources\application.yml",
  "services\auth-service\src\main\resources\db\migration\V1__init.sql",
  "services\itsm-service\src\main\resources\application.yml",
  "services\itsm-service\src\main\resources\db\migration\V1__init.sql",
  "services\audit-service\src\main\resources\application.yml",
  "services\audit-service\src\main\resources\db\migration\V1__init.sql",
  "apps\web\Dockerfile",
  "apps\web\public",
  "apps\web\src\app\login\page.tsx",
  "apps\web\src\app\dashboard\page.tsx",
  "apps\web\src\app\api\session\login\route.ts",
  "apps\web\src\middleware.ts"
)

$missingFiles = @($Need | Where-Object { -not (Test-Path (Join-Path $ROOT $_)) })
if($missingFiles.Count -eq 0){
  Write-Host "✅ None missing from the tracked list." -ForegroundColor Green
} else {
  $missingFiles | ForEach-Object { Write-Host ("- " + $_) -ForegroundColor Red }
}

# --- Empty directories ---
Write-Host ""
Write-Host "== EMPTY DIRECTORIES ==" -ForegroundColor Cyan
$emptyDirs = Get-ChildItem -Path $ROOT -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { -not (Get-ChildItem -Path $_.FullName -File -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1) }

Write-Host ("Empty dir count: {0}" -f $emptyDirs.Count) -ForegroundColor Yellow
$emptyDirs | Select-Object -First 25 FullName | ForEach-Object { Write-Host ("- " + $_.FullName) }
if($emptyDirs.Count -gt 25){ Write-Host ("(showing 25/{0})" -f $emptyDirs.Count) -ForegroundColor DarkGray }

Write-Host ""
Write-Host "== NEXT 3 MOVES (ORDER) ==" -ForegroundColor Magenta
Write-Host "1) Remove gateway-mock and run real stack (postgres+auth+itsm+audit+gateway)." -ForegroundColor Magenta
Write-Host "2) Fill missing nginx.conf + application.yml + Flyway V1 migrations." -ForegroundColor Magenta
Write-Host "3) Build apps/web (login/dashboard + BFF + middleware) behind gateway." -ForegroundColor Magenta
