@echo off
setlocal enabledelayedexpansion

call :main
set EXITCODE=!ERRORLEVEL!

echo.
echo Press any key to close...
pause > nul
endlocal & exit /b %EXITCODE%


:main
REM ================================================
REM  Seed Fake Sessions (no API)
REM  scripts/seed-sessions.mjs
REM   - reads data/master/roles/*.json + eval_criteria.json
REM   - generates realistic sessions into data/sessions/
REM ================================================

cd /d "%~dp0"

echo.
echo ================================================
echo   Seed Fake Sessions - offline generator
echo   Reads current master data. No API calls.
echo ================================================
echo.

REM Node.js check
where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node 20+ from https://nodejs.org/
    exit /b 1
)

REM Ask for count
set /p COUNT_INPUT="How many sessions? (default 20): "
if "%COUNT_INPUT%"=="" (
    set COUNT=20
) else (
    set COUNT=%COUNT_INPUT%
)

REM Sanity check: must be numeric
echo %COUNT%| findstr /r "^[0-9][0-9]*$" > nul
if errorlevel 1 (
    echo [ERROR] "%COUNT%" is not a valid number.
    exit /b 1
)

REM Master data check
if not exist "data\master\roles" (
    echo [WARN] data\master\roles\ not found.
    echo        Nothing to generate from. Set up roles first via /master.
    exit /b 1
)

if not exist "data\master\eval_criteria.json" (
    echo [WARN] data\master\eval_criteria.json not found.
    echo        Nothing to generate from. Set up eval criteria first via /master.
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
