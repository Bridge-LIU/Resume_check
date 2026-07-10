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

- 採用面談ツールのローカル版。各セクション（①面談者情報 / ③質問リスト / ⑤評価）で「貼付」「API」をユーザがトグル切替。
- API モード（①要約 / ③質問 / ④面談内容 / ⑤評価）は `lib/llm/*` + `xxxApiAction` に実装。`/settings` で Provider (Anthropic / OpenAI / Google) を設定すれば利用可能。
- 設計書: `.preview/files/面談AI評価ツール_設計書.md`
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
│   ├─ _components/         ← 一覧用クライアント部品 + ui/（shadcn 由来 UI 部品、`@/ui/*` alias で参照）
│   ├─ new/                 ← /new 新規面談
│   │   ├─ page.tsx
│   │   ├─ actions.ts       ← createSessionAction
│   │   └─ _components/
│   ├─ list/                ← /list 面談一覧（ホームからリンク）
│   ├─ sessions/[id]/       ← /sessions/[id] セッション
│   │   ├─ page.tsx
│   │   ├─ actions.ts       ← 各セクション保存・状態遷移
│   │   ├─ loading.tsx      ← セクションスケルトン
│   │   ├─ not-found.tsx    ← セッション欠落時の画面
│   │   └─ _components/     ← Section2/4/5/6/8（内部 ID）= UI ①〜⑤ の各セクション
│   ├─ master/              ← /master 役割マスタ＋評価条件
│   ├─ settings/            ← /settings 設定
│   │   ├─ page.tsx         ← updateSettings (Server Action)
│   │   ├─ actions.ts
│   │   └─ _components/
│   ├─ analytics/           ← /analytics 匿名サマリ分析
│   ├─ compare/             ← /compare 横断比較ビュー
│   ├─ cost/                ← /cost API コスト集計（設計書 §8.5）
│   ├─ trash/               ← /trash ゴミ箱（設計書 §7.5）
│   ├─ manual/              ← /manual 静的マニュアル配信
│   ├─ api/                 ← Route Handlers（backup/master 系）
│   └─ preview*/            ← 開発用プレビュー・提案モック（配布物には含めない）
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
│   ├─ questionParser.ts    ← UI ③（内部 Section5）質問テキスト → 構造化
│   ├─ summaryFormat.ts
│   ├─ crashGuard.ts
│   └─ llm/                 ← API モード実装（Provider / モデル抽象）
├─ data/                    ← settings + ユーザーデータ（全て gitignore）
│   ├─ settings.json        ← API キー / dataRoot / 保存期間設定
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
├─ 運用マニュアル.HTML       ← エンドユーザ向け統合マニュアル（ルート直下、ダブルクリック起動対応）
├─ マニュアル/               ← マニュアル用資材
│   └─ assets/               ← 画面ショット等
├─ scripts/                 ← 運用・ビルド補助（配布に含む）
│   ├─ next-with-port.mjs   ← npm run dev/start が呼ぶ起動ラッパー
│   ├─ decrypt-backup.mjs   ← バックアップ復号ツール
│   ├─ verify-backup.mjs    ← バックアップ整合性検証
│   ├─ trigger-mirror.mjs   ← Excel ミラー手動再生成
│   ├─ preview-xlsx-cells.mjs ← xlsx セル値ダンプ（デバッグ）
│   └─ dev/                 ← 🚫 開発者専用（配布に含めない・gitignore）
│       ├─ seed-sessions.bat / seed-sessions.mjs   ← モック面談データ生成
│       ├─ gen-resume-samples.mjs                  ← 履歴書サンプル生成
│       ├─ manual-screenshot.mjs                   ← マニュアル画面ショット撮影
│       ├─ update-app.bat                          ← git pull → npm install → build（git clone 環境向け）
│       └─ claude-{2,3,4}split.bat                 ← Claude Code 個人ワークフロー
└─ public/                  ← 静的資源

（設計書・サンプル面談データ・履歴書チェックなどのローカル資料は `.preview/files/` に配置、gitignore）
```

### 根直下のフォルダ / ファイル一覧

| 対象 | 用途 | git |
|---|---|---|
| `app/` | Next.js App Router — 全ページ + 共用 UI 部品（`app/_components/ui/`、`@/ui/*` alias） | ✅ |
| `lib/` | サーバー側ロジック + ローカル型宣言（.d.ts） | ✅ |
| `運用マニュアル.HTML` | エンドユーザ向け統合マニュアル（ルート直下） | ✅ |
| `マニュアル/` | 上記 HTML の資材（画像等） | ✅ |
| `scripts/` | 運用・ビルド補助（配布に含む） | ✅ |
| `scripts/dev/` | 開発者専用スクリプト（配布に含めない） | 🚫 gitignore |
| `public/` | 静的資源 | ✅ |
| `data/` | 設定 + ユーザーデータ（PII） | 🚫 gitignore |
| `.preview/` | ローカル画面ショット・mockup + 設計書 (`.preview/files/`) | 🚫 gitignore |
| `.superpowers/` | Claude Code 一時 | 🚫 gitignore |
| `start.bat` | 起動スクリプト（本番モード・ダブルクリック起動） | ✅ |
| `.env.local.example` | 環境変数テンプレ | ✅ |
| `README.md` | プロジェクト概要（開発者向け） | ✅ |
| `AGENTS.md` / `CLAUDE.md` | エージェント作業規約 | ✅ |

## 厳守ルール

1. **fs アクセスは原則 `@/lib/storage` 経由**。`fs` を直接 import するのは `lib/` 配下のサーバ専用モジュール（`backup.ts`、`retention.ts`、`auditLog.ts`、`analytics.ts`、`excelMirror.ts`）に限り、いずれも `getDataRoot()` を起点にする。
2. **型は `@/lib/types` から import**。再定義しない。
3. **Server Component で読み、Server Action / Route Handler で書く**。Client Component から fs を呼ばない。
4. **貼付モードと API モードは両方を維持**。ユーザが `ModeSwitch` で切り替えるため、`Section*` の `mode === "paste"` / `mode === "api"` の双方を必ず動作させる。片方だけの実装に整理するのは不可。
5. **状態タグは `globals.css` の `.pill-*` クラス**を使う（独自定義しない）。
6. **新規ファイル作成前に既存を確認**。重複実装を避ける。
7. **commit / push は行わない**。ユーザー指示時のみ。
8. **Role / EvalCriteria の入力検証は `lib/validation.ts:validateRoleObject` / `validateEvalCriteriaObject` を使う**。Route Handler / Import / Storage で共有。ID パターンは `/^[a-zA-Z0-9_-]+$/` に統一済（path traversal 防御）。
9. **Server Action の入力サイズは `lib/validation.ts:assertTextWithinLimit` / `assertResumeUpload` で必ず検証**。Client 側ガードは Server Action ad-hoc 呼び出しでは無効。
10. **番号系は 2 系統併存**：
    - **UI 表示・ユーザー可視な文字列**（画面ラベル / エラーメッセージ / コピー用プロンプトの見出し / 監査ログのラベル / `/cost` の工程ラベル / ダイアログ本文）は**必ず 5 段の連番 `①②③④⑤`** を使う。
    - **内部識別子**（コンポーネント名 `Section2/4/5/6/8`、URL パラメータ `s2/s4/s5/s6/s8`、監査イベント名、`Stage` 型のリテラル以外の JSDoc コメント）は**設計書と揃えた 8 段番号のまま温存**する（URL 互換／履歴データ互換のため）。
    - **対応表**は `.preview/files/面談AI評価ツール_設計書.md` 冒頭の「番号対応表」を単一の正本とする。設計書の ②④⑤⑥⑧ を UI 文言にコピペするときは必ず ①②③④⑤ に読み替えること。

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
resolveEvalForRole(base, roleId): EvalCriteria  // UI ②（内部 Section4）凍結時に役割別オーバーライドを畳む

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

- 設計書: `.preview/files/面談AI評価ツール_設計書.md`（§4〜§9 が機能仕様、§7.5 が保存期間、§8.5 がコスト集計）
- Next.js 16 ドキュメント: `node_modules/next/dist/docs/`
