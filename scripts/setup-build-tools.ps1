$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'build-tools.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$nodeVersion = (& node.exe -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $config.node) { throw "Install Node.js $($config.node) x64 first. Current: $nodeVersion" }
& node.exe scripts/install-compiler.mjs
if ($LASTEXITCODE -ne 0) { throw 'Portable compiler installation failed.' }
$npmRoot = Join-Path $projectRoot '.tools\npm'
$npmCli = Join-Path $npmRoot 'node_modules\npm\bin\npm-cli.js'
$installedNpm = if (Test-Path -LiteralPath $npmCli) { (& node.exe $npmCli --version).Trim() } else { '' }
if ($installedNpm -ne $config.npm) {
    & npm.cmd install --prefix $npmRoot --cache (Join-Path $projectRoot '.tools\npm-cache') --no-save --package-lock=false --ignore-scripts --no-audit --no-fund "npm@$($config.npm)"
    if ($LASTEXITCODE -ne 0) { throw 'Project npm installation failed.' }
}
$shim = Join-Path $projectRoot '.tools\npm-shim'
New-Item -ItemType Directory -Force -Path $shim | Out-Null
@'
@echo off
node "%~dp0..\npm\node_modules\npm\bin\npm-cli.js" %*
exit /b %errorlevel%
'@ | Set-Content -LiteralPath (Join-Path $shim 'npm.cmd') -Encoding ASCII
& (Join-Path $PSScriptRoot 'install-rust.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed.' }
. (Join-Path $PSScriptRoot 'toolchain-env.ps1')
Write-Host 'Build tools are ready. No persistent PATH or global npm changes were made.'
