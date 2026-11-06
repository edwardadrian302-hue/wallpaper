# Dot-source this file. Changes apply only to the current PowerShell process.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildTools = Get-Content -LiteralPath (Join-Path $projectRoot 'build-tools.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$actualNode = (& node.exe -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or $actualNode -ne $buildTools.node) { throw "Install Node.js $($buildTools.node) first. Current: $actualNode" }
$env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
$env:CARGO_HOME = Join-Path $projectRoot '.tools\cargo'
$env:npm_config_cache = Join-Path $projectRoot '.tools\npm-cache'
$compilerBin = Join-Path $projectRoot $buildTools.compiler.directory
$npmShim = Join-Path $projectRoot '.tools\npm-shim'
$npmCli = Join-Path $projectRoot '.tools\npm\node_modules\npm\bin\npm-cli.js'
foreach ($requiredFile in @((Join-Path $compilerBin 'gcc.exe'), (Join-Path $compilerBin 'g++.exe'), (Join-Path $compilerBin 'windres.exe'), $npmCli, (Join-Path $npmShim 'npm.cmd'))) {
    if (-not (Test-Path -LiteralPath $requiredFile)) { throw 'Build tools are missing. Run scripts/setup-build-tools.ps1 first.' }
}
$gccVersion = (& (Join-Path $compilerBin 'gcc.exe') -dumpfullversion).Trim()
if ($LASTEXITCODE -ne 0 -or $gccVersion -ne $buildTools.compiler.gcc) { throw 'Compiler version differs from build-tools.json.' }
$npmVersion = (& node.exe $npmCli --version).Trim()
if ($LASTEXITCODE -ne 0 -or $npmVersion -ne $buildTools.npm) { throw 'Project npm version differs from build-tools.json.' }
$rustCandidates = @($buildTools.rustToolchain, 'stable-x86_64-pc-windows-gnu')
$selectedRust = $null
foreach ($candidate in $rustCandidates) {
    $rustCompiler = Join-Path $env:RUSTUP_HOME "toolchains\$candidate\bin\rustc.exe"
    if (Test-Path -LiteralPath $rustCompiler) {
        $rustVersion = (& $rustCompiler --version).Trim()
        if ($LASTEXITCODE -eq 0 -and $rustVersion -match ('^rustc ' + [regex]::Escape($buildTools.rust) + ' ')) { $selectedRust = $candidate; break }
    }
}
if (-not $selectedRust) { throw "Rust $($buildTools.rust) GNU is missing. Run scripts/install-rust.ps1." }
$env:RUSTUP_TOOLCHAIN = $selectedRust
$rustRuntime = Join-Path $env:RUSTUP_HOME "toolchains\$selectedRust\lib\rustlib\$($buildTools.rustTarget)\lib\self-contained"
if (-not (Test-Path -LiteralPath (Join-Path $rustRuntime 'libgcc_eh.a'))) { throw 'Rust GNU runtime libraries are missing. Reinstall the pinned Rust toolchain.' }
# w64devkit has no separate libgcc_eh; use the runtime shipped with this Rust version.
$env:LIBRARY_PATH = $rustRuntime
$env:PATH = "$npmShim;$(Join-Path $env:CARGO_HOME 'bin');$compilerBin;$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $compilerBin 'gcc.exe'
$env:CC = Join-Path $compilerBin 'gcc.exe'
$env:CXX = Join-Path $compilerBin 'g++.exe'
$env:RC = Join-Path $compilerBin 'windres.exe'
$env:CARGO_BUILD_JOBS = '4'
Write-Host "Build environment: Node $actualNode / npm $npmVersion / Rust $($buildTools.rust) / GCC $gccVersion"
