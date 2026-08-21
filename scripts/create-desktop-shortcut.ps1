# Creates Desktop + Start Menu shortcuts to run.bat (update → build if needed → launch).
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $repoRoot "run.bat"
$icon = Join-Path $repoRoot "src-tauri\icons\icon.ico"

if (-not (Test-Path $launcher)) {
  Write-Host "Launcher not found:"
  Write-Host "  $launcher"
  exit 1
}

function New-LauncherShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LnkPath
  )
  $dir = Split-Path -Parent $LnkPath
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($LnkPath)
  $shortcut.TargetPath = $launcher
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.Description = "Deez Project Manager (update, rebuild when needed, launch)"
  if (Test-Path $icon) {
    $shortcut.IconLocation = "$icon,0"
  }
  $shortcut.Save()
  Write-Host $LnkPath
}

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
$desktopLnk = Join-Path $desktop "Deez Project Manager.lnk"
$startLnk = Join-Path $startMenu "Deez Project Manager.lnk"

Write-Host "Shortcuts created:"
New-LauncherShortcut -LnkPath $desktopLnk
New-LauncherShortcut -LnkPath $startLnk
Write-Host "Target:"
Write-Host "  $launcher"
Write-Host "Pin the Desktop or Start Menu shortcut (not the release EXE under src-tauri\target)."
Write-Host "App EXE (after rebuild/launch):"
Write-Host "  $(Join-Path $repoRoot 'src-tauri\target\release\deez-project-manager.exe')"
