param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [Parameter(Mandatory=$true)] [string]$AccountId,
  [Parameter(Mandatory=$true)] [string]$Project,
  [Parameter(Mandatory=$true)] [string[]]$Domains
)

$ErrorActionPreference = 'Stop'

function Invoke-CFApi {
  param(
    [Parameter(Mandatory=$true)] [ValidateSet('GET','POST','DELETE','PUT','PATCH')] [string]$Method,
    [Parameter(Mandatory=$true)] [string]$Path,
    [Parameter()] $Body
  )
  $base = 'https://api.cloudflare.com/client/v4'
  $headers = @{ Authorization = ("Bearer " + $Token); 'Content-Type' = 'application/json' }
  try {
    if ($PSBoundParameters.ContainsKey('Body')) {
      $json = $Body | ConvertTo-Json -Compress
      return Invoke-RestMethod -Method $Method -Uri ($base + $Path) -Headers $headers -Body $json
    } else {
      return Invoke-RestMethod -Method $Method -Uri ($base + $Path) -Headers $headers
    }
  } catch {
    $msg = $_.Exception.Message
    try {
      $resp = $_.Exception.Response
      if ($resp -and $resp.GetResponseStream) {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $text = $reader.ReadToEnd()
        throw "API error: $msg`n$text"
      } else { throw "API error: $msg" }
    } catch { throw }
  }
}

Write-Host "Binding domains to Pages project '$Project'..." -ForegroundColor Cyan

foreach ($d in $Domains) {
  Write-Host ("Attaching: " + $d)
  $res = Invoke-CFApi -Method POST -Path "/accounts/$AccountId/pages/projects/$Project/domains" -Body @{ domain = $d }
  Write-Host ("  -> status: " + ($res.success)) -ForegroundColor Green
}

Write-Host "Listing current bindings:" -ForegroundColor Cyan
$list = Invoke-CFApi -Method GET -Path "/accounts/$AccountId/pages/projects/$Project/domains"
$list | ConvertTo-Json -Depth 8 | Write-Output


