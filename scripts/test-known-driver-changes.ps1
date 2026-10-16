<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner for Kiosk GetKnownDriverChanges (/device/kiosk.asmx)
#>
param (
    [string]$BaseUrl = "https://intserver.qa3.flashparking.dev",
    [string]$KioskID = "4b51d86b-e14b-4da5-b7c0-c1a20ca3f660",
    [int]$Year = 0,
    [int]$Month = 0,
    [int]$Day = 0,
    [string]$DateMin = "2026-10-25",
    [string]$DateMax = "2026-10-25",
    [long]$Total = 0,
    [int]$TotalMin = 1,
    [int]$TotalMax = 2,
    [long]$Burnt = 2,
    [string]$ClientXml = "",
    [switch]$RandomFromPool,
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

# 2. Resolve Random Date (Year, Month, Day) within range [DateMin, DateMax] if not explicitly passed
if ($Year -le 0 -or $Month -le 0 -or $Day -le 0) {
    $minDt = [DateTime]::Parse($DateMin, [System.Globalization.CultureInfo]::InvariantCulture)
    $maxDt = [DateTime]::Parse($DateMax, [System.Globalization.CultureInfo]::InvariantCulture)
    if ($minDt -gt $maxDt) { $tmp = $minDt; $minDt = $maxDt; $maxDt = $tmp }
    $rangeDays = [int]($maxDt - $minDt).TotalDays
    $randomDays = Get-Random -Minimum 0 -Maximum ($rangeDays + 1)
    $pickedDate = $minDt.AddDays($randomDays)
    if ($Year -le 0) { $Year = $pickedDate.Year }
    if ($Month -le 0) { $Month = $pickedDate.Month }
    if ($Day -le 0) { $Day = $pickedDate.Day }
}

# 3. Resolve Random Total within range [TotalMin, TotalMax] if not explicitly passed
if ($Total -le 0) {
    $lo = [Math]::Min($TotalMin, $TotalMax)
    $hi = [Math]::Max($TotalMin, $TotalMax)
    $Total = Get-Random -Minimum $lo -Maximum ($hi + 1)
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
$Namespace = "http://kleverlogic.com/webservices/"
$MethodName = "GetKnownDriverChanges"

if (-not $ClientXml) {
    $ClientXml = @"
      <client>
        <DatabaseChange>
          <Year xmlns="urn:KleverLogic.FlashParcs.Web">$Year</Year>
          <Month xmlns="urn:KleverLogic.FlashParcs.Web">$Month</Month>
          <Day xmlns="urn:KleverLogic.FlashParcs.Web">$Day</Day>
          <Total xmlns="urn:KleverLogic.FlashParcs.Web">$Total</Total>
          <Burnt xmlns="urn:KleverLogic.FlashParcs.Web">$Burnt</Burnt>
        </DatabaseChange>
      </client>
"@
}

$MethodBody = @"
    <$MethodName xmlns="$Namespace">
      <kioskID>$KioskID</kioskID>
$ClientXml
    </$MethodName>
"@

# Build target endpoint
$FullUrl = "$($BaseUrl.TrimEnd('/'))/$($ServicePath.TrimStart('/'))"

# Build SOAP 1.2 Envelope
$SoapEnvelope = @"
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
$MethodBody
  </soap12:Body>
</soap12:Envelope>
"@

# Allow all SSL/TLS certificates and enable TLS 1.2 / TLS 1.3
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " SOAP 1.2 Web Service Test - GetKnownDriverChanges" -ForegroundColor Cyan
Write-Host " Endpoint:     $FullUrl" -ForegroundColor Cyan
Write-Host " Method:       $MethodName" -ForegroundColor Cyan
Write-Host " Kiosk ID:     $KioskID" -ForegroundColor Cyan
Write-Host " Date (Y-M-D): $Year-$Month-$Day (Range: $DateMin -> $DateMax)" -ForegroundColor Cyan
Write-Host " Total:        $Total (Range: $TotalMin -> $TotalMax, Burnt: $Burnt)" -ForegroundColor Cyan
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

    $rawXml = $response.Content
    $isDateSame = $true
    $isTotalValid = $true
    $returnedTotal = 0

    $yearMatch = [regex]::Match($rawXml, "<Year[^>]*>(\d+)</Year>")
    $monthMatch = [regex]::Match($rawXml, "<Month[^>]*>(\d+)</Month>")
    $dayMatch = [regex]::Match($rawXml, "<Day[^>]*>(\d+)</Day>")
    $totalMatch = [regex]::Match($rawXml, "<Total[^>]*>(\d+)</Total>")

    if ($yearMatch.Success -and $monthMatch.Success -and $dayMatch.Success) {
        if ([int]$yearMatch.Groups[1].Value -ne $Year -or [int]$monthMatch.Groups[1].Value -ne $Month -or [int]$dayMatch.Groups[1].Value -ne $Day) {
            $isDateSame = $false
        }
    }
    if ($totalMatch.Success) {
        $returnedTotal = [int]$totalMatch.Groups[1].Value
        $isTotalValid = $returnedTotal -le $Total
    }

    Write-Host "`n[VALIDATION CHECKS]" -ForegroundColor Yellow
    Write-Host "  Response Date matches Sent Date ($Year-$Month-$Day): $(if ($isDateSame) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($isDateSame) { 'Green' } else { 'Red' })
    Write-Host "  Response Total <= Requested Total ($returnedTotal <= $Total): $(if ($isTotalValid) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($isTotalValid) { 'Green' } else { 'Red' })

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
