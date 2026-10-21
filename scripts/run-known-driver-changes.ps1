<#
.SYNOPSIS
    Runs the Kiosk GetKnownDriverChanges performance test (/device/kiosk.asmx)
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-known-driver-changes.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
