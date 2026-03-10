$ErrorActionPreference = "Continue"

Write-Host "[doctor] Environment checks"
$checks = @('docker','java','mvn','node','npm')
foreach ($c in $checks) {
  if (Get-Command $c -ErrorAction SilentlyContinue) {
    Write-Host "[doctor] OK: $c"
  } else {
    Write-Host "[doctor] MISSING: $c"
  }
}

try {
  docker info | Out-Null
  Write-Host "[doctor] Docker daemon: OK"
} catch {
  Write-Host "[doctor] Docker daemon: NOT RUNNING"
}
