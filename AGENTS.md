<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 面談AI評価ツール — エージェント間の作業規約

このプロジェクトは複数の Claude CLI が並列で実装します。**まずこのファイルを読む**こと。

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

- 採用面談ツールのローカル版。Phase 1 は全工程「貼付モード」のみ実装。
- 設計書: `files/面談AI評価ツール_設計書.md`
- スタック: Next.js 16 App Router + TypeScript + Tailwind v4 + npm / ポート 3939
- UI: 案1（業務標準・表中心）。見本は `mockup-5sets.html` の案1タブ

## ディレクトリ規約

```
Resume_Claude/
├─ app/
│   ├─ layout.tsx           ← 共通レイアウト（実装済み）
│   ├─ globals.css          ← 共通CSS + .pill-* タグ色（実装済み）
│   ├─ page.tsx             ← / 面談一覧 ★左ペイン担当
│   ├─ new/page.tsx         ← /new 新規面談 ★右ペイン担当
│   ├─ sessions/[id]/page.tsx ← セッション ★右ペイン担当
│   ├─ master/page.tsx      ← マスタ ★中央ペイン担当
│   ├─ settings/page.tsx    ← 設定 ★左ペイン担当
│   └─ api/...              ← Route Handlers（必要に応じて）
├─ lib/
│   ├─ types.ts             ← 共通型（必ずここから import）★実装済み
│   └─ storage.ts           ← fs アクセス層（必ずここを通す）★実装済み
├─ config/settings.json     ← 設定（プロジェクト固定）★種ファイル実装済み
├─ data/                    ← settings.dataRoot のデフォルト
│   ├─ master/roles/<id>.json    ★NW.json と Server.json 実装済み
│   ├─ master/eval_criteria.json ★実装済み
│   └─ sessions/<id>/
│       ├─ session.json
│       ├─ candidate.json
│       ├─ conditions_snapshot.json
│       ├─ questions.json
│       ├─ minutes.json
│       └─ evaluation.json
└─ files/面談AI評価ツール_設計書.md
```

## 厳守ルール

1. **fs アクセスは必ず `@/lib/storage` 経由**。`fs` を直接 import しない。
2. **型は `@/lib/types` から import**。再定義しない。
3. **Server Component で読み、Server Action / Route Handler で書く**。Client Component から fs を呼ばない。
4. **モード切替（API/貼付）の UI は出す**が、API 側は `disabled` + 「Phase 2 で有効化」の注記。Phase 1 は貼付のみ動作。
5. **状態タグは `globals.css` の `.pill-*` クラス**を使う（独自定義しない）。
6. **新規ファイル作成前に既存を確認**。重複実装を避ける。
7. **commit / push は行わない**。ユーザー指示時のみ。
8. **`mockup-5sets.html` の案1タブ**を実装の見本とする。マークアップを参考にしつつ Tailwind クラスは AGENTS.md の規約に合わせる。

## UI 規約（案1）

- 全画面で `app/layout.tsx` のヘッダ + ナビが既に出る。各 page は中身だけ書く。
- カード: `bg-white rounded-xl border shadow-sm`、内側 `p-6`
- 主ボタン: `bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded font-medium`
- 補助ボタン: `border hover:bg-zinc-50 text-sm px-3 py-1 rounded`
- 破壊: `text-red-600 hover:underline`
- 状態タグ pill クラス: `pill-edit` / `pill-qpub` / `pill-itv` / `pill-eval` / `pill-pass` / `pill-fail` / `pill-role-nw` / `pill-role-sv`
- 表: `<table class="w-full text-sm border rounded-lg overflow-hidden">`、thead は `bg-zinc-50 text-zinc-600 text-xs`、tbody は `divide-y`
- フォーム: `border rounded px-3 py-2 text-sm`

## storage API（lib/storage.ts）

```ts
// settings
loadSettings(): Settings
saveSettings(s: Settings): void

// master
listRoles(): Role[]
listRoleIds(): string[]
getRole(id): Role | null
saveRole(role): void
deleteRole(id): void
getEvalCriteria(): EvalCriteria | null
saveEvalCriteria(c): void

// session
listSessions(): SessionMeta[]
getSessionMeta(id): SessionMeta | null
saveSessionMeta(meta): void
createSession(氏名: string, 役割: string): SessionMeta
deleteSession(id): void

// 各セクション
getCandidate(id) / saveCandidate(id, data)
getConditionsSnapshot(id) / saveConditionsSnapshot(id, data)
getQuestions(id) / saveQuestions(id, data)
getMinutes(id) / saveMinutes(id, data)
getEvaluation(id) / saveEvaluation(id, data)
```

## 確認コマンド

```
npm run dev     # http://localhost:3939
npm run build   # 型エラー確認
npm run lint
```

## 分担

| エージェント | 担当 |
|---|---|
| 左ペイン | 基盤 + `/`（一覧）+ `/settings` + 設定API |
| 中央ペイン | `/master`（役割CRUD + 評価条件編集）+ マスタAPI |
| 右ペイン | `/new`（新規作成）+ `/sessions/[id]`（②④⑤⑥⑧ 貼付UI）+ セッションAPI |
