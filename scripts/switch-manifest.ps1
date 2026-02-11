<#
.SYNOPSIS
  Switch manifest.json between Chrome and Firefox versions.
.EXAMPLE
  .\scripts\switch-manifest.ps1 chrome
  .\scripts\switch-manifest.ps1 firefox
#>
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("chrome", "firefox")]
  [string]$Browser
)

$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root "manifest.json"
$source = Join-Path $root "manifest.$Browser.json"

Copy-Item -Path $source -Destination $target -Force
Write-Host "✅ manifest.json switched to $Browser" -ForegroundColor Green
