$ErrorActionPreference = "Stop"

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    Write-Error "[hard_check] FAIL: $Message"
  }
}

Write-Host "[hard_check] Checking /health"
$health = Invoke-RestMethod -Uri 'http://localhost:8080/health' -Method Get -TimeoutSec 10
Assert-True ($health.status -eq 'UP') '/health did not return status=UP'

Write-Host "[hard_check] Checking /api/v1/rag/upload"
$uploadBody = @{ source = 'demo-runbook'; text = 'Restart service and validate /health endpoint.' } | ConvertTo-Json
$upload = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/rag/upload' -Method Post -ContentType 'application/json' -Body $uploadBody -TimeoutSec 15
Assert-True (-not [string]::IsNullOrWhiteSpace($upload.documentId)) 'upload response missing documentId'
Assert-True ($upload.status -eq 'indexed') 'upload response status != indexed'

Write-Host "[hard_check] Checking /api/v1/rag/ask"
$askBody = @{ question = 'How should I recover a failed service?' } | ConvertTo-Json
$ask = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/rag/ask' -Method Post -ContentType 'application/json' -Body $askBody -TimeoutSec 15
Assert-True (-not [string]::IsNullOrWhiteSpace($ask.answer)) 'ask response missing answer'
Assert-True ($ask.citations.Count -gt 0) 'ask response missing citations'
Assert-True ($ask.evidenceOnly -eq $true) 'ask response evidenceOnly is not true'

Write-Host "[hard_check] PASS"
