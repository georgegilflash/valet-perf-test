<#
.SYNOPSIS
    Runs the k6 performance test with environment variables loaded from .env
.DESCRIPTION
    Loads key=value pairs from the .env file (if present) and passes them to k6 run.
.EXAMPLE
    .\scripts\run.ps1
    .\scripts\run.ps1 -Script "main.js" -EnvFile ".env"
#>

param (
    [string]$Script = "main.js",
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

Write-Host "=== k6 Performance Test Runner ===" -ForegroundColor Cyan

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

# Create reports directory if it doesn't exist
if (-not (Test-Path "reports")) {
    New-Item -ItemType Directory -Path "reports" | Out-Null
}

# Collect environment variable arguments
$envArgs = @()

# If .env file exists, read it line by line
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
        # Skip empty lines and comments
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
    Write-Host "Warning: $EnvFile not found. Using default configurations from config/env.js." -ForegroundColor Yellow
    Write-Host "To customize, copy .env.example to .env:  cp .env.example .env" -ForegroundColor Yellow
}

# Execute k6
$fullArgs = @("run") + $envArgs + @($Script)
if ($AdditionalArgs) {
    $fullArgs += $AdditionalArgs.Split(" ")
}

Write-Host "Starting k6 run: k6 $($fullArgs -join ' ')" -ForegroundColor Cyan
& k6 $fullArgs
