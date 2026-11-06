$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
$env:CARGO_HOME = Join-Path $projectRoot '.tools\cargo'
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');D:\msys64\ucrt64\bin;$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'D:\msys64\ucrt64\bin\gcc.exe'
$env:CC = 'D:\msys64\ucrt64\bin\gcc.exe'
$env:CXX = 'D:\msys64\ucrt64\bin\g++.exe'
Set-Location -LiteralPath $projectRoot
npm.cmd run tauri -- dev --target x86_64-pc-windows-gnu
