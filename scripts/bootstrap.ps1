param(
  [switch]$Force,
  [switch]$RuntimeOnly
)

$ErrorActionPreference = "Stop"

function Test-Cmd([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "[bootstrap] Starting environment bootstrap..."

$required = if ($RuntimeOnly) { @("docker") } else { @("docker", "java", "mvn", "node", "npm") }
$missing = @()
foreach ($cmd in $required) {
  if (-not (Test-Cmd $cmd)) { $missing += $cmd }
}

if ($missing.Count -gt 0) {
  Write-Error "Missing required tools: $($missing -join ', '). Install and rerun."
}

Write-Host "[bootstrap] Tools present."

$envTargets = @('.env.example','apps/web/.env.example')
$envTargets += (Get-ChildItem services -Directory | ForEach-Object { Join-Path $_.FullName '.env.example' })

foreach ($example in $envTargets) {
  $target = $example -replace '\.example$',''
  if ((Test-Path $example) -and (-not (Test-Path $target) -or $Force)) {
    Copy-Item $example $target -Force
    Write-Host "[bootstrap] Wrote $target"
  }
}

Write-Host "[bootstrap] Verifying Docker daemon..."
try {
  docker info *> $null
  if ($LASTEXITCODE -ne 0 -and -not $RuntimeOnly) {
    Write-Error "Docker daemon is not running. Start Docker Desktop and retry."
  }
} catch {
  if (-not $RuntimeOnly) {
    Write-Error "Docker daemon is not running. Start Docker Desktop and retry."
  }
}

Write-Host "[bootstrap] Bootstrap complete. Next: ./scripts/up.ps1"
