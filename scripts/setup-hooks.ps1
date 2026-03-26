$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot

git config core.hooksPath .githooks

Write-Host "Hooks enabled for this clone."
Write-Host ("Current hooksPath: {0}" -f (git config --get core.hooksPath))
