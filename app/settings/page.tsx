import "server-only";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listTrash } from "@/lib/retention";
import { loadSettings, saveSettings, validateDataRoot } from "@/lib/storage";
import type {
  LlmStage,
  ProviderConfig,
  ProviderId,
  ProviderSafeStatus,
  Settings,
} from "@/lib/types";
import { PageHeader } from "@/app/_components/PageHeader";
import { AuditLogViewer } from "./_components/AuditLogViewer";
import { DataRootField } from "./_components/DataRootField";
import { RetentionManager } from "./_components/RetentionManager";
import { BackupManager } from "./_components/BackupManager";
import { ProvidersField } from "./_components/ProvidersField";
import { SaveSettingsButton } from "./_components/SaveSettingsButton";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Switch } from "@/ui/switch";
import { PROVIDER_IDS_ACTIVE } from "@/lib/llm/registry";

const STAGES: LlmStage[] = ["summary", "questions", "evaluation", "evaluationStrict"];

async function updateSettings(formData: FormData) {
  "use server";
  const current = loadSettings();
  const numOr = (v: FormDataEntryValue | null, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };

  // プロバイダごとの key / モデルを取り出す（空欄は現状維持、削除チェックで明示クリア）
  // 現在は Claude のみ UI 表示。非表示プロバイダは formData に来ないので、
  // ループも active list のみを回して既存値をそのまま維持する。
  const providers: Record<ProviderId, ProviderConfig> = { ...current.providers };
  for (const id of PROVIDER_IDS_ACTIVE) {
    const submitted = String(formData.get(`provider_${id}_key`) ?? "").trim();
    const remove = formData.get(`remove_${id}`) === "on";
    const nextKey = remove ? "" : submitted || current.providers[id].key;
    const defaultModel = String(
      formData.get(`provider_${id}_defaultModel`) ?? current.providers[id].defaultModel,
    );
    const models: ProviderConfig["models"] = { ...current.providers[id].models };
    for (const stage of STAGES) {
      const v = formData.get(`provider_${id}_model_${stage}`);
      if (typeof v === "string" && v) models[stage] = v;
    }
    providers[id] = { key: nextKey, defaultModel, models };
  }

  const submittedDefaultProvider = formData.get("defaultProvider");
  const defaultProvider: ProviderId =
    typeof submittedDefaultProvider === "string" &&
    PROVIDER_IDS_ACTIVE.includes(submittedDefaultProvider as ProviderId)
      ? (submittedDefaultProvider as ProviderId)
      : current.defaultProvider;

  // ⑤質問生成数（1〜50 にクランプ）
  // v が null / 空文字のときは fallback。Number(null) = 0 で誤って 1 に丸まるのを防ぐ。
  const clampQ = (v: FormDataEntryValue | null, fallback: number) => {
    if (v == null || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(50, Math.floor(n)));
  };
  const questionCounts: Settings["questionCounts"] = {
    nontech: clampQ(formData.get("q_nontech"), current.questionCounts.nontech),
    tech: clampQ(formData.get("q_tech"), current.questionCounts.tech),
  };

  // dataRoot は destructive な値（C:\Windows / / 等）を受け入れると致命的
  // （fs.rmSync が走る経路があるため）。サーバ側で必ず検証する。
  // 検証失敗時は throw すると Next.js DEV のエラーオーバーレイが残るため、
  // ?error= 経由でページ内の赤バナーに変換する。
  //
  // 空文字が来た場合は 静かに "./data" にフォールバックさせず、
  // validateDataRoot に投げて明示的な エラー にする（クライアント側で「カスタム
  // 選択したのに空」だった等のケースを見逃さない）。
  const dataRootInput = String(
    formData.get("dataRoot") ?? current.dataRoot,
  ).trim();
  let dataRoot: string;
  try {
    dataRoot = validateDataRoot(dataRootInput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/settings?error=${encodeURIComponent(msg)}`);
  }

  const next: Settings = {
    ...current,
    dataRoot,
    defaultProvider,
    providers,
    questionCounts,
    retention: {
      ...current.retention,
      enabled: formData.get("retentionEnabled") === "on",
      days: {
        採用: numOr(formData.get("days_採用"), current.retention.days["採用"] ?? 0),
        不採用: numOr(
          formData.get("days_不採用"),
          current.retention.days["不採用"] ?? 180,
        ),
        未確定: numOr(
          formData.get("days_未確定"),
          current.retention.days["未確定"] ?? 0,
        ),
      },
      softDeleteGraceDays: numOr(
        formData.get("softDeleteGraceDays"),
        current.retention.softDeleteGraceDays,
      ),
      keepAnonymizedEval: formData.get("keepAnonymizedEval") === "on",
      backupKeepDays: numOr(
        formData.get("backupKeepDays"),
        current.retention.backupKeepDays ?? 90,
      ),
      backupMaxGenerations: numOr(
        formData.get("backupMaxGenerations"),
        current.retention.backupMaxGenerations ?? 0,
      ),
    },
  };
  try {
    saveSettings(next);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/settings?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/settings");
  redirect("/settings");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMsg } = await searchParams;
  const s = loadSettings();
  const trashCount = listTrash().length;
  // 画面には key そのものは出さない。設定済かどうかと、環境変数優先かのみ表示。
  // 現在は Claude のみ UI 表示。非表示プロバイダの env 判定は無用（UI に出さない）。
  const envStatus: Partial<Record<ProviderId, boolean>> = {
    anthropic: !!(process.env.ANTHROPIC_API_KEY ?? "").trim(),
  };
  // ⚠ providers をそのまま client component に渡すと RSC payload に
  // API キー文字列がそのまま乗ってブラウザに送られる。boolean + モデル名だけに
  // 詰め替えてから渡す（Critical: 設定画面からのキー漏洩防止）。
  const providersSafe: Partial<Record<ProviderId, ProviderSafeStatus>> = {};
  for (const id of PROVIDER_IDS_ACTIVE) {
    providersSafe[id] = {
      hasFileKey: !!s.providers[id].key.trim(),
      defaultModel: s.providers[id].defaultModel,
    };
  }

  return (
    <div className="space-y-4">
      {/* 既存設定フォーム */}
      <div className="bg-card rounded-xl border shadow-sm">
        <PageHeader title="設定" />
        <div className="p-6 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="border border-red-300 bg-red-50 text-red-800 text-sm rounded px-3 py-2"
            >
              保存できませんでした: {errorMsg}
            </div>
          )}
          <form action={updateSettings} className="space-y-6">
            <DataRootField defaultValue={s.dataRoot} />

            <ProvidersField
              defaultProvider={s.defaultProvider}
              providers={providersSafe}
              envStatus={envStatus}
            />

            {/* 質問生成数 — prompt と maxTokens 上限が両方この値から自動算出される */}
            <section className="space-y-3">
              <div className="font-medium text-sm">質問生成数</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="q_nontech" className="text-xs text-muted-foreground">
                    人間性
                  </Label>
                  <Input
                    id="q_nontech"
                    name="q_nontech"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={s.questionCounts.nontech}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">
                    自己紹介・キャリア・志望動機 等
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q_tech" className="text-xs text-muted-foreground">
                    技術
                  </Label>
                  <Input
                    id="q_tech"
                    name="q_tech"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={s.questionCounts.tech}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">
                    候補者の経歴・条件に紐づく専門質問
                  </div>
                </div>
              </div>
            </section>

            {/* 保存期間（編集可能化） */}
            <section className="space-y-3">
              <div className="font-medium text-sm">保存期間</div>
              <div className="text-xs text-muted-foreground">
                判定確定日（closedAt）からの自動削除。0 = 自動削除しない。下の「スイープ実行」で手動起動できます（定期実行は今後）。
              </div>

              <Label
                htmlFor="retentionEnabled"
                className="flex items-center gap-2 text-sm font-normal cursor-pointer"
              >
                <Switch
                  id="retentionEnabled"
                  name="retentionEnabled"
                  value="on"
                  defaultChecked={s.retention.enabled}
                />
                自動削除を有効化
              </Label>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="days_採用" className="text-xs text-muted-foreground">採用</Label>
                  <Input
                    id="days_採用"
                    name="days_採用"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["採用"] ?? 0}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">日数（0=削除しない）</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days_不採用" className="text-xs text-muted-foreground">不採用</Label>
                  <Input
                    id="days_不採用"
                    name="days_不採用"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["不採用"] ?? 180}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">日数</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days_未確定" className="text-xs text-muted-foreground">未確定</Label>
                  <Input
                    id="days_未確定"
                    name="days_未確定"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["未確定"] ?? 0}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">通常 0 推奨</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="softDeleteGraceDays" className="text-xs text-muted-foreground">
                    ゴミ箱の猶予日数
                  </Label>
                  <Input
                    id="softDeleteGraceDays"
                    name="softDeleteGraceDays"
                    type="number"
                    min={0}
                    defaultValue={s.retention.softDeleteGraceDays}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">
                    ソフト削除後この日数で完全削除
                  </div>
                </div>
                <div className="flex items-end">
                  <Label
                    htmlFor="keepAnonymizedEval"
                    className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                  >
                    <Switch
                      id="keepAnonymizedEval"
                      name="keepAnonymizedEval"
                      value="on"
                      defaultChecked={s.retention.keepAnonymizedEval}
                    />
                    匿名サマリを analytics/ に残す
                  </Label>
                </div>
              </div>

              {/* バックアップ世代の保持（自動掃除に連動） */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                <div className="space-y-1.5">
                  <Label htmlFor="backupKeepDays" className="text-xs text-muted-foreground">
                    バックアップ保存日数
                  </Label>
                  <Input
                    id="backupKeepDays"
                    name="backupKeepDays"
                    type="number"
                    min={0}
                    defaultValue={s.retention.backupKeepDays ?? 90}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">
                    日数（0=自動削除しない）
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="backupMaxGenerations" className="text-xs text-muted-foreground">
                    バックアップ世代上限
                  </Label>
                  <Input
                    id="backupMaxGenerations"
                    name="backupMaxGenerations"
                    type="number"
                    min={0}
                    defaultValue={s.retention.backupMaxGenerations ?? 0}
                  />
                  <div className="text-2xs text-muted-foreground opacity-70">
                    件数（0=無制限）
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <SaveSettingsButton />
            </div>
          </form>
        </div>
      </div>

      {/* 操作カード: プレビュー・スイープ・ログ */}
      <div className="bg-card rounded-xl border shadow-sm">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold">保存期間スイープ</h3>
            <span
              className={`pill ${
                s.retention.enabled ? "pill-pass" : "pill-edit"
              }`}
            >
              {s.retention.enabled ? "有効" : "無効"}
            </span>
            <Link
              href="/trash"
              className="ml-auto inline-flex items-center gap-1.5 border hover:bg-accent text-xs px-2.5 py-1 rounded transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>ゴミ箱</span>
              {trashCount > 0 && (
                <span className="tabular font-medium bg-muted text-foreground rounded-full px-1.5 min-w-[18px] text-center text-2xs leading-4">
                  {trashCount}
                </span>
              )}
            </Link>
          </div>
          <div className="text-xs text-muted-foreground">
            二段階削除（sessions/ → _trash/ → 完全削除）。実行前に必ず「次に消える面談を確認」してください。移動済みの面談は猶予期間内ならゴミ箱から復元できます。
          </div>
          <RetentionManager />
        </div>
      </div>

      {/* バックアップ管理 */}
      <div className="bg-card rounded-xl border shadow-sm" data-manual-shot="backup">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold">バックアップ</h3>
            <span className="text-xs text-muted-foreground">
              data/sessions + data/master → data/_backups/
            </span>
          </div>
          <BackupManager
            keepDays={s.retention.backupKeepDays ?? 90}
            maxGenerations={s.retention.backupMaxGenerations ?? 0}
          />
        </div>
      </div>

      {/* 監査ログリーダー */}
      <AuditLogViewer limit={50} />

      {/* 開発者向け：配布用 ZIP 出力
       * .env.local に ENABLE_DEV_EXPORT=1 を設定した開発環境でのみ表示される。
       * 配布版（env 変数が無い）では非表示、かつ Route Handler 側も 404 を返す。 */}
      {process.env.ENABLE_DEV_EXPORT === "1" && (
        <div className="bg-card rounded-xl border shadow-sm" data-manual-hide>
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-bold">⚙️ 開発者向け：配布用 ZIP 出力</h3>
              <span className="text-xs text-muted-foreground">
                あなたのデータは含まれません
              </span>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              ソースコード一式＋ 5 種のデフォルト求人テンプレート（Dev / ITSupport / NW / PMO /
              Server）を含む、配布可能な ZIP を生成します。
              API キー・面談セッション・独自求人・分析データは含まれません。
              受け取った側は解凍して <code className="px-1 rounded bg-muted">start.bat</code>{" "}
              をダブルクリックすれば起動します（Node.js 20 以降が必要）。
            </div>
            <div>
              <a
                href="/api/settings/export-clean"
                className="border hover:bg-zinc-50 text-sm px-3 py-1 rounded inline-block"
              >
                配布用 ZIP をダウンロード
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

