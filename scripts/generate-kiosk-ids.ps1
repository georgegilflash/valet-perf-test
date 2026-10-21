<#
.SYNOPSIS
    Generates kiosk-ids.json (in root and webv1/data/kiosk-ids.json) from "KDN Kiosks - Sheet1.csv".
.PARAMETER Count
    Number of unique Kiosk IDs to export. If omitted (or 0), exports all unique Kiosk IDs.
.PARAMETER CsvFile
    Path to the source CSV file. Defaults to "KDN Kiosks - Sheet1.csv" in the project root.
.EXAMPLE
    .\scripts\generate-kiosk-ids.ps1
    .\scripts\generate-kiosk-ids.ps1 -Count 100
#>

param (
    [int]$Count = 0,
    [string]$CsvFile = ""
)

$jsScript = Join-Path $PSScriptRoot "generate-kiosk-ids.js"

$nodeArgs = @($jsScript)
if ($Count -gt 0) {
    $nodeArgs += "$Count"
}
if ($CsvFile) {
    $nodeArgs += $CsvFile
}

& node @nodeArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
