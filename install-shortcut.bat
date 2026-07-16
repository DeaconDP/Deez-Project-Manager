@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo Failed to create desktop shortcut.
  pause
  exit /b 1
)
echo.
pause
