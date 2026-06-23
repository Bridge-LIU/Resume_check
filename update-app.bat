@echo off
chcp 65001 > nul
setlocal

REM ────────────────────────────────────────────────────────────────
REM 面談AI評価ツール — 更新
REM コードを最新にして再ビルド（git pull → npm install → next build）
REM ────────────────────────────────────────────────────────────────

cd /d "%~dp0"

echo.
echo ╔═══════════════════════════════════════════════╗
echo ║  面談AI評価ツール — 更新                       ║
echo ╚═══════════════════════════════════════════════╝
echo.

REM ── git があるなら pull、無いなら手動更新を促す ────────────────
where git > nul 2>&1
if errorlevel 1 (
    echo [スキップ] git が見つかりません。コード更新は手動で実施してください。
) else (
    if exist ".git\" (
        echo [1/3] git pull...
        call git pull
        if errorlevel 1 (
            echo.
            echo [エラー] git pull に失敗しました。手動で確認してください。
            pause
            exit /b 1
        )
    ) else (
        echo [スキップ] git リポジトリではないので pull しません。
    )
)

echo.
echo [2/3] npm install...
call npm install
if errorlevel 1 (
    echo.
    echo [エラー] npm install に失敗しました。
    pause
    exit /b 1
)

echo.
echo [3/3] next build...
call npm run build
if errorlevel 1 (
    echo.
    echo [エラー] ビルドに失敗しました。
    pause
    exit /b 1
)

echo.
echo ╔═══════════════════════════════════════════════╗
echo ║  更新完了。start-app.bat で起動してください。  ║
echo ╚═══════════════════════════════════════════════╝
echo.
pause
