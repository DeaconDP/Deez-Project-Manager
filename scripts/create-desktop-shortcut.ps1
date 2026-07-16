# Creates a Desktop shortcut to the smart release launcher.
# The launcher rebuilds the release EXE when source is newer, then starts it.
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $repoRoot "launch-release.bat"
$icon = Join-Path $repoRoot "src-tauri\icons\icon.ico"

if (-not (Test-Path $launcher)) {
  Write-Host "Launcher not found:"
  Write-Host "  $launcher"
  exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Deez Project Manager.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Deez Project Manager (rebuilds release if source is newer)"
if (Test-Path $icon) {
  $shortcut.IconLocation = "$icon,0"
}
$shortcut.Save()

Write-Host "Desktop shortcut created:"
Write-Host "  $lnkPath"
Write-Host "Target:"
Write-Host "  $launcher"
Write-Host "App EXE (after launch/rebuild):"
Write-Host "  $(Join-Path $repoRoot 'src-tauri\target\release\deez-project-manager.exe')"
