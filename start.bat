@echo off
REM Force UTF-8 code page so Japanese file/dir names (運用マニュアル.HTML etc.) parse correctly.
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
REM Node の listen("localhost") が IPv4 (127.0.0.1) と IPv6 ([::1]) の
REM どちらにバインドされるかは Windows のリゾルバ次第なので、両方をチェックする。
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
REM  Node.js 検出（3 段階）
REM    1. `node-portable\node.exe` が存在（配布 ZIP に事前バンドル済） → それを使う
REM    2. システム Node が入っていて v20 以上 → それを使う（開発者向け）
REM    3. どちらも無ければ → nodejs.org から DL して `node-portable/` に展開
REM  詳細は運用マニュアル.HTML の「Node.js の同梱について」参照。
REM ================================================
call :ensure_node
if errorlevel 1 exit /b 1
goto :after_node_check

:ensure_node
REM 優先 1: 配布 ZIP にバンドル済みのポータブル Node
if exist "node-portable\node.exe" (
    set "PATH=%CD%\node-portable;%PATH%"
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
    echo [OK] Portable Node.js !NODE_VERSION! （同梱版）
    exit /b 0
)

REM 優先 2: システム Node（v20 以上のみ許可）
where node > nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
    REM v22.12.0 のような文字列から先頭の "v" を取り除いた後にメジャー番号を抽出
    for /f "tokens=1 delims=." %%a in ("!NODE_VERSION:v=!") do set NODE_MAJOR=%%a
    if !NODE_MAJOR! GEQ 20 (
        echo [OK] System Node.js !NODE_VERSION!
        exit /b 0
    )
    echo [INFO] システム Node.js !NODE_VERSION! はサポート外 v20 未満、ポータブル版を用意します
)

REM 優先 3: 自動 DL（初回のみ 1〜2 分）
echo.
echo ================================================
echo   初回セットアップ：Node.js ポータブル版を取得
echo   ~30MB, 通常 1〜2 分で完了します
echo   Downloading from nodejs.org ...
echo ================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.12.0/node-v22.12.0-win-x64.zip' -OutFile 'node-portable.zip' -UseBasicParsing } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
    echo.
    echo [ERROR] ダウンロードに失敗しました。
    echo   1. インターネット接続を確認してください
    echo   2. あるいは https://nodejs.org/ から Node.js 20 以上を手動インストールしてください
    exit /b 1
)

echo [Setup] 展開中...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'node-portable.zip' -DestinationPath '.' -Force"
if errorlevel 1 (
    echo [ERROR] 展開に失敗しました。node-portable.zip を削除して再試行してください。
    exit /b 1
)
del /q "node-portable.zip" > nul 2>&1

REM 展開後は "node-vXX.YY.Z-win-x64\" ができるので "node-portable\" にリネーム
for /d %%d in ("node-v*-win-x64") do (
    ren "%%d" "node-portable" > nul 2>&1
)

if not exist "node-portable\node.exe" (
    echo [ERROR] ポータブル Node の展開に失敗しました。
    exit /b 1
)

set "PATH=%CD%\node-portable;%PATH%"
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VERSION=%%v
echo [OK] Portable Node.js !NODE_VERSION! （新規セットアップ完了）
exit /b 0

:after_node_check

REM ================================================
REM  Standalone bundle detection (spec decision 1 revised -> standalone prepackage).
REM  If .next\standalone\server.js exists, this is a production distribution:
REM    - skip npm install (standalone bundles its own dependencies)
REM    - skip .next cleanup (would destroy the standalone bundle)
REM    - skip build (already built)
REM  See docs/superpowers/specs/2026-07-13-version-check-update-design.md
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

start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"

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

start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:%PORT%"

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

REM 運用マニュアル.HTML と マニュアル/ は outputFileTracingExcludes で明示除外されているため
REM standalone bundle に含まれない。app/manual/[[...slug]]/route.ts は
REM process.cwd() (server.js の process.chdir で .next\standalone\ に変わる) を起点に
REM 解決するので、この 2 つを standalone 直下に置く必要がある。
if not exist ".next\standalone\運用マニュアル.HTML" (
    if exist "運用マニュアル.HTML" copy /y "運用マニュアル.HTML" ".next\standalone\運用マニュアル.HTML" > nul
)
if not exist ".next\standalone\マニュアル\" (
    if exist "マニュアル" xcopy /e /q /y "マニュアル" ".next\standalone\マニュアル\" > nul
)

call node .next\standalone\server.js
set SERVER_EXIT=!ERRORLEVEL!
goto :after_server_exit


:after_server_exit
REM ================================================
REM  Shutdown / diagnostic handling (shared by both dev and standalone modes)
REM ================================================

REM If an update is in progress (updater.bat spawned by /api/update/apply),
REM close this old cmd window quickly instead of showing the 30s "will close"
REM prompt. updater.bat will launch a fresh start.bat when the new version is ready.
if exist "data\.update\updater.lock" (
    echo [UPDATE] Update in progress, closing this window quickly...
    timeout /t 2 /nobreak > nul
    exit /b 0
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
    REM successive runs don't overwrite each other.
    for /f "tokens=1-3 delims=/: " %%a in ("%TIME%") do set T=%%a%%b%%c
    for /f "tokens=1-3 delims=/- " %%a in ("%DATE%") do set D=%%a%%b%%c
    ren ".auto-shutdown.reason" ".auto-shutdown.reason.!D!_!T!" > nul 2>&1
    if exist ".heartbeat-arrivals.log" (
        ren ".heartbeat-arrivals.log" ".heartbeat-arrivals.log.!D!_!T!" > nul 2>&1
    )
) else (
    echo   No .auto-shutdown.reason file — server exited without recording a reason.
    if exist ".heartbeat-arrivals.log" del ".heartbeat-arrivals.log" > nul 2>&1
)
echo.
echo Window will close in 30 seconds. Press any key to close sooner.
timeout /t 30
exit /b 0
