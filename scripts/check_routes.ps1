param(
  [string]$AppRoot = "apps/web/src/app"
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $AppRoot)) {
  Write-Error "Missing app root: $AppRoot"
  exit 1
}

$ignoreExact = @('api','shared','components','lib','hooks','styles')

function Is-Ignored([string]$name) {
  if ($ignoreExact -contains $name) { return $true }
  if ($name.StartsWith('_')) { return $true }
  if ($name.StartsWith('(')) { return $true }
  if ($name.StartsWith('@')) { return $true }
  return $false
}

$routeDirs = Get-ChildItem -Path $AppRoot -Directory -Recurse | Where-Object {
  $parts = $_.FullName.Substring((Resolve-Path $AppRoot).Path.Length).TrimStart([char]92,[char]47).Split([char[]]@([char]92,[char]47))
  if ($parts.Count -eq 0) { return $false }
  foreach ($p in $parts) {
    if (Is-Ignored $p) { return $false }
  }
  return $true
}

$missing = @()
foreach ($d in $routeDirs) {
  $page = Join-Path $d.FullName 'page.tsx'
  if (-not (Test-Path $page)) { $missing += $d.FullName }
}

$pages = Get-ChildItem -Path $AppRoot -Recurse -File -Filter page.tsx
$badDefault = @()
$badHooks = @()
foreach ($p in $pages) {
  $txt = Get-Content $p.FullName -Raw
  if ($txt -notmatch 'export\s+default\s+function|export\s+default\s+[A-Za-z_]') {
    $badDefault += $p.FullName
  }
  $usesHooks = $txt -match 'useState\(|useEffect\(|useMemo\(|useCallback\(|useRef\('
  $isClient = $txt -match "^\s*'use client'|^\s*`"use client`""
  if ($usesHooks -and -not $isClient) {
    $badHooks += $p.FullName
  }
}

if ($missing.Count -eq 0 -and $badDefault.Count -eq 0 -and $badHooks.Count -eq 0) {
  Write-Host "OK: route integrity checks passed"
  exit 0
}

if ($missing.Count -gt 0) {
  Write-Host "MISSING page.tsx in route directories:"
  $missing | ForEach-Object { Write-Host " - $_" }
}
if ($badDefault.Count -gt 0) {
  Write-Host "page.tsx missing default export:"
  $badDefault | ForEach-Object { Write-Host " - $_" }
}
if ($badHooks.Count -gt 0) {
  Write-Host "Hook usage without use client:"
  $badHooks | ForEach-Object { Write-Host " - $_" }
}

exit 1
