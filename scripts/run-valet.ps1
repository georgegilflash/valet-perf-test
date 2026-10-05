<#
.SYNOPSIS
    Runs dedicated Valet fast services performance test (GetServerName on /device/valet.asmx)
#>
param (
    [string]$EnvFile = "C:\Program Files\.env",
    [string]$AdditionalArgs = ""
)

& "$PSScriptRoot\run-device.ps1" -Script "main-valet.js" -EnvFile $EnvFile -AdditionalArgs $AdditionalArgs
