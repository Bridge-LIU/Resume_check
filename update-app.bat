@echo off
setlocal
cd /d "%~dp0"

REM ================================================
REM  Interview AI Evaluation Tool - Update
REM  git pull -> npm install -> next build
REM ================================================

echo.
echo ================================================
echo   Interview AI Evaluation Tool - UPDATE
echo ================================================
echo.

REM Skip git pull if git is missing or repo has no .git
where git > nul 2>&1
if errorlevel 1 (
    echo [SKIP] git not found. Update code manually if needed.
) else (
    if exist ".git\" (
        echo [1/3] git pull...
        call git pull
        if errorlevel 1 (
            echo.
            echo [ERROR] git pull failed. Check manually.
            pause
            exit /b 1
        )
    ) else (
        echo [SKIP] Not a git repository. Skipping pull.
    )
)

echo.
echo [2/3] npm install...
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [3/3] next build...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Update finished.
echo   Launch by double-clicking one of the start-*.bat
echo   files in this folder.
echo ================================================
echo.
pause
endlocal
