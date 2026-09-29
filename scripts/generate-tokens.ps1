<#
.SYNOPSIS
    Generates tokens.json from login-token-QA1.txt with deduplication and count limiting.
.PARAMETER Count
    Number of unique tokens to export. If omitted, exports all unique tokens.
.EXAMPLE
    .\scripts\generate-tokens.ps1 -Count 100
    .\scripts\generate-tokens.ps1
#>

param (
    [int]$Count = 0
)

$sourceFile = Join-Path $PSScriptRoot "..\login-token-QA1.txt"
$destFile = Join-Path $PSScriptRoot "..\tokens.json"

if (-not (Test-Path $sourceFile)) {
    Write-Error "Source file not found: $sourceFile"
    exit 1
}

Write-Host "=== Valet Token Generator (PowerShell) ===" -ForegroundColor Cyan
Write-Host "Reading source file: login-token-QA1.txt"

$rawTokens = Get-Content $sourceFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
$uniqueTokens = $rawTokens | Select-Object -Unique

Write-Host "Total raw lines:    $($rawTokens.Count)"
Write-Host "Total unique:       $($uniqueTokens.Count)"

if ($Count -gt 0) {
    if ($Count -gt $uniqueTokens.Count) {
        Write-Warning "Requested $Count tokens, but only $($uniqueTokens.Count) unique tokens exist."
        $selectedTokens = $uniqueTokens
    } else {
        $selectedTokens = $uniqueTokens | Select-Object -First $Count
        Write-Host "Filtered to count:  $($selectedTokens.Count)" -ForegroundColor Green
    }
} else {
    $selectedTokens = $uniqueTokens
    Write-Host "Exporting all unique tokens: $($selectedTokens.Count)"
}

$json = $selectedTokens | ConvertTo-Json
Set-Content -Path $destFile -Value $json -Encoding UTF8

Write-Host "Successfully generated: tokens.json with $($selectedTokens.Count) tokens" -ForegroundColor Green
