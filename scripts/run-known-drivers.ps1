<#
.SYNOPSIS
    Runs the Kiosk GetKnownDrivers performance test (/device/kiosk.asmx)
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-known-drivers.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
