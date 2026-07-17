# Launch the release EXE. Rebuild first when it is missing, when watched source
# is newer than the EXE, or when --rebuild is passed.
param(
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$exe = Join-Path $repoRoot "src-tauri\target\release\deez-project-manager.exe"
$logPath = Join-Path $env:TEMP "deez-project-manager-launch.log"

function Write-LaunchLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$stamp] $Message"
}

function Initialize-ExplorerPath {
  $pathParts = @(
    [Environment]::GetEnvironmentVariable("Path", "Machine"),
    [Environment]::GetEnvironmentVariable("Path", "User"),
    $env:Path
  )
  $deduped = ($pathParts -join ";").Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
    Select-Object -Unique
  $env:Path = [string]::Join(";", $deduped)
}

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

function Get-ReleaseProcesses {
  $wanted = [System.IO.Path]::GetFullPath($exe)
  Get-CimInstance Win32_Process -Filter "Name = 'deez-project-manager.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $wanted)
    }
}

function Require-Command {
  param(
    [string]$Name,
    [string]$Message
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host $Message
    Write-LaunchLog "missing dependency: $Name"
    exit 1
  }
}

function Build-ReleaseExe {
  Initialize-ExplorerPath
  Require-Command "node" "Node.js is required to rebuild. Install from https://nodejs.org"
  Require-Command "cargo" "Rust/Cargo is required to rebuild. Install from https://rustup.rs"

  if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    Write-Host "Installing npm dependencies..."
    Write-LaunchLog "npm install started"
    npm install
    if ($LASTEXITCODE -ne 0) {
      Write-Host "npm install failed."
      Write-LaunchLog "npm install failed with exit code $LASTEXITCODE"
      exit 1
    }
  }

  Write-Host "Building Deez Project Manager release EXE..."
  Write-LaunchLog "tauri build started"
  npm run tauri build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "tauri build failed."
    Write-LaunchLog "tauri build failed with exit code $LASTEXITCODE"
    return $false
  }

  if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "Build finished but EXE not found:"
    Write-Host "  $exe"
    Write-LaunchLog "build finished but exe missing: $exe"
    return $false
  }

  Write-LaunchLog "tauri build succeeded"
  return $true
}

function Start-ReleaseExe {
  $existing = @(Get-ReleaseProcesses)
  if ($existing.Count -gt 0) {
    Write-Host "Deez Project Manager is already running from the release EXE."
    Write-LaunchLog "already running: pid(s) $($existing.ProcessId -join ', ')"
    return $true
  }

  Write-Host "Launching Deez Project Manager..."
  Write-LaunchLog "start process: $exe"
  Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)

  $deadline = (Get-Date).AddSeconds(5)
  do {
    Start-Sleep -Milliseconds 250
    $started = @(Get-ReleaseProcesses)
    if ($started.Count -gt 0) {
      Write-LaunchLog "launch verified: pid(s) $($started.ProcessId -join ', ')"
      return $true
    }
  } while ((Get-Date) -lt $deadline)

  Write-Host "Release EXE was started, but no matching process stayed running."
  Write-Host "Launch log: $logPath"
  Write-LaunchLog "launch verification failed"
  return $false
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
$sourceIsNewer = $false
if ($exeExists) {
  $exeTime = (Get-Item -LiteralPath $exe).LastWriteTimeUtc
  $sourceTime = Get-NewestWriteTime -Paths $watchPaths
  if ($sourceTime -gt $exeTime) {
    $sourceIsNewer = $true
  }
}

Write-LaunchLog "launcher start: rebuild=$Rebuild exeExists=$exeExists sourceIsNewer=$sourceIsNewer"

if ($exeExists -and -not $Rebuild -and -not $sourceIsNewer) {
  if (Start-ReleaseExe) {
    exit 0
  }
  exit 1
}

$running = @(Get-ReleaseProcesses)
foreach ($p in $running) {
  Write-Host "Stopping running release EXE (PID $($p.ProcessId)) before rebuild..."
  Write-LaunchLog "stopping release pid $($p.ProcessId) before rebuild"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

if (-not $exeExists) {
  Write-Host "Release EXE missing - building..."
} elseif ($Rebuild) {
  Write-Host "Refresh requested - rebuilding release EXE..."
} else {
  Write-Host "Source newer than release EXE - rebuilding before launch..."
  Write-LaunchLog "source newer; rebuild-first path"
}

$built = Build-ReleaseExe
if (-not $built) {
  if (Test-Path -LiteralPath $exe) {
    Write-Host "Rebuild failed; launching the existing release EXE instead."
    Write-LaunchLog "rebuild failed; fallback launch"
    Start-ReleaseExe | Out-Null
    exit 1
  }
  Write-Host "No release EXE is available to launch."
  Write-Host "Launch log: $logPath"
  exit 1
}

if (Start-ReleaseExe) {
  exit 0
}
exit 1
