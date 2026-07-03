@echo off
REM ============================================================
REM  Claude Code 3-split launcher (3 equal vertical columns)
REM  Usage: claude-3split.bat [working_directory]
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

REM ----- 1x3 equal vertical split (left / middle / right) -----
REM CLAUDE_CODE_NO_FLICKER=1: enables mouse-click cursor positioning, text selection,
REM and click-to-expand tool results inside Claude Code
REM 1) Claude-1 (starts as full width)
REM 2) Split -V -s 0.333 -> Claude-2 on the right takes 1/3; Claude-1 keeps 2/3
REM 3) move-focus left back to Claude-1 (avoid the focus-follows-new-pane quirk
REM    that made the earlier 0.667+0.5 chain skew to 1/6:1/6:4/6)
REM 4) Split -V -s 0.5 -> Claude-3 splits Claude-1's 2/3 in half
REM    Final left-to-right order: Claude-1 | Claude-3 | Claude-2, each 1/3
wt -w new new-tab -d "%WORKDIR%" --title "Claude-1" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude" ^
  ; split-pane -V -s 0.333 -d "%WORKDIR%" --title "Claude-2" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude" ^
  ; move-focus left ^
  ; split-pane -V -s 0.5 -d "%WORKDIR%" --title "Claude-3" cmd /k "set CLAUDE_CODE_NO_FLICKER=1 && claude"

endlocal
exit /b 0
