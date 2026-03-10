param()

$ErrorActionPreference = "Stop"

$composeArgs = @(
  "-f", "infra/docker-compose.yml",
  "-f", "infra/docker-compose.dev.yml"
)

$healthchecked = @(
  "auth-service",
  "audit-service",
  "itsm-service",
  "cmdb-service",
  "workflow-service",
  "sla-service",
  "integrations-service",
  "knowledge-service"
)

$servicePorts = @{
  "auth-service" = 8081
  "audit-service" = 8088
  "itsm-service" = 8082
  "cmdb-service" = 8084
  "workflow-service" = 8087
  "sla-service" = 8083
  "integrations-service" = 8086
  "knowledge-service" = 8085
}

$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$Message) {
  $script:failures.Add($Message)
  Write-Host "FAIL: $Message" -ForegroundColor Red
}

function Require-Http200([string]$Url) {
  try {
    $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
    if ($res.StatusCode -ne 200) {
      Add-Failure "$Url returned HTTP $($res.StatusCode)"
    } else {
      Write-Host "OK: $Url -> 200" -ForegroundColor Green
    }
  } catch {
    Add-Failure "$Url request failed: $($_.Exception.Message)"
  }
}

function Require-InternalHealth([string]$Service, [int]$Port) {
  $cmd = "wget -qO- http://$Service`:$Port/actuator/health"
  try {
    $json = docker exec serviceops-gateway-1 sh -lc $cmd
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "$Service internal health command failed"
      return
    }
    if ($json -notmatch '"status"\s*:\s*"UP"') {
      Add-Failure "$Service internal health was not UP: $json"
    } else {
      Write-Host "OK: $Service internal /actuator/health -> $json" -ForegroundColor Green
    }
  } catch {
    Add-Failure "$Service internal health request failed: $($_.Exception.Message)"
  }
}

try {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  Set-Location $repoRoot

  $psOutput = docker compose @composeArgs ps
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps failed"
  }

  Write-Host $psOutput

  foreach ($service in $healthchecked) {
    $containerId = (docker compose @composeArgs ps -q $service).Trim()
    if (-not $containerId) {
      Add-Failure "$service container is missing"
      continue
    }

    $health = docker inspect $containerId --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "$service health inspect failed"
      continue
    }

    if ($health.Trim() -ne "healthy") {
      Add-Failure "$service health status is $health"
    } else {
      Write-Host "OK: $service health -> healthy" -ForegroundColor Green
    }
  }

  $gatewayId = (docker compose @composeArgs ps -q gateway).Trim()
  if (-not $gatewayId) {
    Add-Failure "gateway container is missing"
  } else {
    Write-Host "OK: gateway container present" -ForegroundColor Green
  }

  $webId = (docker compose @composeArgs ps -q web).Trim()
  if (-not $webId) {
    Add-Failure "web container is missing"
  } else {
    Write-Host "OK: web container present" -ForegroundColor Green
  }

  Require-Http200 "http://127.0.0.1:8080/health"
  Require-Http200 "http://127.0.0.1:8080/login"

  foreach ($service in $healthchecked) {
    Require-InternalHealth $service $servicePorts[$service]
  }
} catch {
  Add-Failure $_.Exception.Message
}

if ($failures.Count -gt 0) {
  Write-Host "SMOKE VALIDATION: FAIL ($($failures.Count) issue(s))" -ForegroundColor Red
  exit 1
}

Write-Host "SMOKE VALIDATION: PASS" -ForegroundColor Green
exit 0
