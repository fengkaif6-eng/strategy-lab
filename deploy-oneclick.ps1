param(
  [Parameter(Mandatory = $true)]
  [string]$Host,

  [string]$User = "ubuntu",

  [string]$ServerName = "",

  [string]$AllowedOrigin = "",

  [string]$RemoteBase = "/home/ubuntu"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ServerName)) {
  $ServerName = $Host
}
if ([string]::IsNullOrWhiteSpace($AllowedOrigin)) {
  $AllowedOrigin = "http://$ServerName"
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectName = Split-Path -Leaf $projectRoot
if ($projectName -ne "strategy-lab") {
  throw "Please place this script in strategy-lab project root."
}

function Assert-CommandExists {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name. Install it first."
  }
}

Assert-CommandExists -Name "tar"
Assert-CommandExists -Name "scp"
Assert-CommandExists -Name "ssh"

$archivePath = Join-Path $env:TEMP "strategy-lab-deploy.tar.gz"
$remoteArchive = "$RemoteBase/strategy-lab-deploy.tar.gz"
$remoteScript = "$RemoteBase/deploy_server.sh"
$sourceScript = Join-Path $projectRoot "scripts\deploy_server.sh"

if (-not (Test-Path $sourceScript)) {
  throw "Missing script: $sourceScript"
}

Write-Host "[1/5] Packing project..."
Push-Location (Split-Path -Parent $projectRoot)
try {
  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force
  }
  tar `
    --exclude='strategy-lab/node_modules' `
    --exclude='strategy-lab/dist' `
    --exclude='strategy-lab/.git' `
    -czf $archivePath `
    strategy-lab
}
finally {
  Pop-Location
}

Write-Host "[2/5] Upload archive..."
scp $archivePath "$User@$Host`:$remoteArchive"

Write-Host "[3/5] Upload deploy script..."
scp $sourceScript "$User@$Host`:$remoteScript"

Write-Host "[4/5] Run remote deploy..."
$remoteCmd = @"
chmod +x '$remoteScript' && \
bash '$remoteScript' \
  --archive '$remoteArchive' \
  --project-dir '$RemoteBase/strategy-lab' \
  --server-name '$ServerName' \
  --allowed-origin '$AllowedOrigin' \
  --service-name 'strategy-lab-backend'
"@
ssh "$User@$Host" $remoteCmd

Write-Host "[5/5] Done."
Write-Host "Open: http://$ServerName"
Write-Host "Health: http://$ServerName/api/health"
