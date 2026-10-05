<#
.SYNOPSIS
    Runs dedicated PMS NewMessages long-poll performance test
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-pms.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
