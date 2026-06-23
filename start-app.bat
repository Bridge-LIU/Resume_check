@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

REM ────────────────────────────────────────────────────────────────
REM 面談AI評価ツール — ワンクリック起動
REM 設計書 §3: ローカルPC上のWebアプリ (localhost:3939)
REM ────────────────────────────────────────────────────────────────

cd /d "%~dp0"

echo.
echo ╔═══════════════════════════════════════════════╗
echo ║      面談AI評価ツール — 起動準備                 ║
echo ╚═══════════════════════════════════════════════╝
echo.

REM ── 既にポート 3939 が使われていないか確認 ──────────────────────
REM dev サーバを別窓で起動済み等のケースで二重起動エラーを防ぐ
netstat -ano | findstr "127.0.0.1:3939" | findstr "LISTENING" > nul
if not errorlevel 1 (
    echo [情報] ポート 3939 は既に使用中です。
    echo        既にサーバが動いているようです。ブラウザで開きます…
    echo.
    start "" http://localhost:3939
    timeout /t 2 /nobreak > nul
    exit /b 0
)

REM ── Node.js が入っているか確認 ──────────────────────────────────
where node > nul 2>&1
if errorlevel 1 (
    echo [エラー] Node.js が見つかりません。
    echo.
    echo Node.js 20 以上をインストールしてください:
    echo   https://nodejs.org/ja/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js !NODE_VERSION!

REM ── 依存パッケージがインストール済か確認 ─────────────────────────
if not exist "node_modules\" (
    echo.
    echo [初回セットアップ] node_modules がないので npm install します（3〜5 分かかります）
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [エラー] npm install に失敗しました。
        pause
        exit /b 1
    )
) else (
    echo [OK] node_modules
)

REM ── 本番ビルドが存在するか確認 ──────────────────────────────────
if not exist ".next\BUILD_ID" (
    echo.
    echo [初回ビルド] next build を実行します（1〜2 分かかります）
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo [エラー] ビルドに失敗しました。上のメッセージを確認してください。
        echo         型エラーや構文エラーが残っていないか開発者に確認を。
        pause
        exit /b 1
    )
) else (
    echo [OK] ビルド済
)

REM ── ブラウザを 3 秒後に開く ──────────────────────────────────
echo.
echo ╔═══════════════════════════════════════════════╗
echo ║  サーバを起動します… ブラウザが自動で開きます    ║
echo ║                                               ║
echo ║  URL : http://localhost:3939                  ║
echo ║                                               ║
echo ║  停止 : この窓を閉じる か Ctrl+C              ║
echo ╚═══════════════════════════════════════════════╝
echo.

start "" /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3939"

REM ── Next.js サーバ起動 ──────────────────────────────────────────
call npm run start

REM サーバが落ちたとき（正常終了 / ポート競合 / その他のエラー全部含む）
echo.
if errorlevel 1 (
    echo [停止] サーバの起動に失敗、または異常終了しました。
    echo        ポート 3939 が他のプロセスに使われていないか、
    echo        または npm run start のメッセージを確認してください。
) else (
    echo [停止] サーバが終了しました。
)
pause
