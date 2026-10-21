# Stop production Node.js server and PostgreSQL container
$ErrorActionPreference = "Continue"

Write-Host "Stopping Valet Performance Suite..." -ForegroundColor Cyan

# Stop node servers
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*src/web/server.js*" -or $_.CommandLine -like "*src\web\server.js*" } | ForEach-Object {
    Write-Host "Stopping Node.js process $($_.ProcessId)..." -ForegroundColor Yellow
    Stop-Process -Id $_.ProcessId -Force
}

# Stop postgres container
Write-Host "Stopping PostgreSQL container..." -ForegroundColor Yellow
docker compose down

Write-Host "[✓] All production services stopped." -ForegroundColor Green
