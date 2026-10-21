# Start PostgreSQL container and production Node.js server in Background
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Valet Performance Suite - Start Daemon" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start PostgreSQL docker container if not running
$pgContainer = docker ps --filter "name=valet-postgres" --format "{{.Names}}"
if (-not $pgContainer) {
    docker compose up -d postgres
    Start-Sleep -Seconds 2
}
Write-Host "[OK] PostgreSQL is running on port 5432." -ForegroundColor Green

# 2. Kill existing node server if any
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*src/web/server.js*" -or $_.CommandLine -like "*src\web\server.js*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
}

# 3. Start background node process
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "node.exe"
$startInfo.Arguments = "src/web/server.js"
$startInfo.WorkingDirectory = "$PSScriptRoot\webv1"
$startInfo.EnvironmentVariables["NODE_ENV"] = "production"
$startInfo.EnvironmentVariables["PORT"] = "3000"
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true

[System.Diagnostics.Process]::Start($startInfo) | Out-Null
Start-Sleep -Seconds 2

Write-Host "[OK] Webview running in background at http://localhost:3000" -ForegroundColor Green
Write-Host "To stop, run: .\stop-production.ps1" -ForegroundColor Yellow
