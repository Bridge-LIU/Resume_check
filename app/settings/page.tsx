import "server-only";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadSettings, saveSettings, validateDataRoot } from "@/lib/storage";
import type {
  LlmStage,
  ProviderConfig,
  ProviderId,
  ProviderSafeStatus,
  Settings,
} from "@/lib/types";
import { AuditLogViewer } from "./_components/AuditLogViewer";
import { DataRootField } from "./_components/DataRootField";
import { RetentionManager } from "./_components/RetentionManager";
import { BackupManager } from "./_components/BackupManager";
import { ProvidersField } from "./_components/ProvidersField";
import { SaveSettingsButton } from "./_components/SaveSettingsButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const STAGES: LlmStage[] = ["summary", "questions", "evaluation", "evaluationStrict"];

/**
 * API モード関連 UI の表示フラグ。
 * Phase 1（貼付モード）では以下は非表示:
 *   - ProvidersField（Anthropic/OpenAI/Google 键 + 工程別モデル）
 *   - 質問生成数（貼付運用では既定 7/8 で十分。設定値は settings.json に残る）
 * フォーム送信側も この flag で分岐し、非表示中は current 値を そのまま維持する
 * （表示されていないフィールドを取り込んで書き潰してしまわないため）。
 * Phase 2 で API モードを有効化する際に true に切り替えるだけで復活する。
 */
const SHOW_API_SETTINGS = false;

async function updateSettings(formData: FormData) {
  "use server";
  const current = loadSettings();
  const numOr = (v: FormDataEntryValue | null, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };

  // API モード UI 非表示中は providers / defaultProvider / questionCounts の
  // フォーム項目は そもそも DOM に無い。 formData から取り込むと フィールド不在 →
  // 誤って空値扱い で 既存 設定を上書きしてしまう恐れがあるため、その場合は
  // current 値を そのまま維持する。
  let providers: Record<ProviderId, ProviderConfig>;
  let defaultProvider: ProviderId;
  let questionCounts: Settings["questionCounts"];

  if (SHOW_API_SETTINGS) {
    // プロバイダごとの key / モデルを取り出す（空欄は現状維持、削除チェックで明示クリア）
    const providerIds: ProviderId[] = ["anthropic", "openai", "google"];
    providers = { ...current.providers };
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
    defaultProvider =
      submittedDefaultProvider === "anthropic" ||
      submittedDefaultProvider === "openai" ||
      submittedDefaultProvider === "google"
        ? submittedDefaultProvider
        : current.defaultProvider;

    // ⑤質問生成数（1〜50 にクランプ）
    // v が null / 空文字のときは fallback。Number(null) = 0 で誤って 1 に丸まるのを防ぐ。
    const clampQ = (v: FormDataEntryValue | null, fallback: number) => {
      if (v == null || v === "") return fallback;
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(1, Math.min(50, Math.floor(n)));
    };
    questionCounts = {
      nontech: clampQ(formData.get("q_nontech"), current.questionCounts.nontech),
      tech: clampQ(formData.get("q_tech"), current.questionCounts.tech),
    };
  } else {
    providers = current.providers;
    defaultProvider = current.defaultProvider;
    questionCounts = current.questionCounts;
  }

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
  redirect("/settings?saved=1");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error: errorMsg, saved } = await searchParams;
  const s = loadSettings();
  // 画面には key そのものは出さない。設定済かどうかと、環境変数優先かのみ表示。
  const envStatus: Record<ProviderId, boolean> = {
    anthropic: !!(process.env.ANTHROPIC_API_KEY ?? "").trim(),
    openai: !!(process.env.OPENAI_API_KEY ?? "").trim(),
    google: !!(
      (process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim()
    ),
  };
  // ⚠ providers をそのまま client component に渡すと RSC payload に
  // API キー文字列がそのまま乗ってブラウザに送られる。boolean + モデル名だけに
  // 詰め替えてから渡す（Critical: 設定画面からのキー漏洩防止）。
  const providersSafe: Record<ProviderId, ProviderSafeStatus> = {
    anthropic: {
      hasFileKey: !!s.providers.anthropic.key.trim(),
      defaultModel: s.providers.anthropic.defaultModel,
    },
    openai: {
      hasFileKey: !!s.providers.openai.key.trim(),
      defaultModel: s.providers.openai.defaultModel,
    },
    google: {
      hasFileKey: !!s.providers.google.key.trim(),
      defaultModel: s.providers.google.defaultModel,
    },
  };

  return (
    <div className="space-y-4">
      {/* 既存設定フォーム */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 space-y-6 max-w-3xl">
          <h1 className="font-bold text-lg">設定</h1>

          {errorMsg && (
            <div
              role="alert"
              className="border border-red-300 bg-red-50 text-red-800 text-sm rounded px-3 py-2"
            >
              保存できませんでした: {errorMsg}
            </div>
          )}
          {saved && !errorMsg && (
            <div
              role="status"
              className="border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm rounded px-3 py-2"
            >
              設定を保存しました。
            </div>
          )}

          <form action={updateSettings} className="space-y-6">
            <DataRootField defaultValue={s.dataRoot} />

            {SHOW_API_SETTINGS && (
              <ProvidersField
                defaultProvider={s.defaultProvider}
                providers={providersSafe}
                envStatus={envStatus}
              />
            )}

            {/* 質問生成数 — prompt と maxTokens 上限が両方この値から自動算出される */}
            {SHOW_API_SETTINGS && (
              <section className="space-y-3">
                <div className="font-medium text-sm">質問生成数</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="q_nontech" className="text-xs text-zinc-500">
                      非技術
                    </Label>
                    <Input
                      id="q_nontech"
                      name="q_nontech"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={s.questionCounts.nontech}
                    />
                    <div className="text-2xs text-zinc-400">
                      自己紹介・キャリア・志望動機 等
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="q_tech" className="text-xs text-zinc-500">
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
                    <div className="text-2xs text-zinc-400">
                      候補者の経歴・条件に紐づく専門質問
                    </div>
                  </div>
                </div>
              </section>
            )}

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
                  <div className="text-2xs text-zinc-400">日数（0=削除しない）</div>
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
                  <div className="text-2xs text-zinc-400">日数</div>
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
                  <div className="text-2xs text-zinc-400">通常 0 推奨</div>
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
                  <div className="text-2xs text-zinc-400">
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
                  <div className="text-2xs text-zinc-400">
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
                  <div className="text-2xs text-zinc-400">
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
            <Link
              href="/trash"
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              ゴミ箱を開く →
            </Link>
          </div>
          <div className="text-xs text-zinc-500">
            設計書 §7.5 の二段階削除（sessions/ → _trash/ → 完全削除）。実行前に必ず「次に消える面談を確認」してください。移動済みの面談は猶予期間内ならゴミ箱から復元できます。
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

