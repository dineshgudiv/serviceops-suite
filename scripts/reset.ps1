$ErrorActionPreference = "Stop"
Write-Host "[reset] Destructive reset requested."

$runtimeDir = Join-Path $PSScriptRoot "..\\.runtime"
$pidFile = Join-Path $runtimeDir "gateway.pid"
if (Test-Path $pidFile) {
  $procId = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($procId) {
    try { Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop } catch {}
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

try {
  Push-Location infra
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans | Out-Null
} catch {} finally {
  Pop-Location
}
Write-Host "[reset] Volumes and containers removed."
