param([string]$ToolsRoot = 'E:\DevTools')
$ErrorActionPreference = 'Stop'
$ToolsRoot = [IO.Path]::GetFullPath($ToolsRoot)
$env:RUSTUP_HOME = Join-Path $ToolsRoot 'rustup'
$env:CARGO_HOME = Join-Path $ToolsRoot 'cargo'
$downloads = Join-Path $ToolsRoot 'downloads'
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
$installer = Join-Path $downloads 'rustup-init.exe'
$url = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $installer -TimeoutSec 180
$hashResponse = Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256" -TimeoutSec 60
$hashText = if ($hashResponse.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($hashResponse.Content) } else { [string]$hashResponse.Content }
$expected = ($hashText.Trim() -split '\s+')[0]
if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Rustup installer checksum mismatch.' }
& $installer -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-gnu --default-toolchain stable
if ($LASTEXITCODE -ne 0) { throw 'Shared Rust installation failed.' }
& (Join-Path $env:CARGO_HOME 'bin\rustup.exe') update stable-x86_64-pc-windows-gnu --no-self-update
if ($LASTEXITCODE -ne 0) { throw 'Rust stable update failed.' }
foreach ($variable in @('RUSTUP_HOME', 'CARGO_HOME')) {
    [Environment]::SetEnvironmentVariable($variable, [Environment]::GetEnvironmentVariable($variable, 'Process'), 'User')
}
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$cargoBin = Join-Path $env:CARGO_HOME 'bin'
$parts = @($userPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ine $cargoBin.TrimEnd('\') })
[Environment]::SetEnvironmentVariable('Path', (@($cargoBin) + $parts -join ';'), 'User')
$env:PATH = "$cargoBin;$env:PATH"
& (Join-Path $env:CARGO_HOME 'bin\rustc.exe') +stable-x86_64-pc-windows-gnu --version
if ($LASTEXITCODE -ne 0) { throw 'Rust verification failed.' }
Write-Host "Shared Rust installed: $ToolsRoot. New terminals use these user environment variables."
