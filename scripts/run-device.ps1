<#
.SYNOPSIS
    Runs the Device Services performance test suite (Kiosk, KnownDrivers, KnownDriverChanges, PMS, Sign, Payments)
.DESCRIPTION
    Loads key=value pairs from the .env file, ensures per-endpoint report directories exist, and executes k6.
.EXAMPLE
    .\scripts\run-device.ps1
    .\scripts\run-device.ps1 -Script "main-known-drivers.js"
    .\scripts\run-device.ps1 -AdditionalArgs "-e DEBUG_RESPONSE=true"
#>

param (
    [string]$Script = "main-device.js",
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   k6 Device Services Suite Runner (Kiosk / PMS / Sign)     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check if k6 is installed
$k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
if (-not $k6Cmd) {
    Write-Error "k6 is not found in PATH. Please install k6 first."
    Write-Host "Install options on Windows:" -ForegroundColor Yellow
    Write-Host "  winget install k6 --source winget" -ForegroundColor Yellow
    Write-Host "  choco install k6" -ForegroundColor Yellow
    Write-Host "  scoop install k6" -ForegroundColor Yellow
    exit 1
}

# Create reports root directory and per-endpoint report subdirectories
$endpointDirs = @(
    "reports",
    "reports/known-drivers",
    "reports/known-driver-changes",
    "reports/kiosk",
    "reports/valet",
    "reports/pms",
    "reports/sign",
    "reports/payments",
    "reports/polling",
    "reports/device"
)

# Also derive endpoint folder name from $Script (e.g. main-known-drivers.js -> known-drivers)
$scriptBase = [System.IO.Path]::GetFileNameWithoutExtension($Script)
if ($scriptBase -match "^main-(.+)$") {
    $derivedSuite = $Matches[1].ToLower()
    $endpointDirs += "reports/$derivedSuite"
}

foreach ($dir in $endpointDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force -ErrorAction SilentlyContinue | Out-Null
    }
}

# Generate run timestamp (YYYY-MM-DD_HH-mm-ss) so each report has a unique filename with date & time
$runTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# Collect environment variable arguments
$envArgs = @(
    "-e", "RUN_TIMESTAMP=$runTimestamp"
)

if (Test-Path $EnvFile) {
    Write-Host "Loading environment from $EnvFile..." -ForegroundColor Green
    $lines = @()
    try {
        $lines = Get-Content $EnvFile -ErrorAction Stop
    } catch {
        $lines = cmd.exe /c "type `"$EnvFile`""
    }
    $lines | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                $envArgs += "-e"
                $envArgs += "$key=$val"
            }
        }
    }
} else {
    Write-Host "Warning: $EnvFile not found. Using defaults from config/env.js." -ForegroundColor Yellow
}

# Execute k6
$fullArgs = @("run") + $envArgs + @($Script)
if ($AdditionalArgs) {
    $fullArgs += $AdditionalArgs.Split(" ")
}

Write-Host "Executing: k6 $($fullArgs -join ' ')" -ForegroundColor Cyan
& k6 $fullArgs
