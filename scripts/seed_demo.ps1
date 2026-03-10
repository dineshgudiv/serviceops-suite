[CmdletBinding()]
param(
  [switch]$CoreOnly
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) { throw $Message }

$seed = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/auth/dev/seed' -Method Post
if (-not $seed.email -or -not $seed.password) {
  Fail "Seed endpoint did not return canonical admin credentials."
}

$loginBody = @{
  email = [string]$seed.email
  password = [string]$seed.password
}
$login = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/auth/login' -Method Post -ContentType 'application/json' -Body ($loginBody | ConvertTo-Json)
if (-not $login.access_token) {
  Fail "Auth login did not return access_token for seeded admin $($seed.email)."
}
$jwt = $login.access_token
$headers = @{ Authorization = "Bearer $jwt"; 'Content-Type' = 'application/json' }

function Ensure-CatalogService {
  $serviceKey = 'svc-core-api'
  $existing = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/itsm/catalog' -Method Get -Headers $headers
  if ($existing | Where-Object { $_.service_key -eq $serviceKey }) {
    return
  }
  Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/itsm/catalog' -Method Post -Headers $headers -Body (@{
    service_key = $serviceKey
    name = 'Core API'
    owner = 'sre'
    sla_tier = 'gold'
  } | ConvertTo-Json) | Out-Null
}

function Ensure-CmdbCi {
  $ciKey = 'ci-core-api'
  $existing = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/cmdb/cis' -Method Get -Headers $headers
  if ($existing | Where-Object { $_.id -eq $ciKey }) {
    return
  }
  Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/cmdb/cis' -Method Post -Headers $headers -Body (@{
    ci_key = $ciKey
    name = 'Core API'
    type = 'SERVICE'
    service_key = 'svc-core-api'
  } | ConvertTo-Json) | Out-Null
}

Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/itsm/incidents' -Method Post -Headers $headers -Body (@{ title='DB saturation'; description='Primary writer saturated'; severity='P1' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/itsm/problems' -Method Post -Headers $headers -Body (@{ title='Repeat DB hot shard'; owner='platform' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/itsm/changes' -Method Post -Headers $headers -Body (@{ title='Index maintenance'; risk='MEDIUM' } | ConvertTo-Json) | Out-Null
Ensure-CatalogService
if ($CoreOnly) {
  Write-Host "[seed_demo] Core seed completed."
  exit 0
}
Ensure-CmdbCi
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/knowledge/documents' -Method Post -Headers $headers -Body (@{ title='DB Recovery'; content='Scale read replicas, throttle writes, and validate /healthz after mitigation.' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/integrations/test-notification' -Method Post -Headers $headers -Body (@{ channel='slack'; message='Demo notification' } | ConvertTo-Json) | Out-Null

Write-Host "[seed_demo] Seed completed."
