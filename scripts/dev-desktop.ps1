$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'toolchain-env.ps1')
Set-Location -LiteralPath $projectRoot
npm.cmd run tauri -- dev --target x86_64-pc-windows-gnu
