<#
.SYNOPSIS
    Generates kiosk-ids.json from a Kiosks CSV file in the project root with deduplication and count limiting.
.PARAMETER Count
    Number of unique Kiosk IDs to export. If omitted, exports all unique Kiosk IDs.
.PARAMETER CsvFile
    Path to the source CSV file. Defaults to "KDN Kiosks - Sheet1.csv" in the project root.
.EXAMPLE
    .\scripts\generate-kiosk-ids.ps1 -Count 100
    .\scripts\generate-kiosk-ids.ps1
#>

param (
    [int]$Count = 0,
    [string]$CsvFile = ""
)

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
if ($CsvFile) {
    $sourceFile = if ([System.IO.Path]::IsPathRooted($CsvFile)) { $CsvFile } else { Join-Path $rootDir $CsvFile }
} else {
    $sourceFile = Join-Path $rootDir "KDN Kiosks - Sheet1.csv"
    if (-not (Test-Path $sourceFile)) {
        $firstCsv = Get-ChildItem -Path $rootDir -Filter "*.csv" | Select-Object -First 1
        if ($firstCsv) {
            $sourceFile = $firstCsv.FullName
        }
    }
}

$destFile = Join-Path $rootDir "kiosk-ids.json"

if (-not (Test-Path $sourceFile)) {
    Write-Error "Source CSV file not found: $sourceFile"
    exit 1
}

Write-Host "=== Kiosk IDs Pool Generator (PowerShell) ===" -ForegroundColor Cyan
Write-Host "Reading source CSV: $(Split-Path $sourceFile -Leaf)"

$guidRegex = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

$rawIds = Get-Content $sourceFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -ne "") {
        $firstCol = ($line -split ',')[0].Trim('"', "'", ' ')
        if ($firstCol -match $guidRegex) {
            $firstCol
        }
    }
}

$uniqueIds = @($rawIds | Select-Object -Unique)

Write-Host "Total valid rows:   $($rawIds.Count)"
Write-Host "Total unique IDs:   $($uniqueIds.Count)"

if ($Count -gt 0) {
    if ($Count -gt $uniqueIds.Count) {
        Write-Warning "Requested $Count Kiosk IDs, but only $($uniqueIds.Count) unique IDs exist."
        $selectedIds = $uniqueIds
    } else {
        $selectedIds = @($uniqueIds | Select-Object -First $Count)
        Write-Host "Filtered to count:  $($selectedIds.Count)" -ForegroundColor Green
    }
} else {
    $selectedIds = $uniqueIds
    Write-Host "Exporting all unique Kiosk IDs: $($selectedIds.Count)"
}

$json = ConvertTo-Json -InputObject $selectedIds
Set-Content -Path $destFile -Value $json -Encoding UTF8

Write-Host "Successfully generated: kiosk-ids.json with $($selectedIds.Count) Kiosk IDs" -ForegroundColor Green
