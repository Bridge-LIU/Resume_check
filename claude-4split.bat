@echo off
REM ============================================================
REM  Claude Code 4-split launcher (equal 2x2 grid)
REM  Usage: claude-4split.bat [working_directory]
REM ============================================================

setlocal

set "WORKDIR=%~1"
if "%WORKDIR%"=="" set "WORKDIR=%~dp0."

REM Make sure npm global bin is on PATH (where claude.cmd usually lives)
set "PATH=%APPDATA%\npm;%PATH%"

where wt.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows Terminal ^(wt.exe^) not found.
    pause
    exit /b 1
)

where claude >nul 2>nul
if errorlevel 1 (
    where claude.cmd >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] "claude" command not found in PATH.
        pause
        exit /b 1
    )
)

REM ----- 2x2 equal grid -----
REM CLAUDE_CODE_NO_FLICKER=1: enables mouse-click cursor positioning, text selection,
REM and click-to-expand tool results inside Claude Code
REM 1) Top pane (Claude-1)
REM 2) Split horizontally (-H) at 50%% -> bottom pane (Claude-2)
REM 3) move-focus up  -> split vertically (-V) at 50%% -> Claude-3
REM 4) move-focus down-> split vertically (-V) at 50%% -> Claude-4
wt -w new new-tab -d "%WORKDIR%" --title "Claude-1" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude" ^
  ; split-pane -H -s 0.5 -d "%WORKDIR%" --title "Claude-2" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude" ^
  ; move-focus up ^
  ; split-pane -V -s 0.5 -d "%WORKDIR%" --title "Claude-3" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude" ^
  ; move-focus down ^
  ; split-pane -V -s 0.5 -d "%WORKDIR%" --title "Claude-4" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude"

endlocal
exit /b 0
