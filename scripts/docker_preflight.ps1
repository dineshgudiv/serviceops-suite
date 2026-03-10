[CmdletBinding()]
param(
  [string[]]$Images = @(
    'postgres:16',
    'nginx:1.27-alpine',
    'node:20-alpine',
    'maven:3.9.9-eclipse-temurin-21',
    'eclipse-temurin:21-jre'
  )
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  throw $Message
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

function Get-DockerContextSummary {
  $contextShow = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('context', 'show') -TimeoutSec 10
  $contextLs = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('context', 'ls') -TimeoutSec 15
  $listing = $contextLs.Output.Trim()
  $current = if ($contextShow.ExitCode -eq 0) { $contextShow.Output.Trim() } else { '<unknown>' }
  if ($current -eq '<unknown>' -and $listing) {
    $active = (($listing -split "`r?`n") | Where-Object { $_ -match '\s\*\s' } | Select-Object -First 1)
    if ($active) {
      $current = (($active -split '\s+') | Where-Object { $_ } | Select-Object -First 1)
    }
  }
  return @{
    Current = $current
    Listing = $listing
  }
}

function Test-HasServerSection([string]$Text) {
  return $Text -match '(?m)^Server:'
}

function Get-DockerServerStatus {
  $version = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('version') -TimeoutSec 20
  $info = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('info') -TimeoutSec 20
  $context = Get-DockerContextSummary
  $hasVersionServer = Test-HasServerSection ([string]$version.Output)
  $hasInfoServer = Test-HasServerSection ([string]$info.Output)
  return @{
    Version = $version
    Info = $info
    Context = $context
    HasServer = ($hasVersionServer -or $hasInfoServer)
  }
}

function Get-DockerReadinessMessage([hashtable]$State) {
  $context = $State.Context.Current
  $versionOutput = [string]$State.Version.Output
  $infoOutput = [string]$State.Info.Output

  if ($State.Version.ExitCode -eq 9009) {
    return "[docker_preflight] Docker CLI is missing. Install Docker Desktop and ensure `docker` is on PATH."
  }

  if ($State.Version.TimedOut -or $State.Info.TimedOut) {
    return @"
[docker_preflight] Docker Desktop engine is not ready.
Current context: $context
Server status: unavailable
Next step: Start Docker Desktop and wait until `docker info` shows a Server section.
"@
  }

  if ($versionOutput -match 'dockerDesktopLinuxEngine|error during connect|daemon is not running|The system cannot find the file specified') {
    return @"
[docker_preflight] Docker Desktop is installed but the Linux engine is not running.
Current context: $context
Server status: unavailable
Next step: Start Docker Desktop, confirm Linux containers are enabled, then run `docker version` again and verify both Client and Server sections appear.
"@
  }

  if (-not $State.HasServer) {
    return @"
[docker_preflight] Docker CLI is responding, but no Docker Server is available.
Current context: $context
Server status: unavailable
Next step: Run `docker context ls`, switch to a valid context if needed, and wait until `docker info` shows a Server section.
docker version output:
$versionOutput
"@
  }

  if ($State.Info.ExitCode -ne 0) {
    return @"
[docker_preflight] Docker Server did not respond cleanly to `docker info`.
Current context: $context
Server status: unhealthy
docker info output:
$infoOutput
"@
  }

  return $null
}

function Test-SuspiciousProxy([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $needle = $Value.ToLowerInvariant()
  if ($needle -match '^\s*(http|https)\s+proxy:\s*http\.docker\.internal:3128\s*$') {
    return $false
  }
  return $needle.Contains('https://http.docker.internal') -or $needle.Contains('http://http.docker.internal')
}

function Test-SuccessfulPull([hashtable]$PullResult) {
  $text = [string]$PullResult.Output
  if ($text -match 'Status: Image is up to date for ' -or $text -match 'Status: Downloaded newer image for ' -or $text -match 'Digest:\s*sha256:') {
    return $true
  }
  return $PullResult.ExitCode -eq 0
}

Write-Host "[docker_preflight] Checking Docker daemon..."
$state = Get-DockerServerStatus
$readinessFailure = Get-DockerReadinessMessage $state
if ($readinessFailure) {
  if ($state.Context.Listing) {
    Write-Host "[docker_preflight] docker context ls:"
    Write-Host $state.Context.Listing
  }
  Fail $readinessFailure
}

$proxyLines = @(
  ($state.Info.Output -split "`r?`n" | Where-Object { $_ -match 'Proxy' })
)

$suspicious = @()
foreach ($line in $proxyLines) {
  if (Test-SuspiciousProxy $line) {
    $suspicious += $line.Trim()
  }
}

if ($proxyLines.Count -gt 0) {
  Write-Host "[docker_preflight] Docker info proxy lines:"
  $proxyLines | ForEach-Object { Write-Host "  $_" }
}

if ($suspicious.Count -gt 0) {
  Fail "[docker_preflight] Suspicious Docker proxy configuration detected:`n$($suspicious -join "`n")`nRun .\scripts\fix_docker_desktop_proxy.ps1 and then re-test."
}

foreach ($image in $Images) {
  Write-Host "[docker_preflight] Testing Docker Hub reachability with '$image'..."
  $pull = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('pull', $image) -TimeoutSec 90
  if (-not (Test-SuccessfulPull $pull)) {
    $reason = 'machine proxy or DNS issue'
    $joined = [string]$pull.Output
    if ($pull.TimedOut) {
      $reason = 'Docker daemon not ready or network path is hanging'
    }
    if ($joined -match 'toomanyrequests|rate limit') {
      $reason = 'Docker Hub auth/rate-limit issue'
    } elseif ($joined -match 'lookup .*i/o timeout|no such host|server misbehaving') {
      $reason = 'Docker daemon DNS issue'
    } elseif ($joined -match 'proxyconnect tcp|proxy error|http.docker.internal') {
      $reason = 'machine proxy issue'
    } elseif ($joined -match 'daemon is not running|error during connect') {
      $reason = 'Docker daemon not ready'
    }
    Fail "[docker_preflight] Docker base image pull failed for '$image'. Diagnosis: $reason.`n$joined`nRun .\scripts\docker_net_report.ps1 for a full report."
  }
}

Write-Host "[docker_preflight] PASS: Docker daemon is ready and base image reachability is working."
exit 0
