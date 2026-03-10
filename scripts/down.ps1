$ErrorActionPreference = "Stop"
Write-Host "[down] Stopping ServiceOps stack..."
Push-Location (Join-Path $PSScriptRoot "..\infra")
try {
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
} finally {
  Pop-Location
}
Write-Host "[down] Done."
