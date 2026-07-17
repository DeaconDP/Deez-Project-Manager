@echo off
cd /d "%~dp0"

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
