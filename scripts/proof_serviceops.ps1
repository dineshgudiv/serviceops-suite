$ErrorActionPreference = "Stop"

function Invoke-HttpJson {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers,
    [object]$Body,
    [string]$CookieJar,
    [string]$CookieJarOut
  )

  $headersFile = [System.IO.Path]::GetTempFileName()
  $bodyFile = [System.IO.Path]::GetTempFileName()
  $payloadFile = $null
  try {
    $args = @('-sS', '-D', $headersFile, '-o', $bodyFile, '-X', $Method)
    if ($CookieJar) {
      $args += @('-b', $CookieJar)
    }
    if ($CookieJarOut) {
      $args += @('-c', $CookieJarOut)
    }
    if ($Headers) {
      foreach ($key in $Headers.Keys) {
        $args += @('-H', ('{0}: {1}' -f $key, $Headers[$key]))
      }
    }
    if ($null -ne $Body) {
      $payloadFile = [System.IO.Path]::GetTempFileName()
      Set-Content -Path $payloadFile -Value ($Body | ConvertTo-Json -Depth 8) -NoNewline
      $args += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $payloadFile))
    }
    $args += $Url
    & curl.exe @args | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "curl exited with code $LASTEXITCODE"
    }

    $headerText = Get-Content -Raw $headersFile
    $bodyText = Get-Content -Raw $bodyFile
    $statusMatches = [regex]::Matches($headerText, 'HTTP/\d+(?:\.\d+)?\s+(\d{3})')
    if ($statusMatches.Count -eq 0) {
      throw "No HTTP status line returned for $Url"
    }
    $status = [int]$statusMatches[$statusMatches.Count - 1].Groups[1].Value
    $contentType = ''
    $requestId = ''
    foreach ($line in ($headerText -split "`r?`n")) {
      if ($line -match '^(?i:content-type):\s*(.+)$') { $contentType = $Matches[1].Trim() }
      if ($line -match '^(?i:x-request-id):\s*(.+)$') { $requestId = $Matches[1].Trim() }
    }
    $parsed = $null
    if ($bodyText -and $contentType -like 'application/json*') {
      try { $parsed = $bodyText | ConvertFrom-Json } catch {}
    }
    return @{
      status = $status
      body = $bodyText
      json = $parsed
      contentType = $contentType
      requestId = $requestId
    }
  } finally {
    $cleanup = @($headersFile, $bodyFile)
    if ($payloadFile) { $cleanup += $payloadFile }
    Remove-Item -Force -ErrorAction SilentlyContinue $cleanup
  }
}

function Wait-Http200([string]$Url, [int]$TimeoutSec = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $code = & curl.exe -s -o NUL -w "%{http_code}" $Url
    if ($code -eq '200') { return }
    Start-Sleep -Seconds 2
  }
  throw "Timed out waiting for $Url"
}

function New-Check([string]$Name, [string]$Status, [string]$Details) {
  [PSCustomObject]@{ Name = $Name; Status = $Status; Details = $Details }
}

function Add-Check([System.Collections.Generic.List[object]]$Bucket, [string]$Name, [scriptblock]$Action, [switch]$Optional) {
  try {
    $result = & $Action
    if ($null -eq $result -or [string]::IsNullOrWhiteSpace([string]$result)) {
      $result = "ok"
    }
    $Bucket.Add((New-Check -Name $Name -Status 'PASS' -Details ([string]$result)))
  } catch {
    $status = if ($Optional) { 'PARTIAL' } else { 'FAIL' }
    $Bucket.Add((New-Check -Name $Name -Status $status -Details $_.Exception.Message))
  }
}

function First-Status([System.Collections.Generic.List[object]]$Bucket, [string]$Status) {
  return $Bucket | Where-Object { $_.Status -eq $Status } | Select-Object -First 1
}

$proofLines = [System.Collections.Generic.List[string]]::new()
$coreChecks = [System.Collections.Generic.List[object]]::new()
$extendedChecks = [System.Collections.Generic.List[object]]::new()
$cookieJar = [System.IO.Path]::GetTempFileName()
$stackStarted = $false

function Write-ProofRun([System.Collections.Generic.List[string]]$Lines) {
  Set-Content -Path (Join-Path $PSScriptRoot '..\PROOF_RUN.md') -Value ($Lines -join "`r`n")
}

function Test-DockerAvailable {
  try {
    & docker info *> $null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

$proofLines.Add("# Proof ServiceOps Real Stack")
$proofLines.Add("")
$proofLines.Add("Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$proofLines.Add("")

if (-not (Test-DockerAvailable)) {
  $proofLines.Add("CORE: NOT_RUN")
  $proofLines.Add("")
  $proofLines.Add("EXTENDED: NOT_RUN")
  $proofLines.Add("")
  $proofLines.Add("OVERALL: MACHINE_ISSUE")
  $proofLines.Add("Error: Docker daemon is not ready. Run .\scripts\docker_preflight.ps1 after Docker Desktop starts.")
  Write-ProofRun $proofLines
  throw "Docker daemon is not ready. Run .\scripts\docker_preflight.ps1 after Docker Desktop starts."
}

try {
  & "$PSScriptRoot\docker_preflight.ps1"
} catch {
  $proofLines.Add("CORE: NOT_RUN")
  $proofLines.Add("")
  $proofLines.Add("EXTENDED: NOT_RUN")
  $proofLines.Add("")
  $proofLines.Add("OVERALL: MACHINE_ISSUE")
  $proofLines.Add("Error: $($_.Exception.Message)")
  Write-ProofRun $proofLines
  throw
}

try {
  & "$PSScriptRoot\up.ps1"
  $stackStarted = $true

  & "$PSScriptRoot\wait_health.ps1" -Url 'http://127.0.0.1:8080/healthz' -TimeoutSec 300
  Wait-Http200 -Url 'http://127.0.0.1:8080/api/auth/.well-known/jwks.json' -TimeoutSec 300
  Wait-Http200 -Url 'http://127.0.0.1:8080/api/gw/health' -TimeoutSec 120
  Wait-Http200 -Url 'http://127.0.0.1:8080/login' -TimeoutSec 120

  $seed = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/auth/dev/seed'
  if ($seed.status -ne 200 -or -not $seed.json.email -or -not $seed.json.password) {
    throw "Seed failed status=$($seed.status) body=$($seed.body)"
  }
  $seedEmail = [string]$seed.json.email
  $seedPassword = [string]$seed.json.password

  Add-Check $coreChecks 'seed endpoint' {
    "email=$seedEmail"
  }

  $directLogin = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/auth/login' -Body @{
    email = $seedEmail
    password = $seedPassword
  }
  if ($directLogin.status -ne 200 -or -not $directLogin.json.access_token) {
    throw "Direct auth login failed status=$($directLogin.status) body=$($directLogin.body)"
  }
  $jwt = [string]$directLogin.json.access_token
  $authHeaders = @{ Authorization = "Bearer $jwt" }

  Add-Check $coreChecks 'direct auth login' {
    'access_token returned'
  }

  Add-Check $coreChecks 'direct auth /me' {
    $me = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/auth/me' -Headers $authHeaders
    if ($me.status -ne 200 -or $me.json.user.email -ne $seedEmail) {
      throw "status=$($me.status) body=$($me.body)"
    }
    "user=$($me.json.user.email)"
  }

  Add-Check $coreChecks 'web session login' {
    $webLogin = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/session/login' -Body @{
      email = $seedEmail
      password = $seedPassword
    } -CookieJarOut $cookieJar
    if ($webLogin.status -ne 200) {
      throw "status=$($webLogin.status) body=$($webLogin.body)"
    }
    'session cookie issued'
  }

  Add-Check $coreChecks 'web session bootstrap' {
    $sessionMe = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/session/me' -CookieJar $cookieJar
    if ($sessionMe.status -ne 200 -or $sessionMe.json.user.email -ne $seedEmail) {
      throw "status=$($sessionMe.status) body=$($sessionMe.body)"
    }
    "user=$($sessionMe.json.user.email)"
  }

  Add-Check $coreChecks 'protected route redirects when signed out' {
    $code = & curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:8080/dashboard
    if ($code -ne '307' -and $code -ne '308') {
      throw "expected redirect, got status=$code"
    }
    "status=$code"
  }

  Add-Check $coreChecks 'gateway health probe' {
    $gw = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/gw/health'
    if ($gw.status -ne 200 -or -not $gw.json.ok -or $gw.json.service -ne 'gateway') {
      throw "status=$($gw.status) body=$($gw.body)"
    }
    $gw.body
  }

  Add-Check $coreChecks 'login page reachable' {
    $code = & curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:8080/login
    if ($code -ne '200') { throw "status=$code" }
    "status=$code"
  }

  Add-Check $coreChecks 'getting-started page reachable with session' {
    $page = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/getting-started' -CookieJar $cookieJar
    if ($page.status -ne 200 -or $page.contentType -notlike 'text/html*') {
      throw "status=$($page.status) contentType=$($page.contentType)"
    }
    'html returned'
  }

  & "$PSScriptRoot\seed_demo.ps1" -CoreOnly

  Add-Check $coreChecks 'incidents list non-empty' {
    $inc = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/itsm/incidents' -Headers $authHeaders
    if ($inc.status -ne 200 -or -not $inc.json -or $inc.json.Count -lt 1) {
      throw "status=$($inc.status) body=$($inc.body)"
    }
    "count=$($inc.json.Count)"
  }

  Add-Check $coreChecks 'problems list reachable' {
    $problems = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/itsm/problems' -Headers $authHeaders
    if ($problems.status -ne 200) {
      throw "status=$($problems.status) body=$($problems.body)"
    }
    "count=$($problems.json.Count)"
  }

  Add-Check $coreChecks 'changes list reachable' {
    $changes = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/itsm/changes' -Headers $authHeaders
    if ($changes.status -ne 200) {
      throw "status=$($changes.status) body=$($changes.body)"
    }
    "count=$($changes.json.Count)"
  }

  Add-Check $coreChecks 'catalog list reachable' {
    $catalog = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/itsm/catalog' -Headers $authHeaders
    if ($catalog.status -ne 200) {
      throw "status=$($catalog.status) body=$($catalog.body)"
    }
    "count=$($catalog.json.Count)"
  }

  Add-Check $extendedChecks 'audit verify' {
    $verify = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/audit/verify?orgKey=demo'
    if ($verify.status -ne 200 -or -not $verify.json.ok) {
      throw "status=$($verify.status) body=$($verify.body)"
    }
    'ok=true'
  } -Optional

  Add-Check $extendedChecks 'SLA endpoint' {
    $inc = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/itsm/incidents' -Headers $authHeaders
    $firstId = $inc.json[0].id
    $sla = Invoke-HttpJson -Method GET -Url ("http://127.0.0.1:8080/api/sla/tickets/state?incidentId={0}" -f $firstId) -Headers $authHeaders
    if ($sla.status -ne 200 -or $null -eq $sla.json.breached) {
      throw "status=$($sla.status) body=$($sla.body)"
    }
    "incident_id=$firstId"
  } -Optional

  Add-Check $extendedChecks 'CMDB list reachable' {
    $cmdb = Invoke-HttpJson -Method GET -Url 'http://127.0.0.1:8080/api/cmdb/cis' -Headers $authHeaders
    if ($cmdb.status -ne 200) {
      throw "status=$($cmdb.status) body=$($cmdb.body)"
    }
    "count=$($cmdb.json.Count)"
  } -Optional

  Add-Check $extendedChecks 'knowledge upload and ask' {
    $upload = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/knowledge/documents' -Headers $authHeaders -Body @{
      title = 'DB Recovery'
      content = 'Scale read replicas, throttle writes, and validate /healthz after mitigation.'
    }
    if ($upload.status -ne 200) {
      throw "upload status=$($upload.status) body=$($upload.body)"
    }
    $ask = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/knowledge/ask' -Headers $authHeaders -Body @{
      question = 'How do I recover DB saturation?'
    }
    if ($ask.status -ne 200 -or -not $ask.json.citations -or $ask.json.citations.Count -lt 1) {
      throw "ask status=$($ask.status) body=$($ask.body)"
    }
    "citations=$($ask.json.citations.Count)"
  } -Optional

  Add-Check $extendedChecks 'integrations notification test' {
    $integration = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/integrations/test-notification' -Headers $authHeaders -Body @{
      channel = 'slack'
      message = 'Proof notification'
    }
    if ($integration.status -ne 200) {
      throw "status=$($integration.status) body=$($integration.body)"
    }
    'notification test returned 200'
  } -Optional

  Add-Check $extendedChecks 'workflow contract returns 501' {
    $workflow = Invoke-HttpJson -Method POST -Url 'http://127.0.0.1:8080/api/workflow/approvals/proof-check/approve' -Headers $authHeaders -Body @{}
    if ($workflow.status -ne 501) {
      throw "status=$($workflow.status) body=$($workflow.body)"
    }
    'expected 501'
  } -Optional

  $coreFail = First-Status $coreChecks 'FAIL'
  $extendedFail = First-Status $extendedChecks 'FAIL'
  $extendedPartial = First-Status $extendedChecks 'PARTIAL'

  $coreStatus = if ($coreFail) { 'FAIL' } else { 'PASS' }
  if ($extendedFail) {
    $extendedStatus = 'FAIL'
  } elseif ($extendedPartial) {
    $extendedStatus = 'PARTIAL'
  } else {
    $extendedStatus = 'PASS'
  }
  if ($coreStatus -eq 'FAIL') {
    $overallStatus = 'FAIL'
  } elseif ($extendedStatus -eq 'FAIL' -or $extendedStatus -eq 'PARTIAL') {
    $overallStatus = 'PARTIAL'
  } else {
    $overallStatus = 'PASS'
  }

  $proofLines.Add("CORE: $coreStatus")
  foreach ($check in $coreChecks) {
    $proofLines.Add("- [$($check.Status)] $($check.Name): $($check.Details)")
  }
  $proofLines.Add("")
  $proofLines.Add("EXTENDED: $extendedStatus")
  foreach ($check in $extendedChecks) {
    $proofLines.Add("- [$($check.Status)] $($check.Name): $($check.Details)")
  }
  $proofLines.Add("")
  $proofLines.Add("OVERALL: $overallStatus")

  Write-ProofRun $proofLines

  if ($coreStatus -eq 'FAIL') {
    throw ($coreFail.Details)
  }
} catch {
  if (-not ($proofLines -join "`n") -match 'OVERALL:') {
    $message = $_.Exception.Message
    if (
      $message -match '\[docker_preflight\]' -or
      $message -match 'dockerDesktopLinuxEngine' -or
      $message -match 'Docker daemon is not ready' -or
      $message -match 'Docker base image pull failed'
    ) {
      $proofLines.Add("CORE: NOT_RUN")
      $proofLines.Add("")
      $proofLines.Add("EXTENDED: NOT_RUN")
      $proofLines.Add("")
      $proofLines.Add("OVERALL: MACHINE_ISSUE")
      $proofLines.Add("Error: $message")
    } else {
      $proofLines.Add("CORE: FAIL")
      $proofLines.Add("")
      $proofLines.Add("EXTENDED: NOT_RUN")
      $proofLines.Add("")
      $proofLines.Add("OVERALL: FAIL")
      $proofLines.Add("Error: $message")
    }
    Write-ProofRun $proofLines
  }
  throw
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $cookieJar
  if ($stackStarted -and (Test-DockerAvailable)) {
    Write-Host "[proof] Stopping proof stack without deleting volumes..."
    Push-Location (Join-Path $PSScriptRoot "..\infra")
    try {
      docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
    } finally {
      Pop-Location
    }
  } elseif (-not $stackStarted) {
    Write-Host "[proof] Stack never started; skipping docker compose down."
  } else {
    Write-Host "[proof] Docker is unavailable during teardown; skipping docker compose down."
  }
}

Get-Content (Join-Path $PSScriptRoot '..\PROOF_RUN.md')
