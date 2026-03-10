param(
  [Parameter(Mandatory = $true)][string]$Url,
  [int]$TimeoutSec = 180
)
$ErrorActionPreference = "Stop"
$composeArgs = @('-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml')
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $code = & curl.exe -s -o NUL -w "%{http_code}" $Url
  if ($code -eq '200') { Write-Host "[wait_health] healthy: $Url"; exit 0 }
  Start-Sleep -Seconds 2
}
Write-Host "[wait_health] timed out waiting for $Url"
Push-Location (Join-Path $PSScriptRoot "..\infra")
try {
  Write-Host "[wait_health] docker compose ps:"
  & docker compose @composeArgs ps
} finally {
  Pop-Location
}
Write-Host "[wait_health] Suggested follow-up commands:"
Write-Host "  docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml ps"
Write-Host "  docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml logs gateway"
Write-Host "  docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml logs auth-service"
Write-Error "Timed out waiting for $Url. Expected provider: gateway on port 8080."
