<#
.SYNOPSIS
    Runs dedicated Payments NewMessages long-poll performance test
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-payments.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
