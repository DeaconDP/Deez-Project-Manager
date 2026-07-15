@echo off
cd /d "%~dp0"

where node >nul 2>&1 || (
  echo Node.js is required. Install from https://nodejs.org
  pause
  exit /b 1
)

where cargo >nul 2>&1 || (
  echo Rust/Cargo is required for Tauri. Install from https://rustup.rs
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing npm dependencies...
  call npm install || (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Deez Project Manager desktop app...
echo Vite (internal): http://127.0.0.1:5187
echo Do NOT open that URL in a browser — use the Deez Project Manager window that opens.
call npm run tauri dev
if errorlevel 1 (
  echo.
  echo Deez Project Manager failed to start.
  pause
  exit /b 1
)
pause
