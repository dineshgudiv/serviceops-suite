$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

# Find repo root (must contain infra\docker-compose.yml)
$ROOT = (Get-Location).Path
if(!(Test-Path (Join-Path $ROOT 'infra\docker-compose.yml'))){
  throw "Run from repo root (infra\docker-compose.yml not found): $ROOT"
}

function Has($rel){ Test-Path (Join-Path $ROOT $rel) }
function Score([string[]]$checks){
  if(!$checks -or $checks.Count -eq 0){ return 0.0 }
  $hit=0; foreach($c in $checks){ if(Has $c){ $hit++ } }
  return [math]::Round(($hit / $checks.Count), 3)
}

$Modules = @(
  @{Name="Core infra + scripts"; Weight=8; Checks=@('infra\docker-compose.yml','infra\nginx\nginx.conf','scripts\up.ps1','scripts\down.ps1','scripts\reset.ps1','scripts\wait_health.ps1')},
  @{Name="Proof (core)"; Weight=10; Checks=@('scripts\proof_serviceops.ps1','PROOF.md','RUNBOOK.md','README.md')},
  @{Name="Auth service"; Weight=10; Checks=@('services\auth-service\pom.xml','services\auth-service\Dockerfile','services\auth-service\src\main\resources\application.yml','services\auth-service\src\main\resources\db\migration\V1__init.sql','services\auth-service\src\main\java')},
  @{Name="Audit service"; Weight=10; Checks=@('services\audit-service\pom.xml','services\audit-service\Dockerfile','services\audit-service\src\main\resources\application.yml','services\audit-service\src\main\resources\db\migration\V1__init.sql','services\audit-service\src\main\java')},
  @{Name="ITSM service"; Weight=10; Checks=@('services\itsm-service\pom.xml','services\itsm-service\Dockerfile','services\itsm-service\src\main\resources\application.yml','services\itsm-service\src\main\resources\db\migration\V1__init.sql','services\itsm-service\src\main\java')},
  @{Name="Web app (Next.js)"; Weight=10; Checks=@('apps\web\package.json','apps\web\Dockerfile','apps\web\src\app\login\page.tsx','apps\web\src\app\dashboard\page.tsx','apps\web\src\app\api\session\login\route.ts','apps\web\src\middleware.ts','apps\web\public')},
  @{Name="Workflow service"; Weight=4; Checks=@('services\workflow-service\pom.xml','services\workflow-service\Dockerfile','services\workflow-service\src\main\java')},
  @{Name="SLA service"; Weight=4; Checks=@('services\sla-service\pom.xml','services\sla-service\Dockerfile','services\sla-service\src\main\java')},
  @{Name="CMDB service"; Weight=4; Checks=@('services\cmdb-service\pom.xml','services\cmdb-service\Dockerfile','services\cmdb-service\src\main\java')},
  @{Name="Knowledge service"; Weight=4; Checks=@('services\knowledge-service\pom.xml','services\knowledge-service\Dockerfile','services\knowledge-service\src\main\java')},
  @{Name="Integrations service"; Weight=4; Checks=@('services\integrations-service\pom.xml','services\integrations-service\Dockerfile','services\integrations-service\src\main\java')},
  @{Name="Contracts + diff gate"; Weight=6; Checks=@('shared\contracts\openapi','ci\contracts\openapi_diff.ps1')},
  @{Name="CI pipeline"; Weight=6; Checks=@('.github\workflows\ci.yml')},
  @{Name="Events (Kafka schemas/topics)"; Weight=5; Checks=@('infra\kafka\topics.sh','shared\contracts\events')},
  @{Name="Observability"; Weight=6; Checks=@('infra\prometheus\prometheus.yml','infra\grafana\provisioning','infra\loki\loki.yml','infra\tempo\tempo.yml')},
  @{Name="Chaos tooling"; Weight=3; Checks=@('tools\toxiproxy','scripts\inject_failure.ps1')},
  @{Name="Design docs"; Weight=10; Checks=@('docs\HLD.md','docs\ARCHITECTURE.md','docs\RBAC.md','docs\SECURITY.md','docs\API.md','docs\EVAL.md','docs\RAG_GOVERNANCE.md')}
)

$Rows = foreach($m in $Modules){
  $s = Score $m.Checks
  [pscustomobject]@{
    Module=$m.Name
    Weight=[int]$m.Weight
    Score=$s
    Earned=[math]::Round($m.Weight * $s,2)
    Missing=($m.Checks | ?{ -not (Has $_) }) -join '; '
  }
}

$Total  = ($Rows | Measure-Object Weight -Sum).Sum
$Earned = ($Rows | Measure-Object Earned -Sum).Sum
$Pct = [math]::Round((100.0 * $Earned / $Total), 1)

$EmptyDirs = Get-ChildItem -Path $ROOT -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { -not (Get-ChildItem -Path $_.FullName -File -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1) }

$TopMissing = $Rows | Sort-Object @{Expression={($_.Weight - $_.Earned)};Descending=$true} | Select-Object -First 7

Write-Host ""
Write-Host "=== SERVICEOPS COMPLETION REPORT ===" -ForegroundColor Cyan
Write-Host ("Repo: {0}" -f $ROOT)
Write-Host ("Completion (heuristic): {0}%  (Earned {1} / Total {2})" -f $Pct, $Earned, $Total) -ForegroundColor Yellow
Write-Host ("Empty directories: {0}" -f $EmptyDirs.Count) -ForegroundColor Yellow
Write-Host ""

Write-Host "== Module Scores ==" -ForegroundColor Cyan
$Rows | Sort-Object Earned -Descending | Select-Object Module,Weight,Score,Earned | Format-Table -AutoSize

Write-Host ""
Write-Host "== Major Parts Missing (do these next) ==" -ForegroundColor Red
$TopMissing | ForEach-Object {
  $gap=[math]::Round($_.Weight - $_.Earned,2)
  Write-Host ("- {0} (gap {1})" -f $_.Module,$gap) -ForegroundColor Red
  if($_.Missing){ Write-Host ("  Missing: {0}" -f $_.Missing) -ForegroundColor DarkYellow }
}

Write-Host ""
Write-Host "== Empty directories (top 30) ==" -ForegroundColor Cyan
$EmptyDirs | Select-Object -First 30 FullName | Format-Table -AutoSize
if($EmptyDirs.Count -gt 30){ Write-Host ("(Showing 30/{0})" -f $EmptyDirs.Count) -ForegroundColor DarkGray }

Write-Host ""
Write-Host "NOTE: This is file-based. Real completion = proof scripts + tests passing." -ForegroundColor DarkGray
