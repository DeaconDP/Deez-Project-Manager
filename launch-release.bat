@echo off
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-release.ps1"
if errorlevel 1 (
  echo.
  echo Deez Project Manager failed to launch.
  pause
  exit /b 1
)
