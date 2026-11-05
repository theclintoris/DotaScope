$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Packaging web assets...'
if (Test-Path 'windows\web.zip') {
    Remove-Item 'windows\web.zip' -Force
}
Compress-Archive -Path 'dist\*' -DestinationPath 'windows\web.zip' -CompressionLevel Optimal

Write-Host 'Restoring .NET packages...'
dotnet restore windows\DotaScope.csproj --configfile windows\NuGet.config --source https://api.nuget.org/v3/index.json
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed with exit code $LASTEXITCODE" }

Write-Host 'Publishing self-contained Windows executable...'
dotnet publish windows\DotaScope.csproj -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$publishDir = 'windows\bin\Release\net8.0-windows\win-x64\publish'
$appExe = 'windows\DotaScope-app.exe'
$target = "DotaScope-$version-win-x64.exe"
Copy-Item (Join-Path $publishDir 'DotaScope.exe') $appExe -Force

Write-Host 'Wrapping app in portable launcher...'
& (Join-Path $PSScriptRoot 'build-launcher.ps1') -AppExe (Join-Path $root $appExe) -OutFile (Join-Path $root $target)
if ($LASTEXITCODE -ne 0) { throw "launcher build failed with exit code $LASTEXITCODE" }

Write-Host "Built $target"
