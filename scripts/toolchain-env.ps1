# Shared, user-installed tools. Dot-source to configure only this PowerShell process.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildTools = Get-Content -LiteralPath (Join-Path $projectRoot 'build-tools.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sharedRoot = $env:DEVTOOLS_ROOT
if (-not $sharedRoot) { $sharedRoot = [Environment]::GetEnvironmentVariable('DEVTOOLS_ROOT', 'User') }
if ($sharedRoot) {
    if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $sharedRoot 'build-cache\chaoxi-wallpaper' }
    $sharedNode = Join-Path $sharedRoot 'nodejs'
    if (Test-Path -LiteralPath (Join-Path $sharedNode 'node.exe')) { $env:PATH = "$sharedNode;$env:PATH" }
}
foreach ($variable in @('RUSTUP_HOME', 'CARGO_HOME', 'npm_config_cache')) {
    $value = [Environment]::GetEnvironmentVariable($variable, 'Process')
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($variable, 'User') }
    if ($value) { [Environment]::SetEnvironmentVariable($variable, $value, 'Process') }
}
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
$env:CARGO_HOME = $cargoHome
$env:PATH = "$(Join-Path $cargoHome 'bin');$env:PATH"
$compilerBin = $env:MSYS2_UCRT64_BIN
if (-not $compilerBin) { $compilerBin = [Environment]::GetEnvironmentVariable('MSYS2_UCRT64_BIN', 'User') }
if (-not $compilerBin) {
    $gcc = Get-Command gcc.exe -ErrorAction SilentlyContinue
    if ($gcc) { $compilerBin = Split-Path -Parent $gcc.Source }
}
if (-not $compilerBin) { throw 'Install MSYS2 UCRT64 GCC and set MSYS2_UCRT64_BIN, or put its bin directory on PATH.' }
foreach ($file in @('gcc.exe', 'g++.exe', 'windres.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $compilerBin $file))) { throw "Missing shared compiler: $file" }
}
if ((& (Join-Path $compilerBin 'gcc.exe') -dumpmachine).Trim() -ne 'x86_64-w64-mingw32') { throw 'An x64 MinGW compiler is required.' }
$env:PATH = "$compilerBin;$env:PATH"
$actualNode = (& node.exe -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or [version]$actualNode -lt [version]'22.12.0') { throw 'Install a supported Node.js LTS version (22.12 or newer).' }
$npmVersion = (& npm.cmd --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'System npm is unavailable.' }
# Use installed stable GNU. Updating is an explicit setup operation.
if (-not (Get-Command rustup.exe -ErrorAction SilentlyContinue)) { throw 'Install shared Rust with scripts/install-rust.ps1 first.' }
$installedToolchains = & rustup.exe toolchain list
if ($LASTEXITCODE -ne 0 -or -not ($installedToolchains -match '^stable-x86_64-pc-windows-gnu(?:\s|$)')) { throw 'Install shared stable GNU Rust explicitly with scripts/install-rust.ps1.' }
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$rustVersion = (& rustc.exe --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Install shared Rust with scripts/install-rust.ps1 first.' }
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $compilerBin 'gcc.exe'
$env:CC = Join-Path $compilerBin 'gcc.exe'
$env:CXX = Join-Path $compilerBin 'g++.exe'
$env:RC = Join-Path $compilerBin 'windres.exe'
$env:CARGO_BUILD_JOBS = '4'
$gccVersion = (& $env:CC -dumpfullversion).Trim()
Write-Host "Shared environment: Node $actualNode / npm $npmVersion / $rustVersion / GCC $gccVersion"
Write-Host "Cargo: $cargoHome; compiler: $compilerBin"
