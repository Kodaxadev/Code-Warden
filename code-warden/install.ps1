# PowerShell installer for CodeWarden.
# Run from the skill folder: .\install.ps1
param(
  [ValidateSet('agents', 'codex', 'claude')]
  [string]$Target = 'agents'
)

$ErrorActionPreference = 'Stop'

$targetMap = @{
  agents = Join-Path $HOME '.agents\skills\code-warden'
  codex = Join-Path $HOME '.codex\skills\code-warden'
  claude = Join-Path $HOME '.claude\skills\code-warden'
}

$targetDir = $targetMap[$Target]
$skillsDir = Split-Path -Parent $targetDir

Write-Host "Installing CodeWarden skill for $Target..."

if (Test-Path $targetDir) {
  Remove-Item -Recurse -Force $targetDir
}

if (-not (Test-Path $skillsDir)) {
  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
}

Copy-Item -Recurse -Force . $targetDir

Write-Host "CodeWarden installed successfully to: $targetDir"
Write-Host "Restart or refresh your agent session so the updated skill metadata is loaded."
