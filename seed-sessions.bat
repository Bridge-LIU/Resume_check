@echo off
setlocal enabledelayedexpansion

call :main
set EXITCODE=!ERRORLEVEL!

echo.
echo Press any key to close...
pause > nul
endlocal ^& exit /b %EXITCODE%


:main
REM ================================================
REM  面談AI評価ツール - リアル面談セッション生成
REM  scripts/seed-sessions.mjs を実行
REM   - data/master/roles/*.json + eval_criteria.json を読み
REM   - persona 駆動でリアルな面談レコードを N 件生成
REM ================================================

cd /d "%~dp0"

echo.
echo ================================================
echo   Seed Sessions - persona-driven generator
echo   Reads current master data. No API calls.
echo ================================================
echo.

REM Node.js check
where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node 20+ from https://nodejs.org/
    exit /b 1
)

REM 件数の入力
set /p COUNT_INPUT="How many sessions? (default 30): "
if "%COUNT_INPUT%"=="" (
    set COUNT=30
) else (
    set COUNT=%COUNT_INPUT%
)

REM 入力チェック
echo %COUNT%| findstr /r "^[0-9][0-9]*$" > nul
if errorlevel 1 (
    echo [ERROR] "%COUNT%" is not a valid number.
    exit /b 1
)

REM master 存在チェック
if not exist "data\master\roles" (
    echo [WARN] data\master\roles\ not found.
    echo        Set up roles first via /master.
    exit /b 1
)

if not exist "data\master\eval_criteria.json" (
    echo [WARN] data\master\eval_criteria.json not found.
    echo        Set up eval criteria first via /master.
    exit /b 1
)

echo.
echo [RUN] node scripts/seed-sessions.mjs %COUNT%
echo.

call node scripts\seed-sessions.mjs %COUNT%
set SCRIPT_EXIT=!ERRORLEVEL!

if not "!SCRIPT_EXIT!"=="0" (
    echo.
    echo [ERROR] Seed script failed with code !SCRIPT_EXIT!
    exit /b !SCRIPT_EXIT!
)

echo.
echo ================================================
echo   Done. %COUNT% sessions written to data\sessions\
echo   Open http://localhost:3939/list to see them.
echo ================================================
exit /b 0
