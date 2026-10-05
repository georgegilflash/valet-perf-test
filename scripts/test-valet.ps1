<#
.SYNOPSIS
    SOAP 1.2 Web Service Test Runner for Valet GetServerName (/device/valet.asmx -> GetServerName)
    Easily configurable via the variables section below.
#>

# ==============================================================================
# CONFIGURATION VARIABLES (Edit these to customize your test)
# ==============================================================================

# 1. Base URL / Host
$BaseUrl = "https://intserver.qa1.flashparking.dev"

# 2. Service Path
$ServicePath = "/device/valet.asmx"

# 3. XML Namespace
$Namespace = "http://kleverlogic.com/webservices/"

# 4. SOAP Method Name
$MethodName = "GetServerName"

# 5. Inner XML Body
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
Write-Host " SOAP 1.2 Web Service Test - Valet GetServerName" -ForegroundColor Cyan
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
    $durationMs = $stopwatch.ElapsedMilliseconds

    Write-Host "`n[RESPONSE STATUS] HTTP $($response.StatusCode) ($($response.StatusDescription)) in $($durationMs)ms" -ForegroundColor Green
    Write-Host "`n[RESPONSE BODY]" -ForegroundColor Yellow
    Write-Host $response.Content -ForegroundColor White

    # Extract Server Name if available
    if ($response.Content -match "<GetServerNameResult>(.*?)</GetServerNameResult>") {
        Write-Host "`n>> SERVER NAME DETECTED: $($matches[1])" -ForegroundColor Green
    }
}
catch {
    Write-Host "`n[ERROR] Request failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        Write-Host "`n[SERVER RESPONSE BODY]" -ForegroundColor DarkRed
        Write-Host $errBody -ForegroundColor DarkRed
    }
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
