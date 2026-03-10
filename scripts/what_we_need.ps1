$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ROOT=(Get-Location).Path
if(!(Test-Path (Join-Path $ROOT "infra\docker-compose.yml"))){ throw "Run from repo root. Missing infra\docker-compose.yml at $ROOT" }

function Exists($p){ Test-Path (Join-Path $ROOT $p) }
function HasFiles($dir,$pattern){
  $full = Join-Path $ROOT $dir
  if(!(Test-Path $full)){ return $false }
  return [bool](Get-ChildItem -Path $full -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | Select-Object -First 1)
}

# Compose services (always array)
$composeServices=@()
try { $composeServices = @(docker compose -f .\infra\docker-compose.yml -f .\infra\docker-compose.dev.yml config --services 2>$null) } catch { $composeServices=@() }

$mockOnly = (@($composeServices).Count -eq 1 -and $composeServices[0] -eq "gateway-mock")
$hasMockService = (@($composeServices) | Where-Object { $_ -like "*mock*" }).Count -gt 0

# Critical file + real-code checks (not just directories)
$checks = @(
  @{name="Gateway nginx.conf"; ok=(Exists "infra\nginx\nginx.conf"); need="infra\nginx\nginx.conf"},
  @{name="Postgres init schema"; ok=(Exists "infra\postgres\init\001_schemas.sql"); need="infra\postgres\init\001_schemas.sql"},

  @{name="Auth application.yml"; ok=(Exists "services\auth-service\src\main\resources\application.yml"); need="services\auth-service\src\main\resources\application.yml"},
  @{name="Auth Flyway V1"; ok=(Exists "services\auth-service\src\main\resources\db\migration\V1__init.sql"); need="services\auth-service\src\main\resources\db\migration\V1__init.sql"},
  @{name="Auth has Java code"; ok=(HasFiles "services\auth-service\src\main\java" "*.java"); need="Add real Java sources under services\auth-service\src\main\java"},

  @{name="ITSM application.yml"; ok=(Exists "services\itsm-service\src\main\resources\application.yml"); need="services\itsm-service\src\main\resources\application.yml"},
  @{name="ITSM Flyway V1"; ok=(Exists "services\itsm-service\src\main\resources\db\migration\V1__init.sql"); need="services\itsm-service\src\main\resources\db\migration\V1__init.sql"},
  @{name="ITSM has Java code"; ok=(HasFiles "services\itsm-service\src\main\java" "*.java"); need="Add real Java sources under services\itsm-service\src\main\java"},

  @{name="Audit application.yml"; ok=(Exists "services\audit-service\src\main\resources\application.yml"); need="services\audit-service\src\main\resources\application.yml"},
  @{name="Audit Flyway V1"; ok=(Exists "services\audit-service\src\main\resources\db\migration\V1__init.sql"); need="services\audit-service\src\main\resources\db\migration\V1__init.sql"},
  @{name="Audit has Java code"; ok=(HasFiles "services\audit-service\src\main\java" "*.java"); need="Add real Java sources under services\audit-service\src\main\java"},

  @{name="Web package.json"; ok=(Exists "apps\web\package.json"); need="apps\web\package.json"},
  @{name="Web Dockerfile"; ok=(Exists "apps\web\Dockerfile"); need="apps\web\Dockerfile"},
  @{name="Web public assets"; ok=(Exists "apps\web\public"); need="apps\web\public"},
  @{name="Web login page"; ok=(Exists "apps\web\src\app\login\page.tsx"); need="apps\web\src\app\login\page.tsx"},
  @{name="Web dashboard page"; ok=(Exists "apps\web\src\app\dashboard\page.tsx"); need="apps\web\src\app\dashboard\page.tsx"},
  @{name="Web session login route"; ok=(Exists "apps\web\src\app\api\session\login\route.ts"); need="apps\web\src\app\api\session\login\route.ts"},
  @{name="Web middleware"; ok=(Exists "apps\web\src\middleware.ts"); need="apps\web\src\middleware.ts"}
)

$missing = $checks | Where-Object { -not $_.ok } | Select-Object -ExpandProperty need

# Empty directories
$emptyDirs = Get-ChildItem -Path $ROOT -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { -not (Get-ChildItem -Path $_.FullName -File -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1) }

# Write NEEDS.md
$md = New-Object System.Collections.Generic.List[string]
$md.Add("# ServiceOps — What We Still Need (Truth Report)")
$md.Add("")
$md.Add("- Repo: `$ROOT = $ROOT`")
$md.Add("- Date: $(Get-Date)")
$md.Add("")
$md.Add("## Compose reality")
if(@($composeServices).Count -eq 0){
  $md.Add("- ❌ Could not read compose services (compose error).")
} else {
  $md.Add("- Services defined:")
  foreach($s in $composeServices){ $md.Add("  - $s") }
}
if($mockOnly){ $md.Add("- ❌ **TRASH**: compose is **mock-only** (gateway-mock). You do not have a real stack.") }
elseif($hasMockService){ $md.Add("- ⚠️ Mock services detected. Proof must not rely on mocks.") }
else { $md.Add("- ✅ No mock-only compose detected.") }

$md.Add("")
$md.Add("## Missing critical implementation")
if(@($missing).Count -eq 0){
  $md.Add("- ✅ None missing from the tracked list.")
} else {
  foreach($m in $missing){ $md.Add("- ❌ $m") }
}

$md.Add("")
$md.Add("## Empty directories")
$md.Add("- Empty dir count: **$($emptyDirs.Count)**")
$md.Add("- Top 30:")
foreach($d in ($emptyDirs | Select-Object -First 30)){ $md.Add("  - $($d.FullName)") }

$md.Add("")
$md.Add("## Next 3 major moves (order)")
$md.Add("1) Replace mock-only compose with real stack: postgres + auth + itsm + audit + gateway (+ web).")
$md.Add("2) Add missing nginx.conf + application.yml + Flyway V1 migrations + real Java sources.")
$md.Add("3) Implement apps/web (login + session cookie + BFF + dashboard/incidents/audit pages).")

$mdPath = Join-Path $ROOT "docs\NEEDS.md"
New-Item -ItemType Directory -Force (Split-Path $mdPath) | Out-Null
($md -join "`n") | Set-Content -Encoding UTF8 $mdPath

Write-Host "Wrote docs\NEEDS.md" -ForegroundColor Green

# Fail hard if mock-only or core impl missing
if($mockOnly){
  Write-Host "FAIL: compose is mock-only (gateway-mock). Replace compose with real services." -ForegroundColor Red
  exit 2
}
if(@($missing).Count -gt 0){
  Write-Host "FAIL: missing critical files/code. See docs\NEEDS.md" -ForegroundColor Red
  exit 3
}

Write-Host "OK: No mock-only compose and no tracked critical missing items." -ForegroundColor Green
exit 0
