param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [Parameter(Mandatory=$true)] [string]$Domain
)

$ErrorActionPreference = 'Stop'

$base = 'https://api.cloudflare.com/client/v4'
$headers = @{ Authorization = ("Bearer " + $Token) }

Write-Host "Verifying token..." -ForegroundColor Cyan
$verify = Invoke-RestMethod -Method Get -Uri ($base + '/user/tokens/verify') -Headers $headers
$verify | ConvertTo-Json -Depth 6 | Write-Output

Write-Host "Listing accounts..." -ForegroundColor Cyan
$accounts = Invoke-RestMethod -Method Get -Uri ($base + '/accounts') -Headers $headers
$accounts | ConvertTo-Json -Depth 6 | Write-Output

Write-Host ("Looking up zone: " + $Domain) -ForegroundColor Cyan
$zone = Invoke-RestMethod -Method Get -Uri ($base + ('/zones?name=' + $Domain)) -Headers $headers
$zone | ConvertTo-Json -Depth 6 | Write-Output


