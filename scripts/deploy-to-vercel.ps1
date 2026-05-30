# Deploy PLUM CLOUD LABS Sprint Plan to Git (main) -> Vercel production.
# Run from repo root:  powershell -ExecutionPolicy Bypass -File scripts/deploy-to-vercel.ps1
#
# Workflow: develop locally (python -m http.server) -> validate here -> push -> Vercel auto-builds prod.

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "`n=== PLUM CLOUD LABS Sprint Plan — deploy ===" -ForegroundColor Cyan
Write-Host "Repo root: $Root`n"

Write-Host "1/3  Running planner tests..." -ForegroundColor Yellow
node (Join-Path $Root "planner\.tests\run-tests.js")
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nTests failed. Fix before deploying.`n" -ForegroundColor Red
  exit 1
}
Write-Host "     Tests passed.`n" -ForegroundColor Green

$msg = Read-Host "2/3  Commit message (Enter for default)"
if ([string]::IsNullOrWhiteSpace($msg)) {
  $msg = "Deploy sprint planner to production."
}

Write-Host "`n3/3  Confirm deploy to production (git push origin main -> Vercel)" -ForegroundColor Yellow
$confirm = Read-Host "Type yes to commit and push"
if ($confirm -ne "yes") {
  Write-Host "Deploy cancelled — local changes untouched on remote.`n" -ForegroundColor DarkYellow
  exit 0
}

$paths = @(
  "vercel.json",
  ".vercelignore",
  "planner",
  "README.planner.md",
  "scripts/deploy-to-vercel.ps1",
  ".gitignore",
  ".cursor/rules/sprint-planner.mdc",
  ".cursor/rules/deploy-vercel.mdc"
)

foreach ($p in $paths) {
  $full = Join-Path $Root $p
  if (Test-Path $full) { git add $p }
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nothing staged to commit.`n" -ForegroundColor DarkYellow
  exit 0
}

git commit -m $msg
if ($LASTEXITCODE -ne 0) { exit 1 }

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host @"

No git remote 'origin' yet. One-time setup:
  1. Create an empty GitHub repo (e.g. PlumCloudLabs_Sprint-Plan)
  2. git remote add origin https://github.com/kalanithib94/PlumCloudLabs_Sprint-Plan.git
  3. git push -u origin main
  4. In Vercel: Import Project -> that repo -> Production branch = main

Commit saved locally. Push manually when remote is ready.

"@ -ForegroundColor DarkYellow
  exit 0
}

git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nPush failed. Check remote access.`n" -ForegroundColor Red
  exit 1
}

Write-Host "`nPushed to origin/main. Vercel will deploy production automatically.`n" -ForegroundColor Green
