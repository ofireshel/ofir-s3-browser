$ErrorActionPreference = 'Stop'

$Token = $env:CLOUDFLARE_API_TOKEN
$AccountId = $env:CLOUDFLARE_ACCOUNT_ID
$Project = 'lexiorbit'
$Domains = @('habgida.info','www.habgida.info')

Write-Host "Running domain binding..." -ForegroundColor Cyan
if (-not $Token) { throw 'CLOUDFLARE_API_TOKEN not set' }
if (-not $AccountId) { throw 'CLOUDFLARE_ACCOUNT_ID not set' }
& .\bind-pages.ps1 -Token $Token -AccountId $AccountId -Project $Project -Domains $Domains


