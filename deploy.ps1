## Cloudflare Pages deploy script (lexiorbit)
$ErrorActionPreference = 'Stop'

Write-Host "Deploying to Cloudflare Pages project 'lexiorbit'..."

try {
  npm --version | Out-Null
} catch {
  Write-Error "npm not available. Please install Node.js first."
  exit 1
}

try {
  npx --yes wrangler@latest pages deploy . --project-name lexiorbit --branch main --commit-dirty=true
  Write-Host "Deployment completed successfully."
  Write-Host "Project: lexiorbit"
} catch {
  Write-Error "Cloudflare deployment failed: $_"
  exit 1
}
