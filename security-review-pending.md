# セキュリティレビュー 残課題（API Key 防護中心）

> 2026-06-26 起票 → **2026-06-29 残課題 1・2 完了**。
> 既に本 diff で完了している加固は末尾の「✅ 完了済」を参照。

## 2026-06-29 完了サマリ

| 残課題 | 対応 |
|---|---|
| 1. roles/[id] URL id 未検証 | `app/api/master/roles/[id]/route.ts` に `assertUrlId`（`validateRoleMasterId`）を GET/PUT/DELETE で適用。`lib/storage.ts` の `getRole`/`saveRole`/`deleteRole` に `assertRoleId`（`^[a-zA-Z0-9_-]+$`）で二重防御。 |
| 2. session id path traversal | `lib/storage.ts` に `isValidSessionId` / `assertSessionId` を追加。read 系（`getSessionMeta`/`getCandidate`/...）は不正 id で `null` を返す（既存 API 契約維持）。write/delete 系（`saveSessionMeta`/`deleteSession`/`createSession`/`duplicateSession` + 全 `saveXxx`）は throw。`lib/retention.ts` の `softDeleteSession`/`restoreFromTrash`/`purgeFromTrash` も assert。 |

設計判断:
- session id は厳密パターン `^\d{8}_\d{6}_..._...$` を強制しない（旧データ
  `YYYYMMDD_HHMM_...` および氏名のモジバケが混在するため）。代わりに
  path separator (`/`, `\`)・NUL・制御文字・`.`/`..` のみブロックし、
  「sessions/ から脱出できない」ことだけを保証する。

検証:
- 既存セッション 17 件＋ trash 2 件すべて `isValidSessionId` を通過。
- 既存 role 6 件すべて `ROLE_ID_SAFE` (`/^[a-zA-Z0-9_-]+$/`) を通過。
- `npx tsc --noEmit` exit 0。

---

## 残課題 1: Path Traversal で API Key 漏洩 — `app/api/master/roles/[id]/route.ts`

**Severity:** MEDIUM（localhost 単一ユーザー前提）／ ネットワーク公開なら HIGH
**Category:** path_traversal → credential_disclosure
**Confidence:** 8/10

### 何が問題か
GET / PUT / DELETE の 3 ハンドラとも、URL の `[id]` セグメントを **検証なし** で `getRole(id)` / `deleteRole(id)` に渡している。

```ts
// app/api/master/roles/[id]/route.ts:49-60
const { id } = await ctx.params;
const role = getRole(id);  // ← 未検証

// :62-94 (PUT) — body.id は validateRoleMasterId 済だが URL 側 originalId は未検証
const { id: originalId } = await ctx.params;
const original = getRole(originalId);
deleteRole(originalId);

// :96-108 (DELETE)
const { id } = await ctx.params;
deleteRole(id);
```

`lib/storage.ts:245-256` 側も `path.join` で素直に連結するだけ：

```ts
export function getRole(id: string): Role | null {
  return readJson<Role>(path.join(rolesDir(), `${id}.json`));
}
```

### 攻撃シナリオ
`GET http://localhost:3939/api/master/roles/..%2F..%2Fconfig%2Fsettings`
→ `path.join("data/master/roles", "../../config/settings.json")` → **`config/settings.json` がそのまま JSON で返る**
→ `providers[].apiKey`（Anthropic / OpenAI / Google の平文キー）が漏洩。

DELETE 同手法で `config/settings.json` 自体や任意 `.json` を削除可能。

トリガ経路：
- ユーザーが悪意あるページを開く → 同ページが `fetch("http://localhost:3939/...")`（CORS で本体は読めないが DNS rebinding / 拡張機能 / `<script src>` などで回避可能）
- ローカルで動く別プロセス（拡張機能・別アプリ）

### 修正
`validateRoleMasterId`（既存・`lib/validation.ts:72`、`/^[a-zA-Z0-9_-]+$/`）を URL 段にも適用：

```ts
import { validateRoleMasterId } from "@/lib/validation";

export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  const v = validateRoleMasterId(id);
  if (!v.ok) throw new ApiError("VALIDATION_ERROR", v.error, 400);
  const role = getRole(v.value);
  ...
}
```

PUT の `originalId` と DELETE の `id` にも同様に。

**さらに防御層を厚くするなら** `lib/storage.ts` の `getRole` / `saveRole` / `deleteRole` 内部でも `ROLE_ID_PATTERN` を assert（将来別の呼び出し元が追加された時の保険）。

---

## 残課題 2: Path Traversal で任意ディレクトリ削除 — `lib/storage.ts` セッション系入口

**Severity:** MEDIUM
**Category:** path_traversal
**Confidence:** 8/10

### 何が問題か
`deleteSession(id)` は `fs.rmSync(sessionDir(id), { recursive: true, force: true })` を `id` 未検証で呼ぶ。`softDeleteSession` / `duplicateSession(srcId)` も同様。

セッション ID 形式（`YYYYMMDD_HHMMSS_<氏名>_<役割>`）は role ID のような厳密パターンが無く、上流から `id = "..\\..\\config"` 等が入り込めば **`config/` ディレクトリ丸ごと再帰削除** される恐れ。

### 修正
`lib/storage.ts` 冒頭に：

```ts
const SESSION_ID_PATTERN =
  /^\d{8}_\d{6}_[^\\/:*?"<>|\x00-\x1f]+_[a-zA-Z0-9_-]+$/;

function assertSessionId(id: string): void {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error(`invalid session id: ${id}`);
  }
}
```

`getSessionMeta` / `saveSessionMeta` / `deleteSession` / `softDeleteSession` / `duplicateSession` / `sessionDir` の全入口で先頭で `assertSessionId(id)`。

---

## ✅ 本 diff で完了済の API Key 加固

| 項目 | 場所 |
|---|---|
| RSC payload にキーを載せない（ブラウザに `apiKey` を渡さない） | `app/settings/page.tsx:120-136` + `app/settings/_components/ProvidersField.tsx:5-30` |
| Google API キーを URL querystring → `x-goog-api-key` ヘッダへ | `lib/llm/google.ts:33-43` |
| `LlmCallError.message` で各 provider キーを redact | `lib/llm/types.ts:31-53` |
| `config/settings.json` 書き出し時に chmod 0o600 | `lib/storage.ts:133-148` |
| バックアップを AES-256-GCM + PBKDF2-SHA256 200k で強制暗号化 | `lib/backup.ts:182-221` |
| `/api/backup` GET/POST/DELETE に Origin/Referer allow-list | `app/api/backup/route.ts:11-37` |

---

## 月曜のチェックリスト

- [x] 残課題 1 を修正（`validateRoleMasterId` を URL 段に適用、3 ハンドラ）
- [x] 残課題 2 を修正（`isValidSessionId` + `assertSessionId` 導入。strict pattern は採用せず、path traversal だけブロックする方針に変更）
- [x] `npx tsc --noEmit` で型エラー無いこと確認（exit 0）
- [x] 既存セッション 17 件＋ trash 2 件、既存 role 6 件すべて新 pattern を通過することを確認
- [x] 修正後に `git diff` で差分セキュリティレビュー実施（lib/storage.ts, lib/retention.ts, app/api/master/roles/[id]/route.ts）
