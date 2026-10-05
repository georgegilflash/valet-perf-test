<#
.SYNOPSIS
    Runs parallel multi-scenario long-polling performance test (PMS, Sign, Payments simultaneously)
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-polling.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
