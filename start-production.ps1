# Start PostgreSQL container and production Node.js server
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Valet Performance Suite - Production Runner" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start PostgreSQL docker container if not running
Write-Host "[1/2] Checking PostgreSQL container..." -ForegroundColor Yellow
$pgContainer = docker ps --filter "name=valet-postgres" --format "{{.Names}}"
if (-not $pgContainer) {
    Write-Host "Starting valet-postgres via docker compose..." -ForegroundColor DarkYellow
    docker compose up -d postgres
    Start-Sleep -Seconds 2
}
Write-Host "[OK] PostgreSQL is running on port 5432." -ForegroundColor Green

# 2. Check k6 and node
Write-Host "[2/2] Verifying native tools..." -ForegroundColor Yellow
$nodeVer = node -v
$k6Ver = k6 version
Write-Host "[OK] Node.js version: $nodeVer" -ForegroundColor Green
Write-Host "[OK] k6 version:      $k6Ver" -ForegroundColor Green

# 3. Start web server in production mode
$env:NODE_ENV = "production"
$env:PORT = "3000"

Write-Host ""
Write-Host "Starting Webview at http://localhost:3000..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$webDir = Join-Path -Path $scriptDir -ChildPath "webv1"
Set-Location -Path $webDir
node src/web/server.js
