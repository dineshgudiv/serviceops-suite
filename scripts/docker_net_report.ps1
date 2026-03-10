[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Print-Section([string]$Title) {
  Write-Host ""
  Write-Host "=== $Title ==="
}

function Print-EnvScope([System.EnvironmentVariableTarget]$Scope, [string[]]$Names) {
  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name, $Scope)
    if ($null -ne $value -and $value -ne '') {
      Write-Host ("{0} [{1}] = {2}" -f $name, $Scope, $value)
    }
  }
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
      return "Timed out after ${TimeoutSec}s"
    }
    return (Get-Content -Raw $stdout) + (Get-Content -Raw $stderr)
  } finally {
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}

$proxyVars = @('HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy')
$dockerConfig = Join-Path $env:USERPROFILE '.docker\config.json'
$images = @('eclipse-temurin:21-jre','maven:3.9.9-eclipse-temurin-21','node:20-alpine')

Print-Section "docker version"
Invoke-ExternalCommand -FilePath 'docker' -Arguments @('version') -TimeoutSec 20

Print-Section "docker info proxy lines"
(Invoke-ExternalCommand -FilePath 'docker' -Arguments @('info') -TimeoutSec 25) | Select-String -Pattern 'Proxy|proxy'

Print-Section "proxy env vars"
Print-EnvScope -Scope User -Names $proxyVars
Print-EnvScope -Scope Machine -Names $proxyVars

Print-Section "docker config path"
if (Test-Path $dockerConfig) {
  Write-Host "Exists: $dockerConfig"
  try {
    $json = Get-Content -Raw $dockerConfig | ConvertFrom-Json
    if ($json.proxies) {
      Write-Host "Proxy section present in docker config."
      $json.proxies | ConvertTo-Json -Depth 6
    } else {
      Write-Host "No proxy section in docker config."
    }
  } catch {
    Write-Host "Docker config exists but could not be parsed: $($_.Exception.Message)"
  }
} else {
  Write-Host "Missing: $dockerConfig"
}

Print-Section "base image pulls"
foreach ($image in $images) {
  Write-Host "[pull] $image"
  Invoke-ExternalCommand -FilePath 'docker' -Arguments @('pull', $image) -TimeoutSec 90
}

Print-Section "recent docker errors"
(Invoke-ExternalCommand -FilePath 'docker' -Arguments @('info') -TimeoutSec 25) | Select-String -Pattern 'error|timeout|proxy|lookup|dns'
