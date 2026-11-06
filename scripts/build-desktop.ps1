param([switch]$DebugBuild, [switch]$NoBundle, [switch]$LocalTransport, [switch]$UpdateLock)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
$env:CARGO_HOME = Join-Path $projectRoot '.tools\cargo'
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');D:\msys64\ucrt64\bin;$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'D:\msys64\ucrt64\bin\gcc.exe'
$env:CC = 'D:\msys64\ucrt64\bin\gcc.exe'
$env:CXX = 'D:\msys64\ucrt64\bin\g++.exe'
$env:CARGO_BUILD_JOBS = '4'
$env:CARGO_HTTP_MULTIPLEXING = 'false'
$env:CARGO_HTTP_TIMEOUT = '60'
$env:CARGO_HTTP_LOW_SPEED_LIMIT = '1'
$env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'
Set-Location -LiteralPath $projectRoot
$previousConfig = $null
$transportProcess = $null
$transportConfig = Join-Path $env:CARGO_HOME 'config.toml'
if ($LocalTransport) {
    function Test-Transport {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:19420/health' -UseBasicParsing -TimeoutSec 2
            $content = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
            return $content.Trim() -eq 'qingye-cargo-transport'
        }
        catch { return $false }
    }
    if (-not (Test-Transport)) {
        $transportScript = Join-Path $PSScriptRoot 'registry-mirror.mjs'
        $transportProcess = Start-Process -FilePath 'node.exe' -ArgumentList @("`"$transportScript`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.tools\transport.out.log') -RedirectStandardError (Join-Path $projectRoot '.tools\transport.err.log')
        for ($attempt = 0; $attempt -lt 10 -and -not (Test-Transport); $attempt++) { Start-Sleep -Milliseconds 250 }
        if (-not (Test-Transport)) {
            if ($null -ne $transportProcess -and -not $transportProcess.HasExited) { Stop-Process -Id $transportProcess.Id }
            throw 'Local dependency transport could not start.'
        }
    }
    if (Test-Path -LiteralPath $transportConfig) { $previousConfig = Get-Content -LiteralPath $transportConfig -Raw }
    @'
[source.crates-io]
replace-with = "qingye-local"
[source.qingye-local]
registry = "sparse+http://127.0.0.1:19420/"
'@ | Set-Content -LiteralPath $transportConfig -Encoding ASCII
}
$buildArgs = @('run', 'tauri', '--', 'build', '--target', 'x86_64-pc-windows-gnu')
if ($DebugBuild) { $buildArgs += '--debug' }
if ($NoBundle) { $buildArgs += '--no-bundle' }
try {
    $fetchArgs = @('fetch', '--manifest-path', 'src-tauri/Cargo.toml', '--target', 'x86_64-pc-windows-gnu')
    if (-not $UpdateLock) { $fetchArgs += '--locked' }
    & cargo.exe @fetchArgs
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch locked desktop dependencies.' }
    & node.exe scripts/prepare-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare WebView2 loader.' }
    & node.exe scripts/write-notices.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare license notices.' }
    & npm.cmd @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
} finally {
    if ($LocalTransport) {
        if ($null -ne $previousConfig) { Set-Content -LiteralPath $transportConfig -Value $previousConfig -Encoding ASCII }
        else { Remove-Item -LiteralPath $transportConfig }
        if ($null -ne $transportProcess -and -not $transportProcess.HasExited) { Stop-Process -Id $transportProcess.Id }
    }
}
