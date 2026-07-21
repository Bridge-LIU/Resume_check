@echo off
REM Force UTF-8 code page so Japanese/Chinese comments and log lines don't corrupt.
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ================================================================
REM  updater.bat - v3.2 spec section 12.8.9.6 (standalone 3-step)
REM
REM  Args:
REM    %1 = staging ZIP full path
REM    %2 = staging extract directory (created if missing)
REM    %3 = new version (e.g. "0.2.0")
REM    %4 = old version (e.g. "0.1.0")
REM
REM  Log tee: all progress appended to data\.update\updater.log.
REM  UI /api/update/progress tails last 30 lines to modal cmd log.
REM
REM  On failure: goto :rollback, restore from .backup\v<OLD_VER>\.
REM ================================================================

set "ZIP_PATH=%~1"
set "EXTRACT_DIR=%~2"
set "NEW_VER=%~3"
set "OLD_VER=%~4"

cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"
set "DATA_UPDATE_DIR=%PROJECT_ROOT%\data\.update"
set "LOG_FILE=%DATA_UPDATE_DIR%\updater.log"
set "BACKUP_DIR=%PROJECT_ROOT%\.backup\v%OLD_VER%"
set "LOCK_FILE=%DATA_UPDATE_DIR%\updater.lock"

REM Version format check (Node side also validates; belt + suspenders)
echo %NEW_VER%| findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo [ERROR] Invalid new version format: %NEW_VER%
    exit /b 1
)
echo %OLD_VER%| findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo [ERROR] Invalid old version format: %OLD_VER%
    exit /b 1
)

REM Prepare data\.update and log
if not exist "%DATA_UPDATE_DIR%" mkdir "%DATA_UPDATE_DIR%"
> "%LOG_FILE%" echo [%DATE% %TIME%] updater.bat started (v%OLD_VER% to v%NEW_VER%)

REM Lock (start.bat checks these to reject concurrent launch)
> "%LOCK_FILE%" echo %DATE% %TIME% pid=%RANDOM%
if not exist "%PROJECT_ROOT%\.update" mkdir "%PROJECT_ROOT%\.update"
> "%PROJECT_ROOT%\.update\updater.lock" echo %DATE% %TIME% pid=%RANDOM%

call :log "================================================"
call :log "  Interview AI Tool Updater v3.2 (standalone)"
call :log "  v%OLD_VER% to v%NEW_VER%"
call :log "================================================"

REM Give the previous server time to release file locks
call :log "Waiting 5s for previous server to release file locks..."
timeout /t 5 /nobreak >nul

REM ================================================================
REM  [Pre] Extract ZIP
REM ================================================================
call :log "[Pre] Extracting %ZIP_PATH% to %EXTRACT_DIR%..."
if not exist "%EXTRACT_DIR%" mkdir "%EXTRACT_DIR%"

REM Windows 10 1803+ built-in tar can extract ZIP
tar -xf "%ZIP_PATH%" -C "%EXTRACT_DIR%"
if errorlevel 1 (
    call :log "[ERROR] ZIP extraction failed"
    goto :rollback_no_backup
)
call :log "[Pre] Extraction complete"

REM ================================================================
REM  [0/3] Backup old files (move-first, near-instant)
REM  In standalone install, project root has only:
REM    .next\ public\ package.json start.bat scripts\
REM  No app\ lib\ node_modules\ at root in standalone distribution.
REM ================================================================
call :log "[0/3] Backing up v%OLD_VER% to .backup\v%OLD_VER%\..."
if exist "%BACKUP_DIR%" (
    call :log "  Removing stale backup dir..."
    rmdir /s /q "%BACKUP_DIR%"
)
mkdir "%BACKUP_DIR%"
if errorlevel 1 (
    call :log "[ERROR] Failed to create backup dir"
    goto :rollback_no_backup
)

call :move_to_backup ".next"
if errorlevel 1 goto :undo_backup
call :move_to_backup "public"
if errorlevel 1 goto :undo_backup
call :move_to_backup "package.json"
if errorlevel 1 goto :undo_backup
call :move_to_backup "package-lock.json"
if errorlevel 1 goto :undo_backup
call :move_to_backup "start.bat"
if errorlevel 1 goto :undo_backup

REM Write manifest
> "%BACKUP_DIR%\manifest.json" echo {"version":"%OLD_VER%","backedUpAt":"%DATE% %TIME%","reason":"pre-update"}

call :log "[0/3] Backup complete"

REM ================================================================
REM  [1/3] Copy new files into project root
REM ================================================================
call :log "[1/3] Installing new files from %EXTRACT_DIR%..."

REM robocopy exit codes: 0-7 = success, 8+ = failure
if exist "%EXTRACT_DIR%\.next" (
    robocopy "%EXTRACT_DIR%\.next" "%PROJECT_ROOT%\.next" /E /R:2 /W:2 /NFL /NDL /NJH /NJS
    if errorlevel 8 (
        call :log "[ERROR] robocopy .next failed"
        goto :rollback
    )
) else (
    call :log "[ERROR] Extract dir does not contain .next - not a standalone package"
    goto :rollback
)

if exist "%EXTRACT_DIR%\public" (
    robocopy "%EXTRACT_DIR%\public" "%PROJECT_ROOT%\public" /E /R:2 /W:2 /NFL /NDL /NJH /NJS
    if errorlevel 8 goto :rollback
)

if exist "%EXTRACT_DIR%\package.json" (
    copy /y "%EXTRACT_DIR%\package.json" "%PROJECT_ROOT%\package.json" >nul
    if errorlevel 1 goto :rollback
)
if exist "%EXTRACT_DIR%\package-lock.json" (
    copy /y "%EXTRACT_DIR%\package-lock.json" "%PROJECT_ROOT%\package-lock.json" >nul
)
if exist "%EXTRACT_DIR%\start.bat" (
    copy /y "%EXTRACT_DIR%\start.bat" "%PROJECT_ROOT%\start.bat" >nul
    if errorlevel 1 goto :rollback
)
if exist "%EXTRACT_DIR%\scripts" (
    robocopy "%EXTRACT_DIR%\scripts" "%PROJECT_ROOT%\scripts" /E /R:2 /W:2 /NFL /NDL /NJH /NJS
    if errorlevel 8 goto :rollback
)

REM Manual files (unicode-named HTML + folder). Delegated to PowerShell because
REM bat files must stay ASCII per AGENTS.md (CP932 vs UTF-8 parsing hazard).
if exist "%EXTRACT_DIR%\scripts\update-copy-manual.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%EXTRACT_DIR%\scripts\update-copy-manual.ps1" -ExtractDir "%EXTRACT_DIR%" -ProjectRoot "%PROJECT_ROOT%"
    if errorlevel 1 (
        call :log "[ERROR] manual copy failed"
        goto :rollback
    )
)

call :log "[1/3] New files installed"

REM ================================================================
REM  [2/3] SKIP - standalone bundles are self-contained
REM ================================================================
call :log "[2/3] Skipping npm install / build (standalone bundled)"

REM ================================================================
REM  [3/3] Files ready. start.bat (the caller) will relaunch the server.
REM  This bat does NOT spawn a new cmd -- control returns to start.bat's
REM  :after_server_exit block, which loops back to :main and starts the
REM  new server IN THE SAME cmd window (no flash, no popup).
REM
REM  Server readiness verification is handled by lib/updater.ts:selfHealOnBoot()
REM  which runs at server startup. It compares getCurrentVersion() with
REM  state.applying.to and transitions state.json to idle + success-flag when
REM  the new server actually reports the expected version.
REM ================================================================
call :log "[3/3] Files installed. Returning to start.bat for server relaunch..."
goto :success

REM ================================================================
REM  Success -- files are in place, control returns to start.bat.
REM  We do NOT write state=idle here. Instead, we leave state=applying so
REM  UI keeps showing progress while the server restarts, and let
REM  lib/updater.ts:selfHealOnBoot() write state=idle + success-flag once
REM  the new server actually boots and confirms getCurrentVersion() == to.
REM ================================================================
:success
call :log "================================================"
call :log "  Update files installed: v%OLD_VER% to v%NEW_VER%"
call :log "  Returning to start.bat for server relaunch..."
call :log "================================================"
REM previous-version.txt
> "%DATA_UPDATE_DIR%\previous-version.txt" echo %OLD_VER%

REM Remove locks
if exist "%LOCK_FILE%" del /q "%LOCK_FILE%"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"

REM Staging cleanup
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
if exist "%ZIP_PATH%" del /q "%ZIP_PATH%"

if exist "%TEMP%\updater_ver.json" del /q "%TEMP%\updater_ver.json"
if exist "%TEMP%\updater_code.txt" del /q "%TEMP%\updater_code.txt"

exit /b 0

REM ================================================================
REM  Rollback (backup exists - standard path)
REM ================================================================
:rollback
call :log "================================================"
call :log "  [ROLLBACK] Restoring v%OLD_VER%..."
call :log "================================================"

> "%DATA_UPDATE_DIR%\state.json" echo {"phase":"restoring","from":"%OLD_VER%","to":"%NEW_VER%","startedAt":"%DATE% %TIME%"}

call :log "  Removing failed new files..."
if exist "%PROJECT_ROOT%\.next" rmdir /s /q "%PROJECT_ROOT%\.next"
if exist "%PROJECT_ROOT%\public" rmdir /s /q "%PROJECT_ROOT%\public"
if exist "%PROJECT_ROOT%\package.json" del /q "%PROJECT_ROOT%\package.json"
if exist "%PROJECT_ROOT%\package-lock.json" del /q "%PROJECT_ROOT%\package-lock.json"

call :log "  Restoring from backup..."
if exist "%BACKUP_DIR%\.next" move "%BACKUP_DIR%\.next" "%PROJECT_ROOT%\.next" >nul
if exist "%BACKUP_DIR%\public" move "%BACKUP_DIR%\public" "%PROJECT_ROOT%\public" >nul
if exist "%BACKUP_DIR%\package.json" move "%BACKUP_DIR%\package.json" "%PROJECT_ROOT%\package.json" >nul
if exist "%BACKUP_DIR%\package-lock.json" move "%BACKUP_DIR%\package-lock.json" "%PROJECT_ROOT%\package-lock.json" >nul
if exist "%BACKUP_DIR%\start.bat" move "%BACKUP_DIR%\start.bat" "%PROJECT_ROOT%\start.bat" >nul

> "%DATA_UPDATE_DIR%\state.json" echo {"phase":"error","message":"Update failed, rolled back to v%OLD_VER%","phaseFailed":"applying","at":"%DATE% %TIME%","rollbackZipPath":"%BACKUP_DIR%"}

if exist "%LOCK_FILE%" del /q "%LOCK_FILE%"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"

call :log "[ROLLBACK] Complete. Starting old start.bat..."
start "" cmd /c "start.bat"

exit /b 1

REM ================================================================
REM  Rollback for pre-backup failures (nothing to restore)
REM ================================================================
:rollback_no_backup
call :log "[ERROR] Failure before backup phase, no rollback needed"
> "%DATA_UPDATE_DIR%\state.json" echo {"phase":"error","message":"ZIP extraction or init failed","phaseFailed":"applying","at":"%DATE% %TIME%"}
if exist "%LOCK_FILE%" del /q "%LOCK_FILE%"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"
start "" cmd /c "start.bat"
exit /b 1

REM ================================================================
REM  Undo backup (partial move failure during [0/3])
REM ================================================================
:undo_backup
call :log "[ERROR] Backup phase failed, rolling back moved items..."
if exist "%BACKUP_DIR%\.next" move "%BACKUP_DIR%\.next" "%PROJECT_ROOT%\.next" >nul 2>&1
if exist "%BACKUP_DIR%\public" move "%BACKUP_DIR%\public" "%PROJECT_ROOT%\public" >nul 2>&1
if exist "%BACKUP_DIR%\package.json" move "%BACKUP_DIR%\package.json" "%PROJECT_ROOT%\package.json" >nul 2>&1
if exist "%BACKUP_DIR%\package-lock.json" move "%BACKUP_DIR%\package-lock.json" "%PROJECT_ROOT%\package-lock.json" >nul 2>&1
if exist "%BACKUP_DIR%\start.bat" move "%BACKUP_DIR%\start.bat" "%PROJECT_ROOT%\start.bat" >nul 2>&1
if exist "%BACKUP_DIR%" rmdir /s /q "%BACKUP_DIR%"
> "%DATA_UPDATE_DIR%\state.json" echo {"phase":"error","message":"Backup phase failed","phaseFailed":"applying","at":"%DATE% %TIME%"}
if exist "%LOCK_FILE%" del /q "%LOCK_FILE%"
if exist "%PROJECT_ROOT%\.update\updater.lock" del /q "%PROJECT_ROOT%\.update\updater.lock"
start "" cmd /c "start.bat"
exit /b 1

REM ================================================================
REM  Subroutines
REM ================================================================
:log
echo %~1
>> "%LOG_FILE%" echo [%TIME%] %~1
goto :eof

:move_to_backup
REM %1 = source path relative to project root
set "_src=%PROJECT_ROOT%\%~1"
set "_dst=%BACKUP_DIR%\%~1"
if not exist "%_src%" (
    call :log "  skip move (not exist): %~1"
    exit /b 0
)
call :log "  move %~1 to .backup\v%OLD_VER%\%~1"
move "%_src%" "%_dst%" >nul
if errorlevel 1 (
    timeout /t 3 /nobreak >nul
    move "%_src%" "%_dst%" >nul
    if errorlevel 1 (
        call :log "  [ERROR] move failed: %~1"
        exit /b 1
    )
)
exit /b 0
