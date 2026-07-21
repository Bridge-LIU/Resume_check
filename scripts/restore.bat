@echo off
REM Force UTF-8 code page so Japanese/Chinese log lines don't corrupt.
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ================================================================
REM  restore.bat - v3.2 spec section 12.8.6 (Layer 2 manual recovery)
REM
REM  When updater.bat crashes / power loss / BSOD prevents auto-rollback,
REM  the user runs this to manually restore from .backup/vX.Y.Z/.
REM
REM  Modes:
REM    (no arg)  : interactive - user picks version, confirms, pauses on exit
REM    --auto    : non-interactive - pick latest backup, no prompts, no pause
REM                (invoked by start.bat when state.json is stuck applying/restoring)
REM ================================================================

set "AUTO_MODE="
if /i "%~1"=="--auto" set "AUTO_MODE=1"

cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"
set "BACKUP_ROOT=%PROJECT_ROOT%\.backup"
set "STATE_FILE=%PROJECT_ROOT%\data\.update\state.json"

echo.
echo ================================================
if defined AUTO_MODE (
    echo   Interview AI Tool - Auto Recovery
) else (
    echo   Interview AI Tool - Emergency Restore
)
echo ================================================
echo.

if not exist "%BACKUP_ROOT%" (
    echo [ERROR] No backup directory found at %BACKUP_ROOT%
    if defined AUTO_MODE (
        echo [AUTO] No local backups. Resetting state to idle and continuing.
        call :reset_state
        exit /b 0
    )
    echo.
    echo No local backups available. Options:
    echo   1. Download the previous release from:
    echo      https://github.com/Bridge-LIU/Resume_check/releases
    echo   2. Reinstall from scratch
    echo.
    pause
    exit /b 1
)

echo Available backups:
dir /b /o-d "%BACKUP_ROOT%" 2>nul | findstr /R "^v[0-9]"
echo.

REM Suggest the newest backup as default
set "LATEST="
for /f "delims=" %%a in ('dir /b /o-d "%BACKUP_ROOT%" 2^>nul ^| findstr /R "^v[0-9]"') do (
    if not defined LATEST set "LATEST=%%a"
)

if not defined LATEST (
    echo [ERROR] No valid backup found in %BACKUP_ROOT%
    if defined AUTO_MODE (
        echo [AUTO] No valid backup. Resetting state to idle and continuing.
        call :reset_state
        exit /b 0
    )
    pause
    exit /b 1
)

if defined AUTO_MODE (
    set "CHOICE=%LATEST%"
    echo [AUTO] Restoring latest backup: %LATEST%
) else (
    set /p "CHOICE=Which version to restore? [default: %LATEST%]: "
    if "!CHOICE!"=="" set "CHOICE=%LATEST%"
)

set "BACKUP_DIR=%BACKUP_ROOT%\%CHOICE%"
if not exist "%BACKUP_DIR%\manifest.json" (
    echo [ERROR] Backup not found or manifest missing: %CHOICE%
    if defined AUTO_MODE (
        echo [AUTO] Invalid backup. Resetting state to idle and continuing.
        call :reset_state
        exit /b 0
    )
    pause
    exit /b 1
)

echo.
echo Restoring %CHOICE% from %BACKUP_DIR%...
echo This will overwrite current .next/ public/ package.json / start.bat
if not defined AUTO_MODE (
    set /p "CONFIRM=Continue? (Y/N): "
    if /i not "!CONFIRM!"=="Y" (
        echo Aborted.
        pause
        exit /b 0
    )
)

REM Warn if server is still running on port 3939 (skip in --auto: start.bat
REM invokes us before starting the server, so a live server would be a stale
REM leak we should not block on).
if not defined AUTO_MODE (
    netstat -ano | findstr /C:"127.0.0.1:3939" /C:"[::1]:3939" | findstr "LISTENING" >nul
    if not errorlevel 1 (
        echo.
        echo [WARNING] Server is currently running on port 3939.
        echo Please close the server window before continuing.
        pause
    )
)

echo.
echo Removing current version...
if exist "%PROJECT_ROOT%\.next" rmdir /s /q "%PROJECT_ROOT%\.next"
if exist "%PROJECT_ROOT%\public" rmdir /s /q "%PROJECT_ROOT%\public"
if exist "%PROJECT_ROOT%\package.json" del /q "%PROJECT_ROOT%\package.json"
if exist "%PROJECT_ROOT%\package-lock.json" del /q "%PROJECT_ROOT%\package-lock.json"

echo Restoring from backup...
if exist "%BACKUP_DIR%\.next" (
    robocopy "%BACKUP_DIR%\.next" "%PROJECT_ROOT%\.next" /E /R:2 /W:2 /NFL /NDL /NJH /NJS
)
if exist "%BACKUP_DIR%\public" (
    robocopy "%BACKUP_DIR%\public" "%PROJECT_ROOT%\public" /E /R:2 /W:2 /NFL /NDL /NJH /NJS
)
if exist "%BACKUP_DIR%\package.json" copy /y "%BACKUP_DIR%\package.json" "%PROJECT_ROOT%\package.json" >nul
if exist "%BACKUP_DIR%\package-lock.json" copy /y "%BACKUP_DIR%\package-lock.json" "%PROJECT_ROOT%\package-lock.json" >nul
if exist "%BACKUP_DIR%\start.bat" copy /y "%BACKUP_DIR%\start.bat" "%PROJECT_ROOT%\start.bat" >nul

REM Clean state.json / lock
if exist "%PROJECT_ROOT%\data\.update\state.json" (
    > "%PROJECT_ROOT%\data\.update\state.json" echo {"phase":"idle"}
)
if exist "%PROJECT_ROOT%\data\.update\updater.lock" del /q "%PROJECT_ROOT%\data\.update\updater.lock"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"

echo.
echo ================================================
echo   Restore complete: %CHOICE%
if defined AUTO_MODE (
    echo   Continuing startup with restored version.
) else (
    echo   Please run start.bat to launch the restored version.
)
echo ================================================
echo.
if not defined AUTO_MODE pause
exit /b 0

:reset_state
REM Force state.json back to idle so start.bat / UI polling stop waiting.
REM Also remove any stale updater lock.
if exist "%STATE_FILE%" (
    > "%STATE_FILE%" echo {"phase":"idle"}
)
if exist "%PROJECT_ROOT%\data\.update\updater.lock" del /q "%PROJECT_ROOT%\data\.update\updater.lock"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"
exit /b 0
