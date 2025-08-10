$ErrorActionPreference = 'Stop'

param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [Parameter(Mandatory=$true)] [string[]]$Domains,
  [string]$Project = 'lexiorbit'
)

function Invoke-CFApi {
  param(
    [Parameter(Mandatory=$true)] [ValidateSet('GET','POST')] [string]$Method,
    [Parameter(Mandatory=$true)] [string]$Path,
    [Parameter()] $Body
  )
  $base = 'https://api.cloudflare.com/client/v4'
  $headers = @{ Authorization = ("Bearer " + $Token); 'Content-Type' = 'application/json' }
  if ($PSBoundParameters.ContainsKey('Body')) {
    $json = $Body | ConvertTo-Json -Compress
    return Invoke-RestMethod -Method $Method -Uri ($base + $Path) -Headers $headers -Body $json
  } else {
    return Invoke-RestMethod -Method $Method -Uri ($base + $Path) -Headers $headers
  }
}

Write-Host "Verifying token..." -ForegroundColor Cyan
$verify = Invoke-CFApi -Method GET -Path '/user/tokens/verify'
if (-not $verify.success) { throw "Token verify failed." }

Write-Host "Finding zone for apex domain..." -ForegroundColor Cyan
$apex = ($Domains | Where-Object { $_ -notmatch '^www\.' })[0]
if (-not $apex) { $apex = $Domains[0] }
$zoneRes = Invoke-CFApi -Method GET -Path ("/zones?name=" + $apex)
if (-not $zoneRes.result -or $zoneRes.result.Count -eq 0) { throw "Zone not found for $apex" }
$zone = $zoneRes.result[0]
$zoneAccountId = $zone.account.id
Write-Host ("Zone account: " + $zoneAccountId)

Write-Host "Searching for Pages project across accounts..." -ForegroundColor Cyan
$accounts = Invoke-CFApi -Method GET -Path '/accounts'
$projectAccountId = $null
foreach ($acct in $accounts.result) {
  try {
    $projs = Invoke-CFApi -Method GET -Path ("/accounts/"+$acct.id+"/pages/projects")
    if ($projs.result | Where-Object { $_.name -eq $Project }) {
      $projectAccountId = $acct.id
      break
    }
  } catch {}
}
if (-not $projectAccountId) { throw "Pages project '$Project' not found in accessible accounts." }
Write-Host ("Project account: " + $projectAccountId)

if ($projectAccountId -ne $zoneAccountId) {
  throw "Project and Zone are in different accounts. Move either the Pages project or the zone to the same account. Zone=$zoneAccountId Project=$projectAccountId"
}

Write-Host "Binding domains..." -ForegroundColor Cyan
foreach ($d in $Domains) {
  Write-Host ("Attaching " + $d)
  $res = Invoke-CFApi -Method POST -Path ("/accounts/"+$projectAccountId+"/pages/projects/"+$Project+"/domains") -Body @{ domain = $d }
  if (-not $res.success) { $res | ConvertTo-Json -Depth 6 | Write-Output; throw "Failed to attach $d" }
}

Write-Host "Listing bindings:" -ForegroundColor Cyan
$list = Invoke-CFApi -Method GET -Path ("/accounts/"+$projectAccountId+"/pages/projects/"+$Project+"/domains")
$list | ConvertTo-Json -Depth 8 | Write-Output


