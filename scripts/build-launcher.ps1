param(
    [string]$AppExe = (Join-Path $PSScriptRoot '..\windows\DotaScope-app.exe'),
    [string]$OutFile = (Join-Path $PSScriptRoot '..\DotaScope-1.0.0-win-x64.exe')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appExe = (Resolve-Path $AppExe).Path
$launcherSource = Join-Path $root 'windows\Launcher.cs'
$icon = Join-Path $root 'windows\icon.ico'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $appExe)) { throw "Bundled app not found: $appExe" }
if (-not (Test-Path $csc)) { throw "C# compiler not found: $csc" }

$compilerArgs = @(
    '-nologo',
    '-target:winexe',
    '-platform:x64',
    '-optimize+',
    "-win32icon:$icon",
    '-r:System.Windows.Forms.dll',
    "-resource:$appExe,DotaScope.App",
    "-out:$OutFile",
    $launcherSource
)

& $csc $compilerArgs
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

$result = Get-Item $OutFile
Write-Output ("Built {0} ({1:N0} bytes)" -f $result.FullName, $result.Length)
