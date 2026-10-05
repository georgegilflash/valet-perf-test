<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner for Sign Service (/device/sign.asmx -> NewMessages)
    Easily configurable via the variables section below.
#>

# ==============================================================================
# CONFIGURATION VARIABLES (Edit these to customize your test)
# ==============================================================================

# 1. Base URL / Host
$BaseUrl = "https://intserver.qa1.flashparking.dev"

# 2. Service Path
$ServicePath = "/device/sign.asmx"

# 3. XML Namespace
$Namespace = "http://kleverlogic.com/webservices/"

# 4. Company Location Monitor ID (Replace with your actual GUID)
$CompanyLocationMonitorID = "00000000-0000-0000-0000-000000000000"

# 5. Request Timeout in seconds (long-polling requests hold for 60s, so 90s gives headroom)
$TimeoutSec = 90

# ==============================================================================
# SCRIPT EXECUTION (No need to edit below)
# ==============================================================================

# Build target endpoint
$FullUrl = "$($BaseUrl.TrimEnd('/'))/$($ServicePath.TrimStart('/'))"

# Build SOAP 1.2 Envelope
$SoapEnvelope = @"
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <NewMessages xmlns="$Namespace">
      <companyLocationMonitorID>$CompanyLocationMonitorID</companyLocationMonitorID>
    </NewMessages>
  </soap12:Body>
</soap12:Envelope>
"@

# Allow all SSL/TLS certificates and enable TLS 1.2 / TLS 1.3
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " SOAP 1.2 Web Service Test - Sign NewMessages" -ForegroundColor Cyan
Write-Host " Endpoint:                 $FullUrl" -ForegroundColor Cyan
Write-Host " Method:                   NewMessages" -ForegroundColor Cyan
Write-Host " CompanyLocationMonitorID: $CompanyLocationMonitorID" -ForegroundColor Cyan
Write-Host " Content-Type:             application/soap+xml; charset=utf-8" -ForegroundColor Cyan
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

    # Extract Code and Description if present in response
    if ($response.Content -match "<Code>(.*?)</Code>") {
        Write-Host "`n>>> Response Code: $($matches[1]) <<<" -ForegroundColor Green
    }
    if ($response.Content -match "<Description>(.*?)</Description>") {
        Write-Host ">>> Response Description: $($matches[1]) <<<" -ForegroundColor Green
    }
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
            Write-Host "`nResponse Body / SOAP Fault:" -ForegroundColor Yellow
            Write-Host $errBody
        } catch {}
    } else {
        Write-Host "Error Details: $($_.Exception.Message)" -ForegroundColor Red
    }
}
