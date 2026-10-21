<#
.SYNOPSIS
    Ejecuta el escenario encadenado de Tickets (IssueTicket2 -> GetTicket -> CompleteTicket1)
    en el entorno QA3 (o el que se indique), utilizando exactamente la misma configuración,
    IDs de kiosco y headers que la aplicación web. Imprime en consola todos los valores del Request
    y la Respuesta completa en XML.

.PARAMETER Environment
    Ambiente a probar: QA3 (por defecto), QA1 o QA2.

.PARAMETER KioskID
    GUID del KioskID a utilizar. Si no se pasa, toma uno automáticamente de data/kiosk-ids.json.
#>

[CmdletBinding()]
param(
    [ValidateSet("QA1", "QA2", "QA3")]
    [string]$Environment = "QA3",

    [string]$KioskID = ""
)

$ErrorActionPreference = "Continue"

# 1. Definir BaseUrl tal cual lo hace la webapp (app.js: onEnvironmentChange)
$lowerEnv = $Environment.ToLower()
$BaseUrl = "https://intserver.$lowerEnv.flashparking.dev"
$serviceUrl = "$BaseUrl/device/kiosk.asmx"

# 2. Cargar KioskID desde data/kiosk-ids.json si no fue provisto
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$kioskPoolPath = Join-Path $scriptDir "webv1\data\kiosk-ids.json"

if ([string]::IsNullOrWhiteSpace($KioskID)) {
    if (Test-Path $kioskPoolPath) {
        try {
            $pool = Get-Content -Raw -Path $kioskPoolPath | ConvertFrom-Json
            if ($pool -and $pool.Count -gt 0) {
                $KioskID = $pool[0]
            }
        } catch {
            Write-Warning "No se pudo leer $kioskPoolPath : $($_.Exception.Message)"
        }
    }
    if ([string]::IsNullOrWhiteSpace($KioskID)) {
        $KioskID = "0E3F7412-2FDA-47AF-B3DB-79EEF36FB732"
    }
}

# Helper para formatear e indentar XML en consola
function Format-XmlOutput([string]$xmlString) {
    if ([string]::IsNullOrWhiteSpace($xmlString)) { return "(Cuerpo vacio)" }
    try {
        $xmlDoc = New-Object System.Xml.XmlDocument
        $xmlDoc.LoadXml($xmlString)
        $sw = New-Object System.IO.StringWriter
        $xw = New-Object System.Xml.XmlTextWriter($sw)
        $xw.Formatting = [System.Xml.Formatting]::Indented
        $xw.Indentation = 2
        $xmlDoc.WriteContentTo($xw)
        $xw.Flush()
        return $sw.ToString()
    } catch {
        return $xmlString
    }
}

# Helper para ejecutar petición SOAP 1.2 idéntico a runner.js
function Send-Soap12Request([string]$endpointUrl, [string]$actionUrl, [string]$soapBody) {
    # Headers exactos generados por runner.js (SOAP 1.2)
    $headers = @{
        "Content-Type" = "application/soap+xml; charset=utf-8; action=`"$actionUrl`""
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri $endpointUrl `
                                      -Method Post `
                                      -Headers $headers `
                                      -Body $soapBody `
                                      -UseBasicParsing `
                                      -TimeoutSec 60
        $sw.Stop()
        return @{
            StatusCode   = [int]$response.StatusCode
            StatusDesc   = $response.StatusDescription
            DurationMs   = $sw.ElapsedMilliseconds
            ResponseBody = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
            Success      = $true
        }
    } catch [System.Net.WebException] {
        $sw.Stop()
        $resp = $_.Exception.Response
        $body = ""
        $code = 0
        if ($resp) {
            $code = [int]$resp.StatusCode
            $stream = $resp.GetResponseStream()
            if ($stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            }
        }
        return @{
            StatusCode   = $code
            StatusDesc   = $_.Exception.Message
            DurationMs   = $sw.ElapsedMilliseconds
            ResponseBody = $body
            Success      = $false
        }
    } catch {
        $sw.Stop()
        return @{
            StatusCode   = 0
            StatusDesc   = $_.Exception.Message
            DurationMs   = $sw.ElapsedMilliseconds
            ResponseBody = ""
            Success      = $false
        }
    }
}

# Contexto de iteración generado igual a runner.js (runScenarioSteps)
$randomSuffix = Get-Random -Minimum 1 -Maximum 100
$ticketID = [System.Guid]::NewGuid().ToString().ToUpper()
$epochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ticketNumber = "PERF-$epochMs-$randomSuffix"
$nowIso = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " ESCENARIO WEBAPP EN ${Environment}: IssueTicket2 -> GetTicket -> CompleteTicket1" -ForegroundColor Cyan
Write-Host " Base URL:     $BaseUrl" -ForegroundColor Gray
Write-Host " Endpoint URL: $serviceUrl" -ForegroundColor Gray
Write-Host " Kiosk ID:     $KioskID" -ForegroundColor Yellow
Write-Host " Ticket ID:    $ticketID" -ForegroundColor Yellow
Write-Host " Ticket Num:   $ticketNumber" -ForegroundColor Yellow
Write-Host " Iteration TS: $nowIso" -ForegroundColor Gray
Write-Host "================================================================================`n" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# PASO 1: IssueTicket2
# -----------------------------------------------------------------------------
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Magenta
Write-Host " [PASO 1/3] Step: callKioskIssueTicket2" -ForegroundColor Magenta
Write-Host " Operation:  IssueTicket2" -ForegroundColor Magenta
Write-Host " SOAPAction: http://kleverlogic.com/webservices/IssueTicket2" -ForegroundColor Gray
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Magenta

$issueBody = @"
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <IssueTicket2 xmlns="http://kleverlogic.com/webservices/">
      <kioskID>$KioskID</kioskID>
      <calledAt>$nowIso</calledAt>
      <ticketID>$ticketID</ticketID>
      <ticketNumber>$ticketNumber</ticketNumber>
      <issuedAt>$nowIso</issuedAt>
    </IssueTicket2>
  </soap12:Body>
</soap12:Envelope>
"@

Write-Host ">> REQUEST BODY:" -ForegroundColor DarkYellow
Write-Host (Format-XmlOutput $issueBody) -ForegroundColor DarkGray

$res1 = Send-Soap12Request -endpointUrl $serviceUrl `
                           -actionUrl "http://kleverlogic.com/webservices/IssueTicket2" `
                           -soapBody $issueBody

Write-Host "`n<< RESPONSE BODY (HTTP $($res1.StatusCode) en $($res1.DurationMs) ms):" -ForegroundColor $(if ($res1.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host (Format-XmlOutput $res1.ResponseBody) -ForegroundColor White

Write-Host "`n⏳ Think Time: 5s (igual que en la webapp)..." -ForegroundColor DarkCyan
Start-Sleep -Seconds 5

# -----------------------------------------------------------------------------
# PASO 2: GetTicket
# -----------------------------------------------------------------------------
Write-Host "`n--------------------------------------------------------------------------------" -ForegroundColor Blue
Write-Host " [PASO 2/3] Step: callKioskGetTicket" -ForegroundColor Blue
Write-Host " Operation:  GetTicket" -ForegroundColor Blue
Write-Host " SOAPAction: http://kleverlogic.com/webservices/GetTicket" -ForegroundColor Gray
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Blue

$calledAtGet = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
$getBody = @"
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetTicket xmlns="http://kleverlogic.com/webservices/">
      <kioskID>$KioskID</kioskID>
      <ticketID>$ticketID</ticketID>
      <calledAt>$calledAtGet</calledAt>
    </GetTicket>
  </soap12:Body>
</soap12:Envelope>
"@

Write-Host ">> REQUEST BODY:" -ForegroundColor DarkYellow
Write-Host (Format-XmlOutput $getBody) -ForegroundColor DarkGray

$res2 = Send-Soap12Request -endpointUrl $serviceUrl `
                           -actionUrl "http://kleverlogic.com/webservices/GetTicket" `
                           -soapBody $getBody

Write-Host "`n<< RESPONSE BODY (HTTP $($res2.StatusCode) en $($res2.DurationMs) ms):" -ForegroundColor $(if ($res2.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host (Format-XmlOutput $res2.ResponseBody) -ForegroundColor White

Write-Host "`n⏳ Think Time: 5s (igual que en la webapp)..." -ForegroundColor DarkCyan
Start-Sleep -Seconds 5

# -----------------------------------------------------------------------------
# PASO 3: CompleteTicket1
# -----------------------------------------------------------------------------
Write-Host "`n--------------------------------------------------------------------------------" -ForegroundColor DarkGreen
Write-Host " [PASO 3/3] Step: callKioskCompleteTicket1" -ForegroundColor DarkGreen
Write-Host " Operation:  CompleteTicket1" -ForegroundColor DarkGreen
Write-Host " SOAPAction: http://kleverlogic.com/webservices/CompleteTicket1" -ForegroundColor Gray
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor DarkGreen

$calledAtComplete = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
$completeBody = @"
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <CompleteTicket1 xmlns="http://kleverlogic.com/webservices/">
      <kioskID>$KioskID</kioskID>
      <calledAt>$calledAtComplete</calledAt>
      <ticketID>$ticketID</ticketID>
    </CompleteTicket1>
  </soap12:Body>
</soap12:Envelope>
"@

Write-Host ">> REQUEST BODY:" -ForegroundColor DarkYellow
Write-Host (Format-XmlOutput $completeBody) -ForegroundColor DarkGray

$res3 = Send-Soap12Request -endpointUrl $serviceUrl `
                           -actionUrl "http://kleverlogic.com/webservices/CompleteTicket1" `
                           -soapBody $completeBody

Write-Host "`n<< RESPONSE BODY (HTTP $($res3.StatusCode) en $($res3.DurationMs) ms):" -ForegroundColor $(if ($res3.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host (Format-XmlOutput $res3.ResponseBody) -ForegroundColor White

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN DEL ESCENARIO ($Environment):" -ForegroundColor Cyan
Write-Host "  1. IssueTicket2:    HTTP $($res1.StatusCode) ($($res1.DurationMs) ms)" -ForegroundColor $(if ($res1.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host "  2. GetTicket:       HTTP $($res2.StatusCode) ($($res2.DurationMs) ms)" -ForegroundColor $(if ($res2.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host "  3. CompleteTicket1: HTTP $($res3.StatusCode) ($($res3.DurationMs) ms)" -ForegroundColor $(if ($res3.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host "================================================================================" -ForegroundColor Cyan
