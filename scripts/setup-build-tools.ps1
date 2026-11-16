# Validate shared tools. No project-local downloads or implicit system updates.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'toolchain-env.ps1')
Write-Host 'Shared build tools are ready. Use install-rust.ps1 to install/update Rust explicitly.'
