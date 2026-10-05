<#
.SYNOPSIS
    Runs the Kiosk fast services performance test (Ping & GetServerName)
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-kiosk.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
