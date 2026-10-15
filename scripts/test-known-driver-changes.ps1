<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner for Kiosk GetKnownDriverChanges (/device/kiosk.asmx)
#>
param (
    [string]$BaseUrl = "https://intserver.qa3.flashparking.dev",
    [string]$KioskID = "4b51d86b-e14b-4da5-b7c0-c1a20ca3f660",
    [int]$Year = (Get-Date).Year,
    [int]$Month = (Get-Date).Month,
    [int]$Day = (Get-Date).Day,
    [long]$Total = 0,
    [long]$Burnt = 0,
    [string]$ClientXml = "",
    [int]$TimeoutSec = 30
)

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
Write-Host " Date (Y-M-D): $Year-$Month-$Day (Total: $Total, Burnt: $Burnt)" -ForegroundColor Cyan
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

    Write-Host "`n[RESPONSE HEADERS]" -ForegroundColor Yellow
    $response.Headers.GetEnumerator() | ForEach-Object {
        Write-Host "$($_.Key): $($_.Value)"
    }

    Write-Host "`n[RESPONSE BODY (XML)]" -ForegroundColor Cyan
    Write-Host $response.Content -ForegroundColor White
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
            Write-Host "`nError Response Body:" -ForegroundColor Yellow
            Write-Host $errBody
        } catch {}
    } else {
        Write-Host "Error Details: $($_.Exception.Message)" -ForegroundColor Red
    }
}
