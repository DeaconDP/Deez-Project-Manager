@echo off
cd /d "%~dp0"

if /I "%~1"=="--shortcut" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"
  if errorlevel 1 (
    echo.
    echo Failed to create desktop shortcut.
    pause
    exit /b 1
  )
  echo.
  pause
  exit /b 0
)

set "LAUNCH_ARGS="
if /I "%~1"=="--rebuild" set "LAUNCH_ARGS=-Rebuild"
if /I "%~1"=="-Rebuild" set "LAUNCH_ARGS=-Rebuild"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-release.ps1" %LAUNCH_ARGS%
if errorlevel 1 (
  echo.
  echo Deez Project Manager failed to launch.
  pause
  exit /b 1
)
