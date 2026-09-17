# Update repo, rebuild release EXE when needed, then launch it.
# Rebuild when EXE is missing, source is newer, or -Rebuild is passed.
param(
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$exe = Join-Path $repoRoot "src-tauri\target\release\deez-project-manager.exe"
$logPath = Join-Path $env:TEMP "deez-project-manager-launch.log"
$buildLogPath = Join-Path $env:TEMP "deez-project-manager-tauri-build.log"

function Write-LaunchLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$stamp] $Message"
}

function Update-Repo {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    return
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-LaunchLog "git not found; skip pull"
    return
  }
  Write-Host "Updating to latest..."
  Write-LaunchLog "git pull --ff-only started"
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "git pull skipped (local changes or no fast-forward). Continuing with local tree."
    Write-LaunchLog "git pull failed with exit code $LASTEXITCODE; continuing"
  } else {
    Write-LaunchLog "git pull succeeded"
  }
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

function Import-VsDevCmdEnvironment {
  param([string]$VsDevCmd)

  if (-not (Test-Path -LiteralPath $VsDevCmd)) {
    return $false
  }

  Write-LaunchLog "loading MSVC env from $VsDevCmd"
  $output = & cmd.exe /c "`"$VsDevCmd`" -arch=amd64 -host_arch=amd64 >nul && set"
  if ($LASTEXITCODE -ne 0 -or -not $output) {
    Write-LaunchLog "VsDevCmd failed with exit code $LASTEXITCODE"
    return $false
  }

  foreach ($line in $output) {
    if ($line -match '^([^=]+)=(.*)$') {
      Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
    }
  }
  return $true
}

function Initialize-MsvcEnv {
  if (Get-Command link.exe -ErrorAction SilentlyContinue) {
    Write-LaunchLog "link.exe already on PATH: $((Get-Command link.exe).Source)"
    return $true
  }

  $candidates = @()

  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path -LiteralPath $vswhere) {
    $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if (-not $installPath) {
      $installPath = & $vswhere -products Microsoft.VisualStudio.Product.BuildTools -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    }
    foreach ($p in @($installPath)) {
      if ($p) {
        $candidates += (Join-Path $p "Common7\Tools\VsDevCmd.bat")
      }
    }
  }

  $candidates += @(
    "C:\BuildTools\Common7\Tools\VsDevCmd.bat",
    (Join-Path ${env:ProgramFiles} "Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"),
    (Join-Path ${env:ProgramFiles} "Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat")
  )

  foreach ($bat in ($candidates | Select-Object -Unique)) {
    if (Import-VsDevCmdEnvironment -VsDevCmd $bat) {
      if (Get-Command link.exe -ErrorAction SilentlyContinue) {
        Write-LaunchLog "link.exe after VsDevCmd: $((Get-Command link.exe).Source)"
        return $true
      }
    }
  }

  return $false
}

function Assert-MsvcReady {
  Initialize-ExplorerPath
  if (Initialize-MsvcEnv) {
    return
  }

  $msg = @"
MSVC linker (link.exe) was not found.

Install or repair one of:
  - Visual Studio 2022: workload "Desktop development with C++"
  - Build Tools 2022: workload "MSVC v143" + Windows SDK

Then re-run: run.bat --rebuild

Launch log: $logPath
"@
  Write-Host $msg
  Write-LaunchLog "MSVC preflight failed: link.exe not found"
  Write-Host ""
  Write-Host "Press Enter to close..."
  [void][System.Console]::ReadLine()
  exit 1
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

function Install-NpmDependencies {
  Initialize-ExplorerPath
  Require-Command "node" "Node.js is required. Install from https://nodejs.org"
  Write-Host "Installing npm dependencies..."
  Write-LaunchLog "npm install started"
  # Native tools write Info/warn lines to stderr; don't treat as terminating errors.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  npm install
  $npmExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($npmExit -ne 0) {
    Write-Host "npm install failed."
    Write-LaunchLog "npm install failed with exit code $npmExit"
    exit 1
  }
  Write-LaunchLog "npm install succeeded"
}

function Build-ReleaseExe {
  Assert-MsvcReady
  Require-Command "node" "Node.js is required to rebuild. Install from https://nodejs.org"
  Require-Command "cargo" "Rust/Cargo is required to rebuild. Install from https://rustup.rs"

  Write-Host "Building Deez Project Manager release EXE..."
  Write-Host "Build log: $buildLogPath"
  Write-LaunchLog "tauri build started"
  if (Test-Path -LiteralPath $buildLogPath) {
    Remove-Item -LiteralPath $buildLogPath -Force -ErrorAction SilentlyContinue
  }

  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $buildLogPath -Value "[$stamp] npm run tauri build"

  # Capture stdout+stderr without letting PS Stop on native stderr chatter.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & npm run tauri build *>&1 |
    ForEach-Object {
      $line = "$_"
      Write-Host $line
      Add-Content -LiteralPath $buildLogPath -Value $line
    }
  $buildExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($buildExit -ne 0) {
    Write-Host "tauri build failed (exit $buildExit)."
    Write-LaunchLog "tauri build failed with exit code $buildExit (details: $buildLogPath)"
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

function Show-RebuildFailure {
  param(
    [string]$Detail
  )
  Write-Host ""
  Write-Host "========================================"
  Write-Host " Deez Project Manager update FAILED"
  Write-Host "========================================"
  Write-Host $Detail
  Write-Host ""
  Write-Host "Launch log: $logPath"
  Write-Host "Build log:  $buildLogPath"
  Write-Host ""
  Write-Host "Press Enter to continue..."
  [void][System.Console]::ReadLine()
}

function Start-ReleaseExe {
  $existing = @(Get-ReleaseProcesses)
  if ($existing.Count -gt 0) {
    Write-Host "Deez Project Manager is already running from the release EXE."
    Write-LaunchLog "already running: pid(s) $($existing.ProcessId -join ', ')"
    return $true
  }

  # Prevent launch_gate handoff loop after rebuild / launcher start.
  $env:DEEZ_PM_FROM_LAUNCHER = "1"

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

Write-LaunchLog "launcher start: rebuild=$Rebuild"

Update-Repo
Install-NpmDependencies

$exeExists = Test-Path -LiteralPath $exe
$sourceIsNewer = $false
if ($exeExists) {
  $exeTime = (Get-Item -LiteralPath $exe).LastWriteTimeUtc
  $sourceTime = Get-NewestWriteTime -Paths $watchPaths
  if ($sourceTime -gt $exeTime) {
    $sourceIsNewer = $true
  }
}
Write-LaunchLog "after update: exeExists=$exeExists sourceIsNewer=$sourceIsNewer"

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
if ($running.Count -gt 0) {
  # Give Windows time to release the EXE lock before link.exe runs.
  Start-Sleep -Seconds 2
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
    Write-LaunchLog "rebuild failed; fallback launch after pause"
    Show-RebuildFailure -Detail "Rebuild failed. Launching the existing (possibly outdated) release EXE instead."
    Start-ReleaseExe | Out-Null
    exit 1
  }
  Show-RebuildFailure -Detail "Rebuild failed and no release EXE is available to launch."
  exit 1
}

if (Start-ReleaseExe) {
  exit 0
}
exit 1
