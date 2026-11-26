$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
python -m compileall services/local-pdf/app
if (Test-Path package.json) {
  node --check apps/desktop/electron/main.ts
}
