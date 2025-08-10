# Deployment script for ofir-s3-browser
$ErrorActionPreference = "Stop"

Write-Host "Setting up deployment environment..."

# Expect tokens from environment; do not hardcode secrets
if (-not $env:GITHUB_TOKEN) { throw "GITHUB_TOKEN is not set. Set it in your environment before running." }
# CLOUDFLARE_API_TOKEN is optional; Cloudflare steps are skipped if missing
if (-not $env:CLOUDFLARE_ACCOUNT_ID) { $env:CLOUDFLARE_ACCOUNT_ID = '' }

# Check if Git is available
$gitPath = $null
$gitPaths = @(
    "git",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe"
)

foreach ($path in $gitPaths) {
    try {
        & $path --version 2>$null
        $gitPath = $path
        Write-Host "Found Git at: $gitPath"
        break
    } catch {
        continue
    }
}

if (-not $gitPath) {
    Write-Host "Git not found. Installing Git..."
    try {
        winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements --silent
        Start-Sleep 5
        $gitPath = "C:\Program Files\Git\cmd\git.exe"
        if (Test-Path $gitPath) {
            Write-Host "Git installed successfully"
        } else {
            throw "Git installation failed"
        }
    } catch {
        Write-Error "Failed to install Git: $_"
        exit 1
    }
}

# Initialize Git repository
Write-Host "Initializing Git repository..."
try {
    & $gitPath init
    & $gitPath config user.name "Ofir"
    & $gitPath config user.email "ofir@example.com"
    & $gitPath checkout -B main 2>$null
    
    # Remove existing origin if present
    try { & $gitPath remote remove origin 2>$null } catch {}
    
    # Add remote (use standard URL; auth handled by Git credential helper or PAT prompt)
    $repoUrl = "https://github.com/ofireshel/ofir-s3-browser.git"
    & $gitPath remote add origin $repoUrl 2>$null
    
    Write-Host "Git repository configured"
} catch {
    Write-Error "Git configuration failed: $_"
    exit 1
}

# Commit and push to GitHub
Write-Host "Pushing to GitHub..."
try {
    & $gitPath add -A
    & $gitPath commit -m "Deploy physics animation site" 2>$null
    
    # Try to pull first (in case repo has content)
    try { & $gitPath pull --rebase origin main 2>$null } catch {}
    
    & $gitPath push -u origin main
    Write-Host "Successfully pushed to GitHub"
} catch {
    Write-Error "GitHub push failed: $_"
    exit 1
}

# Install Node.js tools if needed
Write-Host "Setting up Cloudflare deployment..."
try {
    # Enable script execution for npm
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force 2>$null
    
    # Check if npm is available
    npm --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm not available. Please install Node.js first."
        exit 1
    }
    
    # Install wrangler globally
    npm install -g wrangler
    
    Write-Host "Wrangler installed"
} catch {
    Write-Error "Failed to install wrangler: $_"
    exit 1
}

# Deploy to Cloudflare Pages
Write-Host "Deploying to Cloudflare Pages..."
try {
    # Create Pages project
    wrangler pages project create ofir-s3-browser --production-branch main --compatibility-date=2024-01-01 2>$null
    
    # Deploy the site
    wrangler pages deploy . --project-name ofir-s3-browser
    
    # Add custom domain
    wrangler pages project domain add ofir-s3-browser habgida.info
    
    Write-Host "Deployment completed successfully!"
    Write-Host "Your site will be available at:"
    Write-Host "- https://habgida.info (custom domain - may take a few minutes for DNS)"
    Write-Host "- https://ofir-s3-browser.pages.dev (Cloudflare URL)"
    
} catch {
    Write-Error "Cloudflare deployment failed: $_"
    exit 1
}

Write-Host "All done! Your physics animation site is now live."

