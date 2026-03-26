# PowerShell installer for CodeWarden
# Run from the repo root: .\install.ps1

$ErrorActionPreference = 'Stop'

$targetDir = Join-Path $HOME '.claude\skills\code-warden'

Write-Host "Installing CodeWarden skill..."

# Remove existing install for a clean copy
if (Test-Path $targetDir) {
  Remove-Item -Recurse -Force $targetDir
}

# Ensure parent directory exists
$skillsDir = Join-Path $HOME '.claude\skills'
if (-not (Test-Path $skillsDir)) {
  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
}

# Copy all skill files
Copy-Item -Recurse -Force . $targetDir

Write-Host "CodeWarden installed successfully to: $targetDir"
Write-Host "You can now load it in your Claude Code or Cowork session."
