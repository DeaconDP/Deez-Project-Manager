# Rebuild release EXE when source is newer, then launch it.
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$exe = Join-Path $repoRoot "src-tauri\target\release\deez-project-manager.exe"

function Get-NewestWriteTime {
  param(
    [string[]]$Paths
  )
  $newest = [datetime]::MinValue
  foreach ($p in $Paths) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $item = Get-Item -LiteralPath $p
    if ($item.PSIsContainer) {
      $files = Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue
      foreach ($f in $files) {
        if ($f.LastWriteTimeUtc -gt $newest) {
          $newest = $f.LastWriteTimeUtc
        }
      }
    } else {
      if ($item.LastWriteTimeUtc -gt $newest) {
        $newest = $item.LastWriteTimeUtc
      }
    }
  }
  return $newest
}

$watchPaths = @(
  (Join-Path $repoRoot "src"),
  (Join-Path $repoRoot "src-tauri\src"),
  (Join-Path $repoRoot "src-tauri\icons"),
  (Join-Path $repoRoot "src-tauri\capabilities"),
  (Join-Path $repoRoot "src-tauri\tauri.conf.json"),
  (Join-Path $repoRoot "src-tauri\Cargo.toml"),
  (Join-Path $repoRoot "src-tauri\Cargo.lock"),
  (Join-Path $repoRoot "package.json"),
  (Join-Path $repoRoot "package-lock.json"),
  (Join-Path $repoRoot "index.html"),
  (Join-Path $repoRoot "vite.config.ts"),
  (Join-Path $repoRoot "tsconfig.json"),
  (Join-Path $repoRoot "tsconfig.node.json")
)

$exeExists = Test-Path -LiteralPath $exe
$stale = -not $exeExists
if ($exeExists) {
  $exeTime = (Get-Item -LiteralPath $exe).LastWriteTimeUtc
  $sourceTime = Get-NewestWriteTime -Paths $watchPaths
  if ($sourceTime -gt $exeTime) {
    $stale = $true
  }
}

if ($stale) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is required to rebuild. Install from https://nodejs.org"
    exit 1
  }
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Rust/Cargo is required to rebuild. Install from https://rustup.rs"
    exit 1
  }
  if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
      Write-Host "npm install failed."
      exit 1
    }
  }
  if ($exeExists) {
    Write-Host "Source newer than release EXE - rebuilding..."
  } else {
    Write-Host "Release EXE missing - building..."
  }
  npm run tauri build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "tauri build failed."
    exit 1
  }
  if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "Build finished but EXE not found:"
    Write-Host "  $exe"
    exit 1
  }
} else {
  Write-Host "Release EXE is up to date."
}

Write-Host "Launching Deez Project Manager..."
Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
exit 0
