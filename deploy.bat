@echo off
echo Deploying ofir-s3-browser to GitHub and Cloudflare...

REM Expect tokens from environment; do not hardcode secrets
if "%GITHUB_TOKEN%"=="" (
  echo Error: GITHUB_TOKEN is not set. Please set it in your environment and re-run.
  exit /b 1
)
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo Warning: CLOUDFLARE_API_TOKEN is not set. Cloudflare steps will be skipped.
)
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  set CLOUDFLARE_ACCOUNT_ID=
)

REM Check for Git
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Git not found. Please install Git manually or run:
    echo winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
    pause
    exit /b 1
)

echo Found Git, proceeding with repository setup...

REM Initialize repository
git init
git config user.name "Ofir"
git config user.email "ofir@example.com"
git checkout -B main
git remote remove origin 2>nul
git remote add origin https://github.com/ofireshel/ofir-s3-browser.git

REM Commit and push
git add -A
git commit -m "Deploy physics animation site"
git pull --rebase origin main 2>nul
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo Successfully pushed to GitHub!
    echo Repository: https://github.com/ofireshel/ofir-s3-browser
) else (
    echo GitHub push failed. Check your token and try again.
    pause
    exit /b 1
)

REM Check for npm
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo npm not found. Please install Node.js first.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo Installing wrangler...
npm install -g wrangler

echo Deploying to Cloudflare Pages...
if not "%CLOUDFLARE_API_TOKEN%"=="" (
  wrangler pages project create ofir-s3-browser --production-branch main --compatibility-date=2024-01-01
  wrangler pages deploy . --project-name ofir-s3-browser
  wrangler pages project domain add ofir-s3-browser habgida.info
) else (
  echo Skipping Cloudflare deploy because CLOUDFLARE_API_TOKEN is not set.
)

echo.
echo Deployment completed!
echo Your site will be available at:
echo - https://habgida.info (custom domain)
echo - https://ofir-s3-browser.pages.dev (Cloudflare URL)
echo.
pause

