$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'build-tools.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$toolRoot = Join-Path $projectRoot '.tools'
$env:RUSTUP_HOME = Join-Path $toolRoot 'rustup'
$env:CARGO_HOME = Join-Path $toolRoot 'cargo'
New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
foreach ($candidate in @($config.rustToolchain, 'stable-x86_64-pc-windows-gnu')) {
    $compiler = Join-Path $env:RUSTUP_HOME "toolchains\$candidate\bin\rustc.exe"
    if (Test-Path -LiteralPath $compiler) {
        $version = (& $compiler --version).Trim()
        if ($LASTEXITCODE -eq 0 -and $version -match ('^rustc ' + [regex]::Escape($config.rust) + ' ')) {
            Write-Host "Reusing verified Rust $($config.rust): $candidate"
            return
        }
    }
}
$installer = Join-Path $toolRoot 'rustup-init.exe'
if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $installer
}
& $installer -y --no-modify-path --profile minimal --default-toolchain $config.rustToolchain
if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed.' }
& (Join-Path $env:CARGO_HOME 'bin\rustc.exe') --version
