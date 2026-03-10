$ErrorActionPreference = "Stop"
Write-Host "[up] Starting real ServiceOps stack..."
$composeArgs = @('-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml')
try {
  & "$PSScriptRoot\docker_preflight.ps1"
} catch {
  Write-Host "[up] Docker preflight failed. Stack startup aborted before compose."
  Write-Host "[up] Useful follow-up commands:"
  Write-Host "  docker context ls"
  Write-Host "  docker version"
  Write-Host "  docker info"
  throw
}
Push-Location (Join-Path $PSScriptRoot "..\infra")
try {
  Write-Host "[up] Compose files: docker-compose.yml + docker-compose.dev.yml"
  Write-Host "[up] Services targeted: postgres, auth-service, audit-service, itsm-service, gateway, web (+ supporting services)"
  Write-Host "[up] Clearing stale compose containers (non-destructive, volumes preserved)..."
  & docker compose @composeArgs down --remove-orphans
  if ($LASTEXITCODE -ne 0) {
    throw "[up] docker compose down failed."
  }
  & docker compose @composeArgs up -d --build --remove-orphans
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[up] docker compose up failed. Inspect compose state and logs:"
    & docker compose @composeArgs ps
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.dev.yml logs gateway"
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.dev.yml logs auth-service"
    throw "[up] docker compose up failed."
  }
} finally {
  Pop-Location
}
& "$PSScriptRoot/wait_health.ps1" -Url "http://127.0.0.1:8080/healthz" -TimeoutSec 600
Write-Host "[up] Stack is up."
