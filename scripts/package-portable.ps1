$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$releaseRoot = Join-Path $projectRoot "release\$version"
$fileNames = @('Qingye.exe', 'WebView2Loader.dll', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt', '使用说明.txt')
$files = @($fileNames | ForEach-Object { Join-Path $releaseRoot $_ })
foreach ($file in $files) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release file: $file" } }
$archive = Join-Path $releaseRoot "Qingye-$version-x64-Portable.zip"
Compress-Archive -LiteralPath $files -DestinationPath $archive -CompressionLevel Optimal -Force
$hashFiles = @('Qingye.exe', "Qingye-$version-x64-Setup.exe", 'WebView2Loader.dll', "Qingye-$version-x64-Portable.zip")
$hashLines = @($hashFiles | ForEach-Object { $hash = Get-FileHash -LiteralPath (Join-Path $releaseRoot $_) -Algorithm SHA256; "$($hash.Hash.ToLowerInvariant())  $_" })
Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Value $hashLines -Encoding ASCII
Get-Item -LiteralPath $archive | Select-Object Name,Length
