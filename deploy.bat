@echo off
echo Deploying to Cloudflare Pages project "lexiorbit"...

REM Check for npm
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo npm not found. Please install Node.js from https://nodejs.org/
  exit /b 1
)

REM Deploy to existing Pages project (production branch)
npx --yes wrangler@latest pages deploy . --project-name lexiorbit --branch main --commit-dirty=true
if %ERRORLEVEL% NEQ 0 (
  echo Deployment failed with exit code %ERRORLEVEL%.
  exit /b %ERRORLEVEL%
)

echo Deployment completed successfully.
echo Project: lexiorbit