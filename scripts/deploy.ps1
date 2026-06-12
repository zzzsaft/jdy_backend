param(
  # You can either edit these default values, or pass them as command parameters.
  # Example:
  # powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -NasHost "192.168.1.10" -NasUser "admin" -RemoteAppDir "/volume1/docker/jdy_backend" -ContainerName "jdy_backend"
  [string]$NasHost = "hz.jc-times.com",
  [int]$SshPort = 24,
  [string]$NasUser = "zzzsaft",
  [string]$RemoteAppDir = "/volume1/docker/backend",
  [string]$ContainerName = "backend_alpine-1",
  [string]$BuildCommand = "npm run build",
  [string]$RemoteDockerCommand = "",
  [switch]$SkipBuild,
  [switch]$Preflight,
  [bool]$LegacyScp = $true,
  [bool]$UseSudoForDocker = $true,
  [switch]$NoSshMultiplex
)

$ErrorActionPreference = "Stop"

function Require-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Edit scripts/deploy.ps1 or pass -$Name when running deploy."
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. Install/enable it first and try again."
  }
}

Require-Value "NasHost" $NasHost
Require-Value "NasUser" $NasUser
Require-Value "RemoteAppDir" $RemoteAppDir
Require-Value "ContainerName" $ContainerName
Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $ProjectRoot "build"
$DistDir = Join-Path $ProjectRoot ".dist"
$ArchivePath = Join-Path $DistDir "build.tar.gz"
$RemoteScriptLocalPath = Join-Path $DistDir "remote-deploy.sh"
$Target = "${NasUser}@${NasHost}"
$RemoteArchive = "$RemoteAppDir/build.tar.gz"
$RemoteScriptPath = "$RemoteAppDir/.deploy-remote.sh"

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

$SshBaseArgs = @()
$ScpBaseArgs = @()
$SshPortArgs = @("-p", "$SshPort")
$ScpPortArgs = @("-P", "$SshPort")
$SshMultiplexStarted = $false
$SafeControlName = "${NasUser}_${NasHost}_${SshPort}" -replace '[^a-zA-Z0-9_.-]', '_'
$SshControlPath = Join-Path $DistDir "ssh-$SafeControlName.sock"
$RunningOnWindows = $PSVersionTable.PSVersion.Major -le 5 -or (
  Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue
) -and $IsWindows

trap {
  if ($SshMultiplexStarted) {
    & ssh @SshBaseArgs -O exit $Target 2>$null | Out-Null
  }
  throw
}

if ($RunningOnWindows -and -not $NoSshMultiplex) {
  Write-Host "Skipping SSH connection reuse on Windows OpenSSH."
}

if (-not $NoSshMultiplex -and -not $RunningOnWindows) {
  Write-Host "Opening reusable SSH connection..."
  $SshBaseArgs = @(
    "-p", "$SshPort",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=$SshControlPath",
    "-o", "ControlPersist=10m"
  )
  $ScpBaseArgs = @(
    "-P", "$SshPort",
    "-o", "ControlMaster=auto",
    "-o", "ControlPath=$SshControlPath",
    "-o", "ControlPersist=10m"
  )

  & ssh @SshBaseArgs -MNf $Target
  if ($LASTEXITCODE -eq 0) {
    $SshMultiplexStarted = $true
  } else {
    Write-Warning "Could not open reusable SSH connection. Continuing without SSH multiplexing."
    $SshBaseArgs = $SshPortArgs
    $ScpBaseArgs = $ScpPortArgs
  }
} else {
  $SshBaseArgs = $SshPortArgs
  $ScpBaseArgs = $ScpPortArgs
}

if ($Preflight) {
  Write-Host "Checking remote prerequisites..."
  $preflightScript = @"
APP_DIR="$RemoteAppDir"
CONTAINER="$ContainerName"
DOCKER_CMD="$RemoteDockerCommand"
USE_SUDO="$($UseSudoForDocker.ToString().ToLowerInvariant())"
FAILED=0

find_docker() {
  if [ -n "`$DOCKER_CMD" ]; then
    if [ -x "`$DOCKER_CMD" ] || command -v "`$DOCKER_CMD" >/dev/null 2>&1; then
      echo "`$DOCKER_CMD"
      return 0
    fi
    return 1
  fi

  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return 0
  fi

  if [ -x /usr/local/bin/docker ]; then
    echo /usr/local/bin/docker
    return 0
  fi

  return 1
}

check() {
  LABEL="`$1"
  shift
  if "`$@"; then
    echo "[OK] `$LABEL"
  else
    CODE="`$?"
    echo "[FAIL] `$LABEL" >&2
    FAILED=1
    return "`$CODE"
  fi
}

check "tar is available" command -v tar >/dev/null
check "remote app directory exists: `$APP_DIR" test -d "`$APP_DIR"
check "remote app directory is writable: `$APP_DIR" test -w "`$APP_DIR"

DOCKER_BIN="`$(find_docker)" || {
  echo "[FAIL] docker is available" >&2
  FAILED=1
}

if [ -n "`$DOCKER_BIN" ]; then
  echo "[OK] docker is available: `$DOCKER_BIN"
  if [ "`$USE_SUDO" = "true" ]; then
    check "sudo is available" command -v sudo >/dev/null
    check "Docker container exists and is accessible: `$CONTAINER" sudo "`$DOCKER_BIN" inspect "`$CONTAINER" >/dev/null 2>&1
  else
    check "Docker container exists and is accessible: `$CONTAINER" "`$DOCKER_BIN" inspect "`$CONTAINER" >/dev/null 2>&1
  fi
fi

if [ "`$FAILED" -ne 0 ]; then
  echo "Remote preflight failed. Fix the failed item(s), then rerun deploy." >&2
  exit 1
fi

echo "Remote preflight ok."
"@

  $preflightScript | & ssh @SshBaseArgs $Target "sh -s"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote preflight failed. See [FAIL] line(s) above."
  }
}

if (-not $SkipBuild) {
  Write-Host "Building project..."
  Invoke-Expression $BuildCommand
}

if (-not (Test-Path -LiteralPath $BuildDir)) {
  throw "Build directory not found: $BuildDir"
}

if (Test-Path -LiteralPath $ArchivePath) {
  Remove-Item -LiteralPath $ArchivePath -Force
}

Write-Host "Compressing build..."
& tar -czf $ArchivePath build
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create archive: $ArchivePath"
}

Write-Host "Uploading archive to $Target..."
$scpArgs = @()
if ($LegacyScp) {
  $scpArgs += "-O"
}
$scpArgs += $ScpBaseArgs
$scpArgs += $ArchivePath
$scpArgs += "${Target}:$RemoteArchive"
& scp @scpArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload archive to $Target. If the remote login works but upload fails, try: npm run deploy -- -LegacyScp"
}

$remoteScript = @"
set -eu

APP_DIR="$RemoteAppDir"
ARCHIVE="$RemoteArchive"
CONTAINER="$ContainerName"
DOCKER_CMD="$RemoteDockerCommand"
USE_SUDO="$($UseSudoForDocker.ToString().ToLowerInvariant())"
STAMP=`$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".deploy-backup"
BACKUP_PATH=""

find_docker() {
  if [ -n "`$DOCKER_CMD" ]; then
    if [ -x "`$DOCKER_CMD" ] || command -v "`$DOCKER_CMD" >/dev/null 2>&1; then
      echo "`$DOCKER_CMD"
      return 0
    fi
    return 1
  fi

  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return 0
  fi

  if [ -x /usr/local/bin/docker ]; then
    echo /usr/local/bin/docker
    return 0
  fi

  return 1
}

cd "`$APP_DIR"
mkdir -p "`$BACKUP_DIR"

if [ -d build ]; then
  BACKUP_PATH="`$BACKUP_DIR/build-`$STAMP"
  mv build "`$BACKUP_PATH"
fi

restore_backup() {
  if [ -n "`$BACKUP_PATH" ] && [ -d "`$BACKUP_PATH" ]; then
    rm -rf build
    mv "`$BACKUP_PATH" build
  fi
}

if ! tar -xzf "`$ARCHIVE" -C "`$APP_DIR"; then
  restore_backup
  echo "Deploy failed while extracting archive. Previous build was restored." >&2
  exit 1
fi

DOCKER_BIN="`$(find_docker)" || {
  restore_backup
  echo "Deploy failed because docker command was not found. Try passing -RemoteDockerCommand /usr/local/bin/docker if that path exists on Synology." >&2
  exit 1
}

if [ "`$USE_SUDO" = "true" ]; then
  if ! command -v sudo >/dev/null 2>&1; then
    restore_backup
    echo "Deploy failed because sudo command was not found." >&2
    exit 1
  fi

  if ! sudo "`$DOCKER_BIN" restart "`$CONTAINER"; then
    restore_backup
    echo "Deploy failed while restarting Docker container with sudo. Previous build was restored." >&2
    exit 1
  fi
elif ! "`$DOCKER_BIN" restart "`$CONTAINER"; then
  restore_backup
  echo "Deploy failed while restarting Docker container. Previous build was restored." >&2
  exit 1
fi

rm -f "`$ARCHIVE"
rm -f "$RemoteScriptPath"
echo "Deploy finished. Container restarted: `$CONTAINER"
"@

Set-Content -LiteralPath $RemoteScriptLocalPath -Value $remoteScript -Encoding ascii

Write-Host "Uploading remote deploy script..."
$scriptScpArgs = @()
if ($LegacyScp) {
  $scriptScpArgs += "-O"
}
$scriptScpArgs += $ScpBaseArgs
$scriptScpArgs += $RemoteScriptLocalPath
$scriptScpArgs += "${Target}:$RemoteScriptPath"
& scp @scriptScpArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload remote deploy script to $Target."
}

Write-Host "Replacing build and restarting container..."
$sshArgs = @()
if ($UseSudoForDocker) {
  $sshArgs += "-tt"
}
$sshArgs += $SshBaseArgs
$sshArgs += $Target
$sshArgs += "sh '$RemoteScriptPath'"
& ssh @sshArgs
if ($LASTEXITCODE -ne 0) {
  throw "Remote deploy failed."
}

if ($SshMultiplexStarted) {
  & ssh @SshBaseArgs -O exit $Target 2>$null | Out-Null
  $SshMultiplexStarted = $false
}

Write-Host "Done."
