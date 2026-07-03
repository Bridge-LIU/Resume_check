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
REM ----------------------------------------------------------------
REM Interview AI Evaluation Tool - one-click launcher
REM Design doc section 3: local web app on localhost:%PORT%
REM ----------------------------------------------------------------

cd /d "%~dp0"

REM Port - default 3939. Change here if you need a different port.
if not defined PORT set PORT=3939

echo.
echo ================================================
echo   Interview AI Evaluation Tool - Startup
echo ================================================
echo.

REM Check if the port is already in use - dev server, etc.
netstat -ano | findstr "127.0.0.1:%PORT%" | findstr "LISTENING" > nul
if not errorlevel 1 (
    echo [INFO] Port %PORT% is already in use.
    echo        The server seems to be running. Opening browser...
    echo.
    start "" http://localhost:%PORT%
    timeout /t 2 /nobreak > nul
    exit /b 0
)

REM Check Node.js
where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo.
    echo Please install Node.js 20 or newer:
    echo   https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js !NODE_VERSION!

REM Check node_modules
if not exist "node_modules\" (
    echo.
    echo [First setup] Running npm install - 3 to 5 minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        exit /b 1
    )
) else (
    echo [OK] node_modules
)

REM Check production build
if not exist ".next\BUILD_ID" (
    echo.
    echo [First build] Running next build - 1 to 2 minutes...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo [ERROR] Build failed. See the messages above.
        echo         Ask the developer if there are type or syntax errors.
        exit /b 1
    )
) else (
    echo [OK] Build already exists
)

echo.
echo ================================================
echo   Starting server... browser will open shortly
echo.
echo   URL   : http://localhost:%PORT%
echo   Stop  : close this window or press Ctrl+C
echo ================================================
echo.

start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"

REM Enable auto shutdown when browser is closed
REM /api/heartbeat calls process.exit(0) if no ping is received for 60 sec
set AUTO_SHUTDOWN=1

REM Start Next.js server
call npm run start
set SERVER_EXIT=!ERRORLEVEL!

echo.
if not "!SERVER_EXIT!"=="0" (
    echo [STOP] Server failed to start or exited abnormally - code !SERVER_EXIT!
    echo        Check if port %PORT% is used by another process,
    echo        or read the messages from npm run start.
    exit /b !SERVER_EXIT!
)
echo [STOP] Server stopped normally. Closing this window in 3 seconds...
timeout /t 3 /nobreak > nul
exit /b 0
