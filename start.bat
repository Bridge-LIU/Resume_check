@echo off
REM Force UTF-8 codepage for console output (not for bat file parsing).
chcp 65001 >nul 2>&1
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
REM Node's listen("localhost") may bind IPv4 (127.0.0.1) or IPv6 ([::1]) depending
REM on Windows resolver order, so we check both.
netstat -ano | findstr /C:"127.0.0.1:%PORT%" /C:"[::1]:%PORT%" | findstr "LISTENING" > nul
if not errorlevel 1 (
    echo [INFO] Port %PORT% is already in use.
    echo        Server seems to be running. Opening browser...
    echo.
    start "" http://localhost:%PORT%
    timeout /t 2 /nobreak > nul
    exit /b 0
)

REM ================================================
REM  Catastrophic-recovery detection
REM  If updater.bat was killed mid-update (BSOD / power loss / user force-close),
REM  state.json stays at phase=applying|restoring and half-new files remain.
REM  Auto-invoke restore.bat --auto to roll back to the latest backup before
REM  we try to boot the server. See scripts/updater.bat spec section 12.8.6.
REM
REM  IMPORTANT: guard on UPDATE_RESTART.
REM  updater.bat intentionally leaves state.json = "applying" on success;
REM  instrumentation.ts:selfHealOnBoot() clears it after the new server boots.
REM  If UPDATE_RESTART is set, we came here from :after_server_exit's goto :main
REM  (same-cmd loop after updater completed) - trust selfHealOnBoot to handle it.
REM  Only run detection on a fresh cmd session (real crash / user restart).
REM ================================================
if not defined UPDATE_RESTART (
    if exist "data\.update\state.json" (
        findstr /C:"\"applying\"" /C:"\"restoring\"" "data\.update\state.json" >nul 2>&1
        if not errorlevel 1 (
            echo.
            echo ================================================
            echo   [WARN] Previous update did not finish cleanly.
            echo   [WARN] Auto-restoring from latest backup...
            echo ================================================
            echo.
            call scripts\restore.bat --auto
        )
    )
)

REM ================================================
REM  Node.js detection (3 tiers)
REM    1. node-portable\node.exe exists (pre-bundled in distribution ZIP) -> use it
REM    2. System Node v20+ installed -> use it (developer path)
REM    3. Neither -> download portable Node from nodejs.org
REM ================================================
call :ensure_node
if errorlevel 1 exit /b 1
goto :after_node_check

:ensure_node
REM Tier 1: pre-bundled portable Node
if exist "node-portable\node.exe" (
    set "PATH=%CD%\node-portable;%PATH%"
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
    echo [OK] Portable Node.js !NODE_VERSION! (bundled)
    exit /b 0
)

REM Tier 2: system Node v20+
where node > nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
    REM Strip leading "v" then take major version
    for /f "tokens=1 delims=." %%a in ("!NODE_VERSION:v=!") do set NODE_MAJOR=%%a
    if !NODE_MAJOR! GEQ 20 (
        echo [OK] System Node.js !NODE_VERSION!
        exit /b 0
    )
    echo [INFO] System Node.js !NODE_VERSION! is unsupported (v20 required), fetching portable
)

REM Tier 3: auto-download (first-run only, 1-2 min)
echo.
echo ================================================
echo   First-time setup: fetching portable Node.js
echo   ~30MB, usually 1-2 minutes
echo   Downloading from nodejs.org ...
echo ================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.22.2/node-v22.22.2-win-x64.zip' -OutFile 'node-portable.zip' -UseBasicParsing } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
    echo.
    echo [ERROR] Download failed.
    echo   1. Check your internet connection
    echo   2. Or install Node.js 20+ manually from https://nodejs.org/
    exit /b 1
)

echo [Setup] Extracting...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'node-portable.zip' -DestinationPath '.' -Force"
if errorlevel 1 (
    echo [ERROR] Extraction failed. Delete node-portable.zip and retry.
    exit /b 1
)
del /q "node-portable.zip" > nul 2>&1

REM Extracted as "node-vXX.YY.Z-win-x64\", rename to "node-portable\"
for /d %%d in ("node-v*-win-x64") do (
    ren "%%d" "node-portable" > nul 2>&1
)

if not exist "node-portable\node.exe" (
    echo [ERROR] Portable Node extraction failed.
    exit /b 1
)

set "PATH=%CD%\node-portable;%PATH%"
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
echo [OK] Portable Node.js !NODE_VERSION! (freshly installed)
exit /b 0

:after_node_check

REM ================================================
REM  Standalone bundle detection (spec decision 1 revised -> standalone prepackage).
REM  If .next\standalone\server.js exists, this is a production distribution:
REM    - skip npm install (standalone bundles its own dependencies)
REM    - skip .next cleanup (would destroy the standalone bundle)
REM    - skip build (already built)
REM ================================================
if exist ".next\standalone\server.js" goto :standalone_start

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

REM Skip browser-open on post-update restart (user's browser tab is still open,
REM polling /api/update/progress). Only auto-open on first launch.
if not defined UPDATE_RESTART (
    start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"
)

REM Auto-shutdown when browser is closed (180s heartbeat timeout in server).
REM Diagnostic mode: enabled to gather evidence about false shutdowns.
REM On exit, lib/heartbeat.ts writes a categorized reason to
REM .auto-shutdown.reason (SLEEP_LIKELY / TAB_CLOSED_OR_DISCARDED /
REM NEVER_PINGED / PING_INTERVAL_DEGRADED / PING_STOPPED).
set AUTO_SHUTDOWN=1

call npm run start
set SERVER_EXIT=!ERRORLEVEL!
goto :after_server_exit


:standalone_start
REM ================================================
REM  Standalone production mode
REM ================================================
echo [Standalone] .next\standalone\server.js detected - production mode
echo [Standalone] Skipping npm install / build / .next cleanup

echo.
echo ================================================
echo   Starting standalone server... browser will open shortly
echo   URL   : http://localhost:%PORT%
echo   Stop  : close this window or press Ctrl+C
echo ================================================
echo.

REM Skip browser-open on post-update restart (see note in :main branch above).
if not defined UPDATE_RESTART (
    start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"
)

REM AUTO_SHUTDOWN / heartbeat is bundled into instrumentation.ts (works in standalone too).
set AUTO_SHUTDOWN=1
REM Standalone server.js uses HOSTNAME + PORT for bind target.
REM Restrict to localhost to prevent LAN exposure (single-user local tool).
set HOSTNAME=localhost
set NODE_ENV=production
REM Standalone server.js changes cwd to .next\standalone\. Pass the real project root
REM through an env var so lib/storage.ts can resolve data/ and .backup/ correctly.
set RESUME_CLAUDE_PROJECT_ROOT=%CD%

REM public/ and .next/static/ must be placed next to standalone/server.js.
REM release.yml should do this at ZIP-build time; start.bat compensates if missing.
if not exist ".next\standalone\public\" (
    echo [Standalone] Preparing static assets...
    if exist "public" xcopy /e /q /y "public" ".next\standalone\public\" > nul
    if not exist ".next\standalone\.next\" mkdir ".next\standalone\.next\"
    if not exist ".next\standalone\.next\static\" mkdir ".next\standalone\.next\static\"
    if exist ".next\static" xcopy /e /q /y ".next\static" ".next\standalone\.next\static\" > nul
)

REM Manual files (unicode-named user manual and its asset folder) are placed
REM inside .next\standalone\ at pkg build time by the distribution script.
REM No runtime copy needed (avoids CP932 vs UTF-8 filename parsing issues on
REM Japanese Windows).

call node .next\standalone\server.js
set SERVER_EXIT=!ERRORLEVEL!
goto :after_server_exit


:after_server_exit
REM ================================================
REM  Shutdown / diagnostic handling (shared by both dev and standalone modes)
REM ================================================

REM ================================================
REM  In-place update: if apply route wrote pending.args, run updater.bat here
REM  in the same cmd window, then goto :main to restart the server.
REM  This avoids spawning a new cmd window (no flash, no popup).
REM ================================================
if exist "data\.update\pending.args" (
    echo.
    echo ================================================
    echo   Update requested. Applying in this window...
    echo ================================================
    echo.
    set "UPDATE_ARGS="
    set /p UPDATE_ARGS=<"data\.update\pending.args"
    call scripts\updater.bat !UPDATE_ARGS!
    set UPDATER_EXIT=!ERRORLEVEL!
    if exist "data\.update\pending.args" del /q "data\.update\pending.args"
    if !UPDATER_EXIT! NEQ 0 (
        echo.
        echo [UPDATE] Updater exited with code !UPDATER_EXIT! ^(rollback likely triggered^)
        echo [UPDATE] Restarting server anyway...
        echo.
    ) else (
        echo.
        echo [UPDATE] Update completed. Restarting server...
        echo.
    )
    REM Mark this restart as post-update so :main / :standalone_start skips
    REM the auto-browser-open (user's tab is still there polling).
    set UPDATE_RESTART=1
    REM Loop back to :main - server relaunch (either new or rolled-back version)
    goto :main
)

echo.
if not "!SERVER_EXIT!"=="0" (
    echo [STOP] Server failed - code !SERVER_EXIT!
    if exist ".auto-shutdown.reason" del ".auto-shutdown.reason" > nul 2>&1
    if exist ".heartbeat-arrivals.log" del ".heartbeat-arrivals.log" > nul 2>&1
    exit /b !SERVER_EXIT!
)
REM Exit reason is written by lib/heartbeat.ts before process.exit(0).
REM Diagnostic mode: dump the FULL multi-line reason file, not just first line.
echo [STOP] Server stopped normally.
if exist ".auto-shutdown.reason" (
    echo ------------------------------------------------
    echo   AUTO-SHUTDOWN DIAGNOSTIC
    echo ------------------------------------------------
    type ".auto-shutdown.reason"
    echo ------------------------------------------------
    REM Keep the files around for post-mortem; rename with timestamp so
    REM successive runs don't overwrite each other. Timestamp via PowerShell
    REM (avoids CP932 fullwidth chars in %DATE%/%TIME% on Japanese Windows).
    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
    ren ".auto-shutdown.reason" ".auto-shutdown.reason.!TS!" > nul 2>&1
    if exist ".heartbeat-arrivals.log" (
        ren ".heartbeat-arrivals.log" ".heartbeat-arrivals.log.!TS!" > nul 2>&1
    )
) else (
    echo   No .auto-shutdown.reason file - server exited without recording a reason.
    if exist ".heartbeat-arrivals.log" del ".heartbeat-arrivals.log" > nul 2>&1
)
echo.
echo Window will close in 30 seconds. Press any key to close sooner.
timeout /t 30
exit /b 0
