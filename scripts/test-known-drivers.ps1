<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner for Kiosk GetKnownDrivers (/device/kiosk.asmx)
#>
param (
    [string]$BaseUrl = "https://intserver.qa3.flashparking.dev",
    [string]$KioskID = "",
    [string]$FromDate = "2026-08-27T00:00:00",
    [int]$Start = 1,
    [int]$Count = 2,
    [switch]$RandomFromPool,
    [string]$FromDateMin = "2026-10-24T00:00:00",
    [string]$FromDateMax = "2026-10-25T00:00:00",
    [int]$CountMin = 1,
    [int]$CountMax = 2,
    [int]$TimeoutSec = 30
)

$RootDir = Split-Path -Parent $PSScriptRoot
$KioskJsonPath = Join-Path $RootDir "kiosk-ids.json"

# 1. Resolve Kiosk ID from kiosk-ids.json pool ONLY if -RandomFromPool is set or $KioskID is empty
if ($RandomFromPool -or -not $KioskID) {
    if (Test-Path $KioskJsonPath) {
        try {
            $kioskPool = Get-Content $KioskJsonPath -Raw | ConvertFrom-Json
            if ($kioskPool.Count -gt 0) {
                $KioskID = $kioskPool | Get-Random
            }
        } catch {}
    }
    if (-not $KioskID) {
        $KioskID = "4b51d86b-e14b-4da5-b7c0-c1a20ca3f660"
    }
}

# 2. Resolve Random FromDate within range [FromDateMin, FromDateMax] if -RandomFromPool is set or $FromDate is empty
if ($RandomFromPool -or -not $FromDate) {
    $minDt = [DateTime]::Parse($FromDateMin, [System.Globalization.CultureInfo]::InvariantCulture)
    $maxDt = [DateTime]::Parse($FromDateMax, [System.Globalization.CultureInfo]::InvariantCulture)
    if ($minDt -gt $maxDt) { $tmp = $minDt; $minDt = $maxDt; $maxDt = $tmp }
    $rangeSeconds = [long]($maxDt - $minDt).TotalSeconds
    $randomSec = Get-Random -Minimum 0 -Maximum ($rangeSeconds + 1)
    $FromDate = $minDt.AddSeconds($randomSec).ToString("yyyy-MM-ddTHH:mm:ss")
}

# 3. Resolve Random Count within range [CountMin, CountMax] if -RandomFromPool is set or $Count <= 0
if ($RandomFromPool -or $Count -le 0) {
    $lo = [Math]::Min($CountMin, $CountMax)
    $hi = [Math]::Max($CountMin, $CountMax)
    $Count = Get-Random -Minimum $lo -Maximum ($hi + 1)
}

function Format-XmlPretty([string]$xmlText) {
    if ([string]::IsNullOrWhiteSpace($xmlText)) { return "(empty)" }
    try {
        $xmlDoc = New-Object System.Xml.XmlDocument
        $xmlDoc.LoadXml($xmlText)
        $sw = New-Object System.IO.StringWriter
        $writer = New-Object System.Xml.XmlTextWriter($sw)
        $writer.Formatting = [System.Xml.Formatting]::Indented
        $writer.Indentation = 2
        $xmlDoc.WriteContentTo($writer)
        $writer.Flush()
        return $sw.ToString()
    } catch {
        return $xmlText
    }
}

$ServicePath = "/device/kiosk.asmx"
$MethodName = "GetKnownDrivers"

# Build target endpoint
$FullUrl = "$($BaseUrl.TrimEnd('/'))/$($ServicePath.TrimStart('/'))"

# Build SOAP 1.2 Envelope matching exact expected tags (soap:Envelope + web:GetKnownDrivers)
$SoapEnvelope = @"
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://kleverlogic.com/webservices/">
   <soap:Header/>
   <soap:Body>
      <web:GetKnownDrivers>
         <web:kioskID>$KioskID</web:kioskID>
         <web:from>$FromDate</web:from>
         <web:start>$Start</web:start>
         <web:count>$Count</web:count>
      </web:GetKnownDrivers>
   </soap:Body>
</soap:Envelope>
"@

# Allow all SSL/TLS certificates and enable TLS 1.2 / TLS 1.3
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " SOAP 1.2 Web Service Test - GetKnownDrivers" -ForegroundColor Cyan
Write-Host " Endpoint:     $FullUrl" -ForegroundColor Cyan
Write-Host " Method:       $MethodName" -ForegroundColor Cyan
Write-Host " Kiosk ID:     $KioskID" -ForegroundColor Cyan
Write-Host " FromDate:     $FromDate" -ForegroundColor Cyan
Write-Host " Start:        $Start" -ForegroundColor Cyan
Write-Host " Count:        $Count" -ForegroundColor Cyan
Write-Host " Content-Type: application/soap+xml; charset=utf-8" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

Write-Host "`n[REQUEST ENVELOPE]" -ForegroundColor Yellow
Write-Host $SoapEnvelope -ForegroundColor Gray

Write-Host "`nSending request..." -ForegroundColor Yellow

try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    $response = Invoke-WebRequest -Uri $FullUrl `
        -Method Post `
        -ContentType "application/soap+xml; charset=utf-8" `
        -Body $SoapEnvelope `
        -UseBasicParsing `
        -TimeoutSec $TimeoutSec

    $stopwatch.Stop()

    Write-Host "`n================================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] HTTP $($response.StatusCode) $($response.StatusDescription) (in $($stopwatch.ElapsedMilliseconds) ms)" -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green

    # Validate Returned Count <= Requested Count and DateModifiedUtc > FromDate
    $rawXml = $response.Content
    $driverMatches = [regex]::Matches($rawXml, "<KnownDriver>([\s\S]*?)</KnownDriver>")
    $dateMatches = [regex]::Matches($rawXml, "<DateModifiedUtc>([^<]+)</DateModifiedUtc>")
    $returnedCount = $driverMatches.Count
    $isCountValid = $returnedCount -le $Count

    $sentFromDt = [DateTime]::Parse($FromDate, [System.Globalization.CultureInfo]::InvariantCulture)
    $allDatesGreater = $true
    foreach ($m in $dateMatches) {
        $dStr = $m.Groups[1].Value.Trim()
        $dVal = [DateTime]::Parse($dStr, [System.Globalization.CultureInfo]::InvariantCulture)
        if ($dVal -le $sentFromDt) {
            $allDatesGreater = $false
        }
    }

    Write-Host "`n[VALIDATION CHECKS]" -ForegroundColor Yellow
    Write-Host "  Records Returned <= Requested Count ($returnedCount <= $Count): $(if ($isCountValid) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($isCountValid) { 'Green' } else { 'Red' })
    Write-Host "  All DateModifiedUtc > FromDate ($FromDate): $(if ($allDatesGreater) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($allDatesGreater) { 'Green' } else { 'Red' })

    Write-Host "`n[RESPONSE BODY (FORMATTED XML)]" -ForegroundColor Cyan
    Write-Host (Format-XmlPretty $rawXml) -ForegroundColor White
}
catch {
    Write-Host "`n================================================================================" -ForegroundColor Red
    Write-Host " [FAILED] Request failed on $FullUrl" -ForegroundColor Red
    Write-Host "================================================================================" -ForegroundColor Red

    if ($_.Exception.Response) {
        $resp = $_.Exception.Response
        Write-Host "HTTP Status: $([int]$resp.StatusCode)" -ForegroundColor Red
        try {
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
            Write-Host "`nError Response Body (Formatted XML):" -ForegroundColor Yellow
            Write-Host (Format-XmlPretty $errBody)
        } catch {}
    } else {
        Write-Host "Error Details: $($_.Exception.Message)" -ForegroundColor Red
    }
}
