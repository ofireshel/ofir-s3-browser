$ErrorActionPreference = 'Stop'

# Inputs from environment to avoid committing secrets
$TOKEN   = $env:CLOUDFLARE_API_TOKEN
if (-not $TOKEN) { throw 'CLOUDFLARE_API_TOKEN not set' }
$ACCOUNT = $env:CLOUDFLARE_ACCOUNT_ID
if (-not $ACCOUNT) { throw 'CLOUDFLARE_ACCOUNT_ID not set' }
$PROJECT = 'lexiorbit'
$DOMAINS = @('habgida.info','www.habgida.info')

$base = 'https://api.cloudflare.com/client/v4'
$headers = @{ Authorization = ('Bearer ' + $TOKEN); 'Content-Type' = 'application/json' }

function Invoke-CFApi {
  param(
    [Parameter(Mandatory=$true)] [ValidateSet('GET','POST')] [string]$Method,
    [Parameter(Mandatory=$true)] [string]$Path,
    [Parameter()] $Body
  )
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
        Write-Output "API error: $msg`n$text"
        return
      }
    } catch {}
    throw
  }
}

Write-Host 'Verifying token...' -ForegroundColor Cyan
$verify = Invoke-CFApi -Method GET -Path '/user/tokens/verify'
$verify | ConvertTo-Json -Depth 6 | Write-Output

Write-Host 'Binding domains...' -ForegroundColor Cyan
foreach ($d in $DOMAINS) {
  Write-Host ("Attaching " + $d)
  $res = Invoke-CFApi -Method POST -Path "/accounts/$ACCOUNT/pages/projects/$PROJECT/domains" -Body @{ domain = $d }
  ($res | ConvertTo-Json -Depth 6) | Write-Output
}

Write-Host 'Listing bindings...' -ForegroundColor Cyan
$list = Invoke-CFApi -Method GET -Path "/accounts/$ACCOUNT/pages/projects/$PROJECT/domains"
$list | ConvertTo-Json -Depth 8 | Write-Output


