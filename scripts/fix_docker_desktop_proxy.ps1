[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"

$proxyVars = @('HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy')
$dockerConfig = Join-Path $env:USERPROFILE '.docker\config.json'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runtimeDir = Join-Path $PSScriptRoot '..\.runtime'
$backupDir = Join-Path $runtimeDir "docker-proxy-backups-$timestamp"
$envBackupFile = Join-Path $backupDir 'env-backup.json'
$changes = [System.Collections.Generic.List[string]]::new()

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Get-EnvSnapshot([System.EnvironmentVariableTarget]$Scope) {
  $result = [ordered]@{}
  foreach ($name in $proxyVars) {
    $result[$name] = [Environment]::GetEnvironmentVariable($name, $Scope)
  }
  return $result
}

function Write-EnvScope([string]$Label, [hashtable]$Values) {
  Write-Host "[$Label]"
  foreach ($name in $proxyVars) {
    $value = $Values[$name]
    if ([string]::IsNullOrWhiteSpace($value)) {
      Write-Host "  $name = <unset>"
    } else {
      Write-Host "  $name = $value"
    }
  }
}

function Test-BadProxyValue([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $needle = $Value.ToLowerInvariant()
  return $needle.Contains('https://http.docker.internal') -or $needle.Contains('http://http.docker.internal')
}

function Test-SuccessfulPull([hashtable]$PullResult) {
  $text = [string]$PullResult.Output
  if ($text -match 'Status: Image is up to date for ' -or $text -match 'Status: Downloaded newer image for ' -or $text -match 'Digest:\s*sha256:') {
    return $true
  }
  return $PullResult.ExitCode -eq 0
}

function Backup-File([string]$Path) {
  $dest = Join-Path $backupDir ((Split-Path $Path -Leaf) + ".bak")
  Copy-Item $Path $dest -Force
  return $dest
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$TimeoutSec = 30
  )
  $stdout = [System.IO.Path]::GetTempFileName()
  $stderr = [System.IO.Path]::GetTempFileName()
  try {
    $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
      try { $proc.Kill() } catch {}
      return @{
        ExitCode = 124
        Output = "Timed out after ${TimeoutSec}s"
        TimedOut = $true
      }
    }
    return @{
      ExitCode = $proc.ExitCode
      Output = (Get-Content -Raw $stdout) + (Get-Content -Raw $stderr)
      TimedOut = $false
    }
  } finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

function Wait-DockerReady([int]$TimeoutSec = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $version = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('version') -TimeoutSec 15
    if ($version.ExitCode -eq 0 -or $version.Output -match '(?m)^Server:') { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

$userSnapshot = Get-EnvSnapshot User
$machineSnapshot = Get-EnvSnapshot Machine
@{
  timestamp = $timestamp
  user = $userSnapshot
  machine = $machineSnapshot
} | ConvertTo-Json -Depth 6 | Set-Content -Path $envBackupFile

Write-Host "[fix_docker_desktop_proxy] Current proxy env vars"
Write-EnvScope -Label 'User' -Values $userSnapshot
Write-EnvScope -Label 'Machine' -Values $machineSnapshot

if (-not $Apply) {
  Write-Host ""
  Write-Host "[fix_docker_desktop_proxy] Dry run only. No changes applied."
  Write-Host "[fix_docker_desktop_proxy] Re-run with -Apply to remove stale user-scope proxy vars and repair Docker config."
} else {
  foreach ($name in $proxyVars) {
    $value = $userSnapshot[$name]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      [Environment]::SetEnvironmentVariable($name, $null, 'User')
      $changes.Add("Removed user env var $name")
    }
  }
}

if (Test-Path $dockerConfig) {
  Write-Host ""
  Write-Host "[fix_docker_desktop_proxy] Inspecting $dockerConfig"
  $configText = Get-Content -Raw $dockerConfig
  $configJson = $configText | ConvertFrom-Json
  $removeProxySection = $false
  if ($configJson.PSObject.Properties.Name -contains 'proxies') {
    $proxyJson = $configJson.proxies | ConvertTo-Json -Depth 8
    if (Test-BadProxyValue $proxyJson) {
      $removeProxySection = $true
    }
  }
  if ($removeProxySection) {
    $backup = Backup-File $dockerConfig
    if ($Apply) {
      $clone = $configJson.PSObject.Copy()
      $clone.PSObject.Properties.Remove('proxies')
      $clone | ConvertTo-Json -Depth 12 | Set-Content -Path $dockerConfig
      $changes.Add("Removed stale proxies section from $dockerConfig (backup: $backup)")
    } else {
      Write-Host "[fix_docker_desktop_proxy] Would remove stale proxies section from $dockerConfig (backup target: $backup)"
    }
  } else {
    Write-Host "[fix_docker_desktop_proxy] No stale proxy section found in Docker config."
  }
} else {
  Write-Host ""
  Write-Host "[fix_docker_desktop_proxy] Docker config not found at $dockerConfig"
}

if ($Apply -and -not $SkipRestart) {
  Write-Host ""
  Write-Host "[fix_docker_desktop_proxy] Restarting Docker Desktop..."
  Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (-not (Wait-DockerReady -TimeoutSec 240)) {
    Write-Warning "[fix_docker_desktop_proxy] Docker did not become ready within the timeout."
  }
}

Write-Host ""
Write-Host "[fix_docker_desktop_proxy] Verification"
(Invoke-ExternalCommand -FilePath 'docker' -Arguments @('version') -TimeoutSec 20).Output
(Invoke-ExternalCommand -FilePath 'docker' -Arguments @('info') -TimeoutSec 25).Output | Select-String -Pattern 'Proxy|proxy'

$images = @('eclipse-temurin:21-jre','maven:3.9.9-eclipse-temurin-21','node:20-alpine')
$pullFailures = @()
foreach ($image in $images) {
  Write-Host "[pull] $image"
  $pull = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('pull', $image) -TimeoutSec 90
  $pull.Output
  if (-not (Test-SuccessfulPull $pull)) {
    $pullFailures += $image
  }
}

Write-Host ""
if ($changes.Count -gt 0) {
  Write-Host "[fix_docker_desktop_proxy] Changes applied:"
  $changes | ForEach-Object { Write-Host "  - $_" }
  Write-Host "[fix_docker_desktop_proxy] Backups:"
  Write-Host "  - env backup: $envBackupFile"
  if (Test-Path $dockerConfig) {
    Write-Host "  - docker config backups stored in: $backupDir"
  }
  Write-Host "[fix_docker_desktop_proxy] Restore: re-apply values from $envBackupFile and restore the backed-up config.json if needed."
} else {
  Write-Host "[fix_docker_desktop_proxy] No repo-safe automatic changes were necessary."
}

if ($pullFailures.Count -eq 0) {
  Write-Host "[fix_docker_desktop_proxy] PASS: Docker proxy/DNS path is healthy for required base images."
  exit 0
}

Write-Error "[fix_docker_desktop_proxy] FAIL: Docker still cannot pull required base images: $($pullFailures -join ', ')"
Write-Host ""
Write-Host "Manual Docker Desktop check still may be required:"
Write-Host "  Settings -> Resources -> Proxies"
Write-Host "  Disable manual proxy or clear invalid values such as http.docker.internal"
Write-Host "  Apply & Restart"
exit 1
