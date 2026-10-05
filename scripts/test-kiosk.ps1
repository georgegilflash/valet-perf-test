<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner
    Easily configurable via the variables section below.
#>

# ==============================================================================
# CONFIGURATION VARIABLES (Edit these to test different hosts, methods, or XML)
# ==============================================================================

# 1. Base URL / Host (e.g., 'https://intserver.qa1.flashparking.dev' or 'https://dev-pjvygc-int-server.azurewebsites.net')
$BaseUrl = "https://intserver.qa1.flashparking.dev"

# 2. Service Path (e.g., '/device/kiosk.asmx' or '/device/valet.asmx')
$ServicePath = "/device/kiosk.asmx"

# 3. XML Namespace
$Namespace = "http://kleverlogic.com/webservices/"

# 4. SOAP Method Name (e.g., 'GetServerName', 'NewMessages4', etc.)
$MethodName = "GetServerName"

# 5. Inner XML Body (leave as empty self-closing tag or put parameters inside)
# Example without parameters:
#   "<$MethodName xmlns=""$Namespace"" />"
#
# Example with parameters:
#   @"
#   <$MethodName xmlns="$Namespace">
#     <loginToken>219952af-36e3-4a9c-a0ba-31eee485b8e7</loginToken>
#     <compressed>true</compressed>
#     <seconds>60</seconds>
#   </$MethodName>
#   "@
$MethodBody = "<$MethodName xmlns=""$Namespace"" />"

# 6. Request Timeout (seconds)
$TimeoutSec = 30

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
    $MethodBody
  </soap12:Body>
</soap12:Envelope>
"@

# Allow all SSL/TLS certificates and enable TLS 1.2 / TLS 1.3
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " SOAP 1.2 Web Service Test" -ForegroundColor Cyan
Write-Host " Endpoint:     $FullUrl" -ForegroundColor Cyan
Write-Host " Method:       $MethodName" -ForegroundColor Cyan
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

    # Try extracting result tag (e.g. <GetServerNameResult>value</GetServerNameResult>)
    $resultTag = "$($MethodName)Result"
    if ($response.Content -match "<$resultTag>(.*?)</$resultTag>") {
        Write-Host "`n================================================================================" -ForegroundColor Green
        Write-Host "  RESULT ($resultTag): $($matches[1])" -ForegroundColor Green
        Write-Host "================================================================================" -ForegroundColor Green
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
            Write-Host "`nError Response Body:" -ForegroundColor Yellow
            Write-Host $errBody
        } catch {}
    } else {
        Write-Host "Error Details: $($_.Exception.Message)" -ForegroundColor Red
    }
}
