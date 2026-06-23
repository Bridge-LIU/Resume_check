import "server-only";
import { revalidatePath } from "next/cache";
import { loadSettings, saveSettings } from "@/lib/storage";
import type { LlmStage, ProviderConfig, ProviderId, Settings } from "@/lib/types";
import { AuditLogViewer } from "./_components/AuditLogViewer";
import { DataRootField } from "./_components/DataRootField";
import { RetentionManager } from "./_components/RetentionManager";
import { BackupManager } from "./_components/BackupManager";
import { ProvidersField } from "./_components/ProvidersField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const STAGES: LlmStage[] = ["summary", "questions", "evaluation", "evaluationStrict"];

async function updateSettings(formData: FormData) {
  "use server";
  const current = loadSettings();
  const numOr = (v: FormDataEntryValue | null, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };

  // プロバイダごとの key / モデルを取り出す（空欄は現状維持、削除チェックで明示クリア）
  const providerIds: ProviderId[] = ["anthropic", "openai", "google"];
  const providers: Record<ProviderId, ProviderConfig> = {
    ...current.providers,
  };
  for (const id of providerIds) {
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
    submittedDefaultProvider === "anthropic" ||
    submittedDefaultProvider === "openai" ||
    submittedDefaultProvider === "google"
      ? submittedDefaultProvider
      : current.defaultProvider;

  const next: Settings = {
    ...current,
    dataRoot:
      String(formData.get("dataRoot") ?? current.dataRoot).trim() || "./data",
    defaultProvider,
    providers,
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
  saveSettings(next);
  revalidatePath("/settings");
}

export default async function Page() {
  const s = loadSettings();
  // 画面には key そのものは出さない。設定済かどうかと、環境変数優先かのみ表示。
  const envStatus: Record<ProviderId, boolean> = {
    anthropic: !!(process.env.ANTHROPIC_API_KEY ?? "").trim(),
    openai: !!(process.env.OPENAI_API_KEY ?? "").trim(),
    google: !!(
      (process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim()
    ),
  };

  return (
    <div className="space-y-4">
      {/* 既存設定フォーム */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 space-y-6 max-w-3xl">
          <h2 className="font-bold text-lg">設定</h2>

          <form action={updateSettings} className="space-y-6">
            <DataRootField defaultValue={s.dataRoot} />

            <ProvidersField
              defaultProvider={s.defaultProvider}
              providers={s.providers}
              envStatus={envStatus}
            />

            {/* 保存期間（編集可能化） */}
            <section className="space-y-3">
              <div className="font-medium text-sm">保存期間（§7.5）</div>
              <div className="text-xs text-zinc-500">
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
                  <Label htmlFor="days_採用" className="text-xs text-zinc-500">採用</Label>
                  <Input
                    id="days_採用"
                    name="days_採用"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["採用"] ?? 0}
                  />
                  <div className="text-[10px] text-zinc-400">日数（0=削除しない）</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days_不採用" className="text-xs text-zinc-500">不採用</Label>
                  <Input
                    id="days_不採用"
                    name="days_不採用"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["不採用"] ?? 180}
                  />
                  <div className="text-[10px] text-zinc-400">日数</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days_未確定" className="text-xs text-zinc-500">未確定</Label>
                  <Input
                    id="days_未確定"
                    name="days_未確定"
                    type="number"
                    min={0}
                    defaultValue={s.retention.days["未確定"] ?? 0}
                  />
                  <div className="text-[10px] text-zinc-400">通常 0 推奨</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="softDeleteGraceDays" className="text-xs text-zinc-500">
                    ゴミ箱の猶予日数
                  </Label>
                  <Input
                    id="softDeleteGraceDays"
                    name="softDeleteGraceDays"
                    type="number"
                    min={0}
                    defaultValue={s.retention.softDeleteGraceDays}
                  />
                  <div className="text-[10px] text-zinc-400">
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

              {/* バックアップ世代の保持（§11 / 別タスクで自動掃除に連動） */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                <div className="space-y-1.5">
                  <Label htmlFor="backupKeepDays" className="text-xs text-zinc-500">
                    バックアップ保存日数
                  </Label>
                  <Input
                    id="backupKeepDays"
                    name="backupKeepDays"
                    type="number"
                    min={0}
                    defaultValue={s.retention.backupKeepDays ?? 90}
                  />
                  <div className="text-[10px] text-zinc-400">
                    日数（0=自動削除しない）
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="backupMaxGenerations" className="text-xs text-zinc-500">
                    バックアップ世代上限
                  </Label>
                  <Input
                    id="backupMaxGenerations"
                    name="backupMaxGenerations"
                    type="number"
                    min={0}
                    defaultValue={s.retention.backupMaxGenerations ?? 0}
                  />
                  <div className="text-[10px] text-zinc-400">
                    件数（0=無制限）
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="submit" size="sm">
                保存
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 操作カード: プレビュー・スイープ・ログ */}
      <div className="bg-white rounded-xl border shadow-sm">
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
          </div>
          <div className="text-xs text-zinc-500">
            設計書 §7.5 の二段階削除（sessions/ → _trash/ → 完全削除）。実行前に必ず「次に消える面談を確認」してください。
            ゴミ箱の中身は <a className="text-blue-600 hover:underline" href="/trash">/trash</a> で復元できます。
          </div>
          <RetentionManager />
        </div>
      </div>

      {/* バックアップ管理（Phase 4 / §11） */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold">バックアップ</h3>
            <span className="text-xs text-zinc-500">
              data/sessions + data/master → data/_backups/
            </span>
          </div>
          <BackupManager
            keepDays={s.retention.backupKeepDays ?? 90}
            maxGenerations={s.retention.backupMaxGenerations ?? 0}
          />
        </div>
      </div>

      {/* 監査ログリーダー（Phase 4 / §11） */}
      <AuditLogViewer limit={50} />
    </div>
  );
}

