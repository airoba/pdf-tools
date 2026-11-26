$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ServiceRoot = Join-Path $Root "services/local-pdf"
Set-Location $ServiceRoot
python -m app.main
