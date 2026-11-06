$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tools'
$env:RUSTUP_HOME = Join-Path $toolRoot 'rustup'
$env:CARGO_HOME = Join-Path $toolRoot 'cargo'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
$installer = Join-Path $toolRoot 'rustup-init.exe'
if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $installer
}
& $installer -y --no-modify-path --profile minimal --default-toolchain stable-x86_64-pc-windows-gnu
if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed.' }
& (Join-Path $env:CARGO_HOME 'bin\rustc.exe') --version
