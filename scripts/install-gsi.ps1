param(
    [string]$SteamPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configName = "gamestate_integration_dotascope.cfg"
$source = Join-Path (Split-Path -Parent $PSScriptRoot) "public\integrations\$configName"
if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing integration config: $source"
}

if ([string]::IsNullOrWhiteSpace($SteamPath)) {
    $SteamPath = (Get-ItemProperty -Path "HKCU:\Software\Valve\Steam" -Name SteamPath).SteamPath
}
$SteamPath = $SteamPath -replace "/", "\"

$candidates = New-Object System.Collections.Generic.List[string]
$candidates.Add((Join-Path $SteamPath "steamapps\common\dota 2 beta"))

$libraryFile = Join-Path $SteamPath "steamapps\libraryfolders.vdf"
if (Test-Path -LiteralPath $libraryFile) {
    $text = Get-Content -LiteralPath $libraryFile -Raw
    foreach ($match in [regex]::Matches($text, '"path"\s*"([^"]+)"')) {
        $library = $match.Groups[1].Value -replace "\\\\", "\"
        $candidates.Add((Join-Path $library "steamapps\common\dota 2 beta"))
    }
}

$dotaRoot = $null
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate "game\dota")) {
        $dotaRoot = $candidate
        break
    }
}
if ($null -eq $dotaRoot) {
    throw "Could not find the Dota 2 install. Pass -SteamPath if Steam is installed elsewhere."
}

$destinationDir = Join-Path $dotaRoot "game\dota\cfg\gamestate_integration"
New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
$destination = Join-Path $destinationDir $configName

if (Test-Path -LiteralPath $destination) {
    $backup = "$destination.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item -LiteralPath $destination -Destination $backup
    Write-Host "Backed up previous config to $backup"
}

Copy-Item -LiteralPath $source -Destination $destination -Force
Write-Host "Installed DotaScope GSI config:"
Write-Host "  $destination"
Write-Host ""
Write-Host "Dota 2 must be launched with -gamestateintegration."
Write-Host "The local DotaScope host listens on http://127.0.0.1:53000/gsi."
Write-Host "Restart Dota 2 after installing or changing this file."
