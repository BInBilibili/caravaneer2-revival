#Requires -Version 5.1
<#
  revival-dlc-only / ship.ps1
  Scope-guarded commit + push for the revival DLC workflow.

  Steps:
    1. collect changed paths (tracked + untracked)
    2. FAIL if anything outside the allowed scope (DLC / 2 READMEs / .dsh/skills)
    3. FAIL if the two READMEs were not updated, or are not valid UTF-8 (no BOM)
    4. git add -A  ->  git commit -m <Message>  ->  git push origin <branch>
    5. verify origin/<branch>..HEAD is empty (push really landed)

  All console output is ASCII on purpose: the .ps1 is written as UTF-8 without BOM,
  so Windows PowerShell 5.1 would garble non-ASCII text.

  Usage:
    pwsh -File .dsh/skills/revival-dlc-only/scripts/ship.ps1 -Message "revival: ..."
    pwsh -File ... -DryRun
    pwsh -File ... -AllowOutOfScope -Message "..."   # only after the user approved a core (web/src) change
    pwsh -File ... -SkipReadmeCheck -Message "..."   # docs-only rounds
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Message,

  [switch]$AllowOutOfScope,
  [switch]$SkipReadmeCheck,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "[ship] $m" }
function Warn($m) { Write-Host "[ship][warn] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[ship][FAIL] $m" -ForegroundColor Red; exit 1 }

# ---- 0. locate repo root: <root>/.dsh/skills/revival-dlc-only/scripts/ -> <root> ----
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
if (-not (Test-Path (Join-Path $repo '.git'))) { Fail "not a git repo: $repo" }
Info "repo: $repo"
Set-Location $repo

# ---- 1. collect changes ----
$raw = & git status --porcelain -uall   # -uall: list untracked files individually, not as "dir/"
if (-not $raw) { Fail "nothing to commit - working tree is clean" }

$changed = @()
foreach ($line in $raw) {
  if ($line.Length -lt 4) { continue }
  $p = $line.Substring(3).Trim()
  if ($p -match '^(.*) -> (.*)$') { $p = $Matches[2] }      # rename: keep the new path
  $p = $p.Trim('"')
  $changed += ($p -replace '\\', '/')
}
$changed = $changed | Sort-Object -Unique

Info "changed paths: $($changed.Count)"
$changed | ForEach-Object { Write-Host "        $_" }

# ---- 2. scope guard ----
$allowed = @(
  '^web/public/mods/revival/',
  '^README\.md$',
  '^\.dsh/skills/'
)
$outOfScope = $changed | Where-Object {
  $p = $_
  -not ($allowed | Where-Object { $p -match $_ })
}

if ($outOfScope) {
  if (-not $AllowOutOfScope) {
    Fail @"
out-of-scope changes detected (rule R1: everything defaults to web/public/mods/revival/):
$($outOfScope | ForEach-Object { "  - $_" } | Out-String)
If the user explicitly approved a core change (web/src/**), re-run with -AllowOutOfScope
and make sure BOTH READMEs document it as a core change with its reason and impact.
"@
  }
  Warn "out-of-scope changes accepted via -AllowOutOfScope:"
  $outOfScope | ForEach-Object { Write-Host "        $_" -ForegroundColor Yellow }
}

# forbidden paths (should be gitignored; if they show up, stop)
$forbidden = $changed | Where-Object {
  $_ -match '^web/dist/' -or
  $_ -match '^web/public/assets/' -or
  $_ -match '^web/public/data/' -or
  $_ -match '^decompiled/' -or
  $_ -match 'node_modules/'
}
if ($forbidden) {
  Fail "forbidden paths staged for commit (original/copyrighted assets or build output):`n$($forbidden | ForEach-Object { "  - $_" } | Out-String)"
}

# ---- 3. README guard ----
$readmeRoot = 'README.md'
$readmeDlc  = 'web/public/mods/revival/README.md'
$missing = @()

if (-not $SkipReadmeCheck) {
  foreach ($r in @($readmeRoot, $readmeDlc)) {
    if ($changed -notcontains $r) { $missing += $r }
  }
  if ($missing) {
    Fail @"
README not updated (rule R2). Missing from this change set:
$($missing | ForEach-Object { "  - $_" } | Out-String)
Add the round record to the DLC README (newest first, under the H1) and a short dated
section at the end of the root README.md, then re-run.
(-SkipReadmeCheck exists only for docs-only rounds.)
"@
  }
  Info "README guard: both READMEs updated"
} else {
  Warn "README guard skipped (-SkipReadmeCheck)"
}

# ---- 4. README encoding guard (UTF-8, no BOM) ----
$strict = New-Object System.Text.UTF8Encoding($false, $true)   # throwOnInvalidBytes
foreach ($r in @($readmeRoot, $readmeDlc)) {
  $full = Join-Path $repo $r
  if (-not (Test-Path $full)) { Warn "missing file, skipped: $r"; continue }
  $bytes = [System.IO.File]::ReadAllBytes($full)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Fail "$r has a UTF-8 BOM (rule R7). Rewrite it as UTF-8 without BOM."
  }
  try { [void]$strict.GetString($bytes) }
  catch { Fail "$r is not valid UTF-8 (rule R7): $($_.Exception.Message)`nFix: re-encode the offending bytes to UTF-8." }
}
Info "README encoding guard: UTF-8 without BOM"

# ---- 5. commit + push ----
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
$remote = (& git remote get-url origin).Trim()
Info "branch: $branch   remote: $remote"

if ($DryRun) {
  Warn "DRY RUN - no commit, no push. Plan:"
  Write-Host "        git add -A"
  Write-Host "        git commit -m `"$Message`""
  Write-Host "        git push origin $branch"
  exit 0
}

& git add -A
if ($LASTEXITCODE -ne 0) { Fail "git add failed" }

& git commit -m $Message
if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }

$hash = (& git rev-parse --short HEAD).Trim()
Info "commit: $hash"

& git push origin $branch
if ($LASTEXITCODE -ne 0) {
  Fail @"
git push failed - the commit $hash exists locally but is NOT on GitHub yet.
Fix the network/credential problem and run:  git push origin $branch
Do not report this round as delivered.
"@
}

# ---- 6. verify the remote really moved ----
& git fetch origin $branch --quiet 2>$null
$ahead = (& git rev-list --count "origin/$branch..HEAD").Trim()
if ($ahead -ne '0') { Fail "push verification failed: origin/$branch..HEAD = $ahead commit(s) still local" }

Info "push verified: origin/$branch is up to date"
Write-Host ""
Write-Host "DONE  commit $hash on $branch"
Write-Host "      https://github.com/BInBilibili/caravaneer2-revival/commit/$hash"
