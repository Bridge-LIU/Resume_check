@echo off
setlocal enabledelayedexpansion

REM ================================================================
REM  restore.bat - v3.2 spec §12.8.6 準拠（Layer 2 手動救援）
REM
REM  updater.bat が崩れた / 電源断 / ブルースクリーン等で
REM  自動 rollback が回らなかった時にユーザーが手動で実行する。
REM  .backup/vX.Y.Z/ から選択して復元。
REM ================================================================

cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"
set "BACKUP_ROOT=%PROJECT_ROOT%\.backup"

echo.
echo ================================================
echo   Interview AI Tool - Emergency Restore
echo ================================================
echo.

if not exist "%BACKUP_ROOT%" (
    echo [ERROR] No backup directory found at %BACKUP_ROOT%
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

REM 最新のバックアップをデフォルト提案
set "LATEST="
for /f "delims=" %%a in ('dir /b /o-d "%BACKUP_ROOT%" 2^>nul ^| findstr /R "^v[0-9]"') do (
    if not defined LATEST set "LATEST=%%a"
)

if not defined LATEST (
    echo [ERROR] No valid backup found in %BACKUP_ROOT%
    pause
    exit /b 1
)

set /p "CHOICE=Which version to restore? [default: %LATEST%]: "
if "%CHOICE%"=="" set "CHOICE=%LATEST%"

set "BACKUP_DIR=%BACKUP_ROOT%\%CHOICE%"
if not exist "%BACKUP_DIR%\manifest.json" (
    echo [ERROR] Backup not found or manifest missing: %CHOICE%
    pause
    exit /b 1
)

echo.
echo Restoring %CHOICE% from %BACKUP_DIR%...
echo This will overwrite current .next/ public/ package.json / start.bat
set /p "CONFIRM=Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Aborted.
    pause
    exit /b 0
)

REM Port 3939 の実行中サーバを確認、あれば停止するようユーザーに促す
netstat -ano | findstr /C:"127.0.0.1:3939" /C:"[::1]:3939" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo [WARNING] Server is currently running on port 3939.
    echo Please close the server window before continuing.
    pause
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

REM state.json / lock を clean
if exist "%PROJECT_ROOT%\data\.update\state.json" (
    > "%PROJECT_ROOT%\data\.update\state.json" echo {"phase":"idle"}
)
if exist "%PROJECT_ROOT%\data\.update\updater.lock" del /q "%PROJECT_ROOT%\data\.update\updater.lock"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"

echo.
echo ================================================
echo   Restore complete: %CHOICE%
echo   Please run start.bat to launch the restored version.
echo ================================================
echo.
pause
exit /b 0
