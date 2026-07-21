# 面談AI評価ツール

採用面談の主催・評価をローカル PC で完結させるためのツール。Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 で実装。データは PII 保護のため PC 内 (`data/`) に保存し、外部送信は API モード時の LLM 呼び出しのみ。

## クイックスタート

```powershell
npm install
npm run dev    # http://localhost:3939 で開発サーバ
```

エンドユーザ向けの起動は `start.bat` をダブルクリック（初回のみ `npm install` + `next build`、以降はビルド済みで数秒起動）。操作マニュアルは `運用マニュアル.HTML` をダブルクリック、もしくはアプリ起動後に `/manual` からも同じ内容を配信。

## モード

各セクション（面談者情報 / 質問リスト / 評価）は **貼付** と **API** をユーザが切り替えて使います。

- **貼付モード** — ChatGPT / Claude 側で処理してテキストを貼り付ける。API キー不要。
- **API モード** — `/settings` で設定した Provider (Anthropic / OpenAI / Google) を直接呼ぶ。使用状況は `/cost` で集計。



Next.js 16 は `params` / `searchParams` が Promise になるなど破壊的変更があるため、`node_modules/next/dist/docs/` を必ず参照してください（AGENTS.md 冒頭）。
