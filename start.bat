@echo off
setlocal enabledelayedexpansion

call :main
set EXITCODE=!ERRORLEVEL!

if not "!EXITCODE!"=="0" (
    echo.
    echo ================================================
    echo   [EXIT] An error occurred - exit code !EXITCODE!
    echo   Window will close in 30 seconds. Press any key to close sooner.
    echo ================================================
    timeout /t 30
)
endlocal & exit /b %EXITCODE%


:main
REM ================================================
REM  Interview AI Evaluation Tool - Launcher
REM  Paste mode + API mode (summary / questions / minutes / evaluation).
REM  /cost page and Provider / API key settings are always enabled.
REM  API usage requires Provider + API key configured in Settings page.
REM ================================================

cd /d "%~dp0"

if not defined PORT set PORT=3939

echo.
echo ================================================
echo   Interview AI Evaluation Tool
echo   Port: %PORT%
echo ================================================
echo.

REM If port is already in use, just open browser to existing server and exit.
netstat -ano | findstr "127.0.0.1:%PORT%" | findstr "LISTENING" > nul
if not errorlevel 1 (
    echo [INFO] Port %PORT% is already in use.
    echo        Server seems to be running. Opening browser...
    echo.
    start "" http://localhost:%PORT%
    timeout /t 2 /nobreak > nul
    exit /b 0
)

REM Node.js check
where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js 20 or newer: https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js !NODE_VERSION!

REM node_modules check
if not exist "node_modules\" (
    echo.
    echo [First setup] Running npm install - 3 to 5 minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        exit /b 1
    )
) else (
    echo [OK] node_modules
)

REM Force clean build: remove .next cache to avoid stale artifacts
if exist ".next\" (
    echo [Clean] Removing .next cache...
    rmdir /s /q ".next"
)

REM Production build check
if not exist ".next\BUILD_ID" (
    echo.
    echo [First build] Running next build - 1 to 2 minutes...
    echo.
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed.
        exit /b 1
    )
) else (
    echo [OK] Build already exists
)

echo.
echo ================================================
echo   Starting server... browser will open shortly
echo   URL   : http://localhost:%PORT%
echo   Stop  : close this window or press Ctrl+C
echo ================================================
echo.

start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"

REM Auto-shutdown when browser is closed (60s heartbeat timeout in server)
set AUTO_SHUTDOWN=1

call npm run start
set SERVER_EXIT=!ERRORLEVEL!

echo.
if not "!SERVER_EXIT!"=="0" (
    echo [STOP] Server failed - code !SERVER_EXIT!
    exit /b !SERVER_EXIT!
)
echo [STOP] Server stopped normally.
timeout /t 3 /nobreak > nul
exit /b 0
