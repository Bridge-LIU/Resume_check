#!/usr/bin/env bash
# 操作マニュアル用に各画面のスクショを Chrome ヘッドレスで自動撮影する。
# 前提: dev server (http://127.0.0.1:3939) が動いていること。
# 出力先: manual/assets/  （manual/操作マニュアル.html から <img src="assets/xxx.png"> で参照）
# 実行: bash scripts/manual-screenshot.sh

set -euo pipefail

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/manual/assets"
BASE="http://127.0.0.1:${PORT:-3939}"

DATA_ROOT="$REPO_ROOT/data"
SESSIONS_ROOT="$DATA_ROOT/sessions"

# session 詳細用：まず 測試 で始まるセッションを優先、無ければ任意の評価済セッション
SESSION_ID_RAW="$(ls "$SESSIONS_ROOT" | grep "測試" | head -1 || true)"
if [[ -z "$SESSION_ID_RAW" ]]; then
  # 評価済（evaluation.json 存在）から 1 件選ぶ
  SESSION_ID_RAW="$(ls "$SESSIONS_ROOT" | while read -r d; do
    [[ -f "$SESSIONS_ROOT/$d/evaluation.json" ]] && echo "$d"
  done | head -1)"
fi
if [[ -z "$SESSION_ID_RAW" ]]; then
  echo "⚠ 有効なセッションが見つかりません。先に新規面談を作ってください。"
  exit 1
fi
SESSION_ID_ENC="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$SESSION_ID_RAW")"
echo "📋 セッション詳細用: $SESSION_ID_RAW"

# 横断比較用: 評価済セッションのID をカンマ連結（URL エンコード後）で最大 N 件収集
collect_compare_ids() {
  local max=$1
  local ids=""
  local count=0
  while IFS= read -r d; do
    if [[ -f "$SESSIONS_ROOT/$d/evaluation.json" ]]; then
      local enc
      enc="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$d")"
      if [[ -z "$ids" ]]; then
        ids="$enc"
      else
        ids="${ids}%2C${enc}"  # %2C = , (URL encoded)
      fi
      count=$((count + 1))
      [[ $count -ge $max ]] && break
    fi
  done < <(ls "$SESSIONS_ROOT")
  echo "$ids|$count"
}

COMPARE_SMALL="$(collect_compare_ids 3)"
COMPARE_SMALL_IDS="${COMPARE_SMALL%|*}"
COMPARE_SMALL_N="${COMPARE_SMALL##*|}"
COMPARE_LARGE="$(collect_compare_ids 7)"
COMPARE_LARGE_IDS="${COMPARE_LARGE%|*}"
COMPARE_LARGE_N="${COMPARE_LARGE##*|}"
echo "📊 標準ビュー用: $COMPARE_SMALL_N 件 / 転置ビュー用: $COMPARE_LARGE_N 件"
if [[ $COMPARE_SMALL_N -lt 2 ]]; then
  echo "⚠ 評価済が 2 件未満のため標準ビュー画像が空になります。"
fi
if [[ $COMPARE_LARGE_N -lt 7 ]]; then
  echo "⚠ 評価済が 7 件未満のため転置ビュー画像は撮影しません。"
fi

# shoot <name> <width> <height> <url>
shoot() {
  local name="$1"
  local width="$2"
  local height="$3"
  local url="$4"
  local out="$OUT_DIR/$name.png"
  echo "📸 [${width}x${height}] $name"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --window-size="${width},${height}" \
    --screenshot="$out" \
    --virtual-time-budget=3000 \
    "$url" 2>/dev/null
}

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.png

# ホーム画面（ダッシュボード）— / = home に変わったため追加
shoot "home"      1200 1000 "$BASE/"

# 短いページ
shoot "list"      1200 700  "$BASE/list"
shoot "new"       1200 600  "$BASE/new"
shoot "trash"     1200 600  "$BASE/trash"

# 中程度
shoot "master"    1200 1400 "$BASE/master"
shoot "settings"  1200 2000 "$BASE/settings"
shoot "cost"      1200 1200 "$BASE/cost"
shoot "analytics" 1200 1500 "$BASE/analytics"

# 比較（標準ビュー: 3 件、レーダーチャート + 軸別テーブル）
shoot "compare"   1200 1400 "$BASE/compare?ids=$COMPARE_SMALL_IDS"
# 比較（転置ビュー: 7 件以上のときのみ）
if [[ $COMPARE_LARGE_N -ge 7 ]]; then
  shoot "compare-transposed" 1200 750 "$BASE/compare?ids=$COMPARE_LARGE_IDS"
fi

# セッション詳細（長い、全 5 セクション含む）
shoot "session"   1200 3600 "$BASE/sessions/$SESSION_ID_ENC"

echo ""
echo "✅ 完了。$OUT_DIR/"
ls -la "$OUT_DIR" | grep png
