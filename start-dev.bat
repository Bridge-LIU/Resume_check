@echo off
REM ================================================
REM  Developer launcher (Turbopack, hot reload)
REM  Runs full edition UI (EDITION=full)
REM  Port: 3939 (override via PORT env var)
REM  Removes .next cache on each start (clean state).
REM ================================================
setlocal
cd /d "%~dp0"

if not defined PORT set PORT=3939
set EDITION=full

REM Abort if the port is already in use (another dev server is running,
REM which would also lock .next/dev/cache files).
netstat -ano | findstr "127.0.0.1:%PORT%" | findstr "LISTENING" > nul
if not errorlevel 1 (
    echo.
    echo ================================================
    echo   [ABORT] Port %PORT% is already in use.
    echo   Another server is still running on this port
    echo   and is probably locking the .next cache files.
    echo.
    echo   Close the other window - press Ctrl+C or close its console -
    echo   then re-run this script.
    echo ================================================
    echo.
    pause
    endlocal & exit /b 1
)

REM Force clean start: remove .next cache to avoid stale artifacts.
if exist ".next\" (
    echo [Clean] Removing .next cache...
    rmdir /s /q ".next"
)

echo.
echo ================================================
echo   [DEV] Interview AI Evaluation Tool
echo   Edition: %EDITION%   Port: %PORT%
echo   URL    : http://localhost:%PORT%
echo   Stop   : Ctrl+C or close this window
echo ================================================
echo.

call npm run dev
endlocal
