param(
  [switch]$Check
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localRuntimeDir = Join-Path $projectRoot 'backend\data\runtime-data'
$backendCommand = @"
`$env:MARKET_SHARED_STORE_REQUIRED='0'; `$env:MARKET_RUNTIME_DATA_DIR='$localRuntimeDir'; Set-Location '$projectRoot'; npm.cmd run dev:backend
"@.Trim()
$frontendCommand = "Set-Location '$projectRoot'; npm.cmd run dev"

if ($Check) {
  Write-Host "ProjectRoot=$projectRoot"
  Write-Host "LocalRuntimeDir=$localRuntimeDir"
  Write-Host "BackendCommand=$backendCommand"
  Write-Host "FrontendCommand=$frontendCommand"
  exit 0
}

Start-Process powershell -WorkingDirectory $projectRoot -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  $backendCommand
)

Start-Sleep -Seconds 2

Start-Process powershell -WorkingDirectory $projectRoot -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  $frontendCommand
)

Start-Sleep -Seconds 2

Start-Process 'http://localhost:5173'
