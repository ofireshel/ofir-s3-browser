@echo off
REM Ofir's S3 Browser Server - Windows Startup Script

echo ==========================================
echo   Ofir's S3 Browser Server
echo ==========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version: 
node --version

echo.
echo Starting server...
echo Press Ctrl+C to stop the server
echo.

REM Set default environment variables if not set
if not defined PORT set PORT=3030
if not defined HOST set HOST=127.0.0.1
if not defined LOG_LEVEL set LOG_LEVEL=info

REM Start the server
node server.js

pause
