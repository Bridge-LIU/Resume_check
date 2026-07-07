<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 面談AI評価ツール — エージェント作業規約

このプロジェクトを触る前に**必ずこのファイルを読む**こと。

## ⚠️ Next.js 16 の必読事項

`params` / `searchParams` は **Promise**。必ず `await`。

```tsx
// page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}

// route.ts
export async function GET(_req: Request, ctx: RouteContext<'/api/sessions/[id]'>) {
  const { id } = await ctx.params;
}
```

`RouteContext<'/path'>` はグローバル型（import 不要）。詳細は `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` 参照。

## プロジェクト概要

- 採用面談ツールのローカル版。Phase 1 は全工程「貼付モード」で稼働中。
- API モード（②要約 / ⑤質問 / ⑥要約 / ⑧評価）は実装済だが UI 上は非表示（Phase 2 で有効化予定）。
- 設計書: `files/面談AI評価ツール_設計書.md`
- スタック: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + npm / ポート 3939
- UI 方針: 業務標準・表中心。**実装が正本**（過去の mockup HTML は削除済）。

## ディレクトリ規約

```
Resume_Claude/
├─ app/
│   ├─ layout.tsx           ← 共通レイアウト（ヘッダ＋ナビ）
│   ├─ globals.css          ← 共通CSS + .pill-* タグ色
│   ├─ error.tsx            ← グローバルエラー境界
│   ├─ loading.tsx          ← 一覧スケルトン
│   ├─ page.tsx             ← / 面談一覧
│   ├─ _components/         ← 一覧用クライアント部品
│   ├─ new/                 ← /new 新規面談
│   │   ├─ page.tsx
│   │   ├─ actions.ts       ← createSessionAction
│   │   └─ _components/
│   ├─ sessions/[id]/       ← /sessions/[id] セッション
│   │   ├─ page.tsx
│   │   ├─ actions.ts       ← 各セクション保存・状態遷移
│   │   ├─ loading.tsx      ← セクションスケルトン
│   │   ├─ not-found.tsx    ← セッション欠落時の画面
│   │   └─ _components/     ← ②④⑤⑥⑧ セクション UI
│   ├─ master/              ← /master 役割マスタ＋評価条件
│   ├─ settings/            ← /settings 設定
│   │   ├─ page.tsx         ← updateSettings (Server Action)
│   │   ├─ actions.ts
│   │   └─ _components/
│   ├─ analytics/           ← /analytics 匿名サマリ分析
│   ├─ compare/             ← /compare 横断比較ビュー
│   ├─ cost/                ← /cost API コスト集計（設計書 §8.5）
│   ├─ trash/               ← /trash ゴミ箱（設計書 §7.5）
│   └─ api/                 ← Route Handlers（backup/master 系）
├─ components/ui/           ← shadcn 由来 UI 部品
├─ lib/
│   ├─ types.ts             ← 共通型（必ずここから import）
│   ├─ storage.ts           ← fs アクセス層（必ずここを通す）
│   ├─ validation.ts        ← 入力検証（Server Action サイズ上限 / Role / EvalCriteria）
│   ├─ apiError.ts          ← Route Handler 共通エラー
│   ├─ auditLog.ts          ← 監査ログ
│   ├─ backup.ts            ← AES-256-GCM バックアップ
│   ├─ retention.ts         ← 保存期間（自動削除）
│   ├─ retentionScheduler.ts
│   ├─ analytics.ts         ← 匿名サマリ集計
│   ├─ costEstimate.ts      ← API コスト推算
│   ├─ pricing.ts
│   ├─ documentExtract.ts   ← PDF/DOCX/XLSX → テキスト
│   ├─ resumeKind.ts
│   ├─ excelMirror.ts       ← master.xlsx / sessions.xlsx 自動生成
│   ├─ questionParser.ts    ← ⑤質問テキスト → 構造化
│   ├─ summaryFormat.ts
│   ├─ crashGuard.ts
│   └─ llm/                 ← API モード実装（UI 非公開）
├─ config/settings.json     ← API キー / dataRoot / 保存期間設定
├─ data/                    ← settings.dataRoot のデフォルト
│   ├─ master/roles/<id>.json
│   ├─ master/eval_criteria.json
│   ├─ sessions/<id>/
│   │   ├─ session.json
│   │   ├─ candidate.json
│   │   ├─ conditions_snapshot.json
│   │   ├─ questions.json
│   │   ├─ minutes.json
│   │   └─ evaluation.json
│   └─ analytics/<idHash>.json
├─ manual/                  ← エンドユーザ向けマニュアル一式
│   ├─ 運用ガイド.md         ← インストール / 起動 / データ場所 / トラブル
│   ├─ 操作マニュアル.html   ← 画面操作の視覚マニュアル
│   ├─ assets/               ← マニュアル用画面ショット
│   └─ screenshot.sh         ← 画面ショット撮り直しスクリプト
├─ scripts/                 ← 開発・運用補助スクリプト（seed / decrypt-backup 等）
├─ public/                  ← 静的資源
└─ files/                   ← 設計書・サンプル面談データ・履歴書チェック（gitignore）
    └─ 面談AI評価ツール_設計書.md
```

### 根直下のフォルダ / ファイル一覧

| 対象 | 用途 | git |
|---|---|---|
| `app/` | Next.js App Router — 全ページ | ✅ |
| `components/` | 共用 UI 部品（shadcn 系） | ✅ |
| `lib/` | サーバー側ロジック | ✅ |
| `config/` | 設定ファイル | 🚫 gitignore（APIキー保護） |
| `data/` | ユーザーデータ（PII） | 🚫 gitignore |
| `files/` | 設計書・サンプル | 🚫 gitignore |
| `manual/` | エンドユーザ向けマニュアル | ✅ |
| `scripts/` | 開発・運用補助スクリプト | ✅ |
| `public/` | 静的資源 | ✅ |
| `.preview/` | ローカル画面ショット・mockup | 🚫 gitignore |
| `.superpowers/` | Claude Code 一時 | 🚫 gitignore |
| `start-完全版.bat` / `start-貼付版.bat` | 起動スクリプト（ダブルクリック） | ✅ |
| `start-dev.bat` | 開発モード起動 | ✅ |
| `update-app.bat` | `git pull` → `npm install` → `next build` | ✅ |
| `claude-Nsplit.bat` | Claude Code の分屏起動補助（個人ツール） | ✅ |
| `README.md` | プロジェクト概要（開発者向け） | ✅ |
| `AGENTS.md` / `CLAUDE.md` | エージェント作業規約 | ✅ |
| `word-extractor.d.ts` | word-extractor（.doc 抽出）の型宣言 | ✅ |

## 厳守ルール

1. **fs アクセスは原則 `@/lib/storage` 経由**。`fs` を直接 import するのは `lib/` 配下のサーバ専用モジュール（`backup.ts`、`retention.ts`、`auditLog.ts`、`analytics.ts`、`excelMirror.ts`）に限り、いずれも `getDataRoot()` を起点にする。
2. **型は `@/lib/types` から import**。再定義しない。
3. **Server Component で読み、Server Action / Route Handler で書く**。Client Component から fs を呼ばない。
4. **API モードのコードは残す（UI のみ非表示）**。`Section*` の `mode === "api"` ブロック、`xxxApiAction`、`lib/llm/*`、`documentExtract.ts` 一式は Phase 2 で再有効化する想定。新規修正でも消さない。
5. **状態タグは `globals.css` の `.pill-*` クラス**を使う（独自定義しない）。
6. **新規ファイル作成前に既存を確認**。重複実装を避ける。
7. **commit / push は行わない**。ユーザー指示時のみ。
8. **Role / EvalCriteria の入力検証は `lib/validation.ts:validateRoleObject` / `validateEvalCriteriaObject` を使う**。Route Handler / Import / Storage で共有。ID パターンは `/^[a-zA-Z0-9_-]+$/` に統一済（path traversal 防御）。
9. **Server Action の入力サイズは `lib/validation.ts:assertTextWithinLimit` / `assertResumeUpload` で必ず検証**。Client 側ガードは Server Action ad-hoc 呼び出しでは無効。

## UI 規約

- 全画面で `app/layout.tsx` のヘッダ + ナビが自動で出る。各 page は中身だけ書く。
- カード: `bg-white rounded-xl border shadow-sm`、内側 `p-6`
- 主ボタン: `bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded font-medium`（または `<Button>` shadcn 部品）
- 補助ボタン: `border hover:bg-zinc-50 text-sm px-3 py-1 rounded`
- 破壊: `text-red-600 hover:underline`
- 状態タグ pill クラス: `pill-edit` / `pill-qpub` / `pill-itv` / `pill-eval` / `pill-pass` / `pill-fail` / `pill-role-nw` / `pill-role-sv` / `pill-role-dev` / `pill-role-sp` / `pill-role-pm` / `pill-role-it`
- 表: `<table class="w-full text-sm border rounded-lg overflow-hidden">`、thead は `bg-zinc-50 text-zinc-600 text-xs`、tbody は `divide-y`
- フォーム: `border rounded px-3 py-2 text-sm`（または `<Input>` / `<Textarea>` shadcn 部品）
- error / loading / not-found は `app/` 配下の Next.js 規約ファイル名で配置（既存例: `app/error.tsx`、`app/loading.tsx`、`app/sessions/[id]/loading.tsx`、`app/sessions/[id]/not-found.tsx`）

## storage API（lib/storage.ts）

```ts
// settings
loadSettings(): Settings                  // react.cache 済（リクエスト単位メモ）
saveSettings(s: Settings): void           // validateDataRoot 内部で実行
validateDataRoot(input): string           // システムディレクトリ / FS ルート / config 拒否
getDataRoot(): string                     // react.cache 済

// master: 役割
listRoles(): Role[]
listRoleIds(): string[]
getRole(id): Role | null
saveRole(role): void
deleteRole(id): void

// master: 評価条件
getEvalCriteria(): EvalCriteria | null
saveEvalCriteria(c): void
resolveEvalForRole(base, roleId): EvalCriteria  // ④凍結時に役割別オーバーライドを畳む

// master: import/export
exportMaster(): string
importMaster(json): { roles, evalAxes }

// session
listSessions(): SessionMeta[]
getSessionMeta(id): SessionMeta | null
saveSessionMeta(meta): void
createSession(氏名, 役割): SessionMeta
duplicateSession(srcId, { 氏名?, 役割? }): SessionMeta | null
deleteSession(id): void                    // 物理削除（通常は softDeleteSession を使う）
generateSessionId(氏名, 役割, when?): string
isValidSessionId(id): boolean
assertSessionId(id): void

// 各セクション（読み: 不正 id で null / 書き: assertSessionId で throw）
getCandidate(id) / saveCandidate(id, data)
getConditionsSnapshot(id) / saveConditionsSnapshot(id, data)
getQuestions(id) / saveQuestions(id, data)
getMinutes(id) / saveMinutes(id, data)
getEvaluation(id) / saveEvaluation(id, data)     // 保存時に SessionMeta.総合スコア を同時更新
```

## 確認コマンド

```
npm run dev     # http://127.0.0.1:3939
npm run build   # 型エラー確認（Turbopack）
npm run lint    # ESLint
```

## 参考リンク

- 設計書: `files/面談AI評価ツール_設計書.md`（§4〜§9 が機能仕様、§7.5 が保存期間、§8.5 がコスト集計）
- Next.js 16 ドキュメント: `node_modules/next/dist/docs/`
