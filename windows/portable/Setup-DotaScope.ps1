param(
  [switch]$SkipSteamOptions,
  [switch]$NoElevate,
  [switch]$SkipSteamProcessCheck
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$gsiSource = Join-Path $root 'runtime\gsi\gamestate_integration_dotascope.cfg'

function Write-Step([string]$text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor DarkYellow
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Path $gsiSource)) {
  Write-Host "Could not find the bundled GSI config at:" -ForegroundColor Red
  Write-Host "  $gsiSource"
  exit 1
}

if (-not (Test-IsAdmin) -and -not $NoElevate) {
  Write-Host "Windows needs permission to write the Dota 2 GSI config and Steam launch option."
  Write-Host "Accept the UAC prompt to continue."
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($SkipSteamOptions) { $arguments += '-SkipSteamOptions' }
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
  exit 0
}

function Find-SteamPath {
  if ($env:DOTASCOPE_STEAM_PATH -and (Test-Path $env:DOTASCOPE_STEAM_PATH)) {
    return (Resolve-Path $env:DOTASCOPE_STEAM_PATH).Path
  }
  $keys = @(
    'HKCU:\Software\Valve\Steam',
    'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam',
    'HKLM:\SOFTWARE\Valve\Steam'
  )
  foreach ($key in $keys) {
    try {
      $value = (Get-ItemProperty -Path $key -Name SteamPath -ErrorAction Stop).SteamPath
      if ($value -and (Test-Path $value)) { return (Resolve-Path $value).Path }
    } catch { }
  }
  foreach ($candidate in @('C:\Program Files (x86)\Steam', 'C:\Program Files\Steam')) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Find-DotaCfg {
  if ($env:DOTASCOPE_DOTA_CFG -and (Test-Path $env:DOTASCOPE_DOTA_CFG)) {
    return (Resolve-Path $env:DOTASCOPE_DOTA_CFG).Path
  }

  $libraries = New-Object System.Collections.Generic.List[string]
  $steam = Find-SteamPath
  if ($steam) {
    $libraries.Add($steam)
    $libraryFile = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $libraryFile) {
      try {
        $text = [IO.File]::ReadAllText($libraryFile)
        foreach ($match in [regex]::Matches($text, '"path"\s+"([^"]+)"')) {
          $path = $match.Groups[1].Value -replace '\\\\', '\'
          if (Test-Path $path) { $libraries.Add($path) }
        }
      } catch { }
    }
  }

  foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    $candidate = Join-Path $drive.Root 'SteamLibrary'
    if (Test-Path $candidate) { $libraries.Add($candidate) }
    $candidate = Join-Path $drive.Root 'Steam'
    if (Test-Path $candidate) { $libraries.Add($candidate) }
  }

  foreach ($library in ($libraries | Select-Object -Unique)) {
    $cfg = Join-Path $library 'steamapps\common\dota 2 beta\game\dota\cfg'
    if (Test-Path $cfg) { return (Resolve-Path $cfg).Path }
  }
  return $null
}

function Install-GsiConfig([string]$dotaCfg) {
  $targetDir = Join-Path $dotaCfg 'gamestate_integration'
  $target = Join-Path $targetDir 'gamestate_integration_dotascope.cfg'
  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }
  $sourceText = [IO.File]::ReadAllText($gsiSource)
  if (-not (Test-Path $target) -or [IO.File]::ReadAllText($target) -ne $sourceText) {
    Copy-Item -LiteralPath $gsiSource -Destination $target -Force
    Write-Host "Installed GSI config: $target" -ForegroundColor Green
  } else {
    Write-Host "GSI config already installed: $target" -ForegroundColor Green
  }
}

function Set-DotaLaunchOption([string]$configPath) {
  $text = [IO.File]::ReadAllText($configPath)
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.AddRange([string[]]($text -split "`r?`n"))
  $changed = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -notmatch '^\s*"570"\s*$') { continue }
    $open = -1
    for ($j = $i + 1; $j -lt $lines.Count; $j++) {
      if ($lines[$j] -match '^\s*\{') { $open = $j; break }
      if ($lines[$j].Trim().Length -gt 0) { break }
    }
    if ($open -lt 0) { continue }

    $depth = 0
    $close = -1
    for ($j = $open; $j -lt $lines.Count; $j++) {
      $depth += ([regex]::Matches($lines[$j], '\{')).Count
      $depth -= ([regex]::Matches($lines[$j], '\}')).Count
      if ($depth -eq 0) { $close = $j; break }
    }
    if ($close -lt 0) { continue }

    $block = ($lines[$open..$close] -join "`n")
    if ($block -notmatch '"Playtime"|"LastPlayed"|"LaunchOptions"') { continue }

    $launchLine = -1
    for ($j = $open + 1; $j -lt $close; $j++) {
      if ($lines[$j] -match '^\s*"LaunchOptions"\s+".*"\s*$') { $launchLine = $j; break }
    }

    if ($launchLine -ge 0) {
      if ($lines[$launchLine] -notmatch 'gamestateintegration') {
        $lines[$launchLine] = $lines[$launchLine] -replace '("LaunchOptions"\s+")([^"]*)(")', '${1}${2} -gamestateintegration${3}'
        $changed = $true
        Write-Host "Added -gamestateintegration to $configPath" -ForegroundColor Green
      } else {
        Write-Host "Dota 2 launch option already present in $configPath" -ForegroundColor Green
      }
    } else {
      $indent = ($lines[$close] -replace '^(\s*).*', '$1') + "`t"
      $lines.Insert($close, $indent + '"LaunchOptions"		"-gamestateintegration"')
      $changed = $true
      Write-Host "Set Dota 2 launch option in $configPath" -ForegroundColor Green
    }
    break
  }

  if ($changed) {
    $backup = "$configPath.dotascope-backup"
    if (-not (Test-Path $backup)) { Copy-Item -LiteralPath $configPath -Destination $backup }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($configPath, ($lines -join "`r`n"), $utf8)
    Write-Host "Steam config backed up to $backup" -ForegroundColor DarkGray
    return $true
  }
  return $false
}

Write-Host "DotaScope portable setup" -ForegroundColor Cyan
Write-Host "======================="
Write-Host "This installs the Game State Integration config and asks Steam to launch Dota 2 with GSI enabled."

$dotaCfg = Find-DotaCfg
if (-not $dotaCfg) {
  Write-Host "Could not find Dota 2 automatically." -ForegroundColor Yellow
  Write-Host "If Dota 2 is installed, set DOTASCOPE_DOTA_CFG to its game\\dota\\cfg folder and run Setup again."
  Read-Host "Press Enter to close"
  exit 1
}
Write-Host "Dota 2 cfg: $dotaCfg"

try {
  Install-GsiConfig $dotaCfg
} catch {
  Write-Host "Could not install the GSI config: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Run Setup.cmd as administrator or install Dota 2 in a writable library."
  Read-Host "Press Enter to close"
  exit 1
}

if (-not $SkipSteamOptions) {
  $steam = Find-SteamPath
  if (-not $steam) {
    Write-Host "Steam was not found; GSI config is installed, but the Dota 2 launch option was not changed." -ForegroundColor Yellow
  } else {
    $steamProcess = Get-Process -Name steam -ErrorAction SilentlyContinue
    if ($steamProcess -and -not $SkipSteamProcessCheck) {
      Write-Step "Steam is running"
      Write-Host "Please close Steam completely before the launch option can be changed."
      Read-Host "Press Enter after Steam has closed"
      $steamProcess = Get-Process -Name steam -ErrorAction SilentlyContinue
    }
    if ($steamProcess -and -not $SkipSteamProcessCheck) {
      Write-Host "Steam is still running; skipping the launch-option change." -ForegroundColor Yellow
      Write-Host "Close Steam, then run Setup.cmd again."
    } else {
      $userdata = Join-Path $steam 'userdata'
      $found = $false
      if (Test-Path $userdata) {
        foreach ($file in (Get-ChildItem -Path $userdata -Filter localconfig.vdf -Recurse -ErrorAction SilentlyContinue)) {
          try {
            if (Set-DotaLaunchOption $file.FullName) { $found = $true }
          } catch {
            Write-Host "Could not update $($file.FullName): $($_.Exception.Message)" -ForegroundColor Yellow
          }
        }
      }
      if (-not $found) {
        Write-Host "No Steam app block was changed. Open Dota 2 once, close Steam, and run Setup again." -ForegroundColor Yellow
      }
    }
  }
}

Write-Host ""
Write-Host "Setup complete. Start DotaScope-1.0.0-win-x64.exe." -ForegroundColor Cyan
Write-Host "Start Dota 2 from Steam normally (the launch option is now saved)."
Write-Host ""
Read-Host "Press Enter to close"
