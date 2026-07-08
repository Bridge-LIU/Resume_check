import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getCandidate,
  getConditionsSnapshot,
  getEvaluation,
  getMinutes,
  getQuestions,
  getRole,
  getSessionMeta,
  listRoles,
  loadSettings,
} from "@/lib/storage";
import { rolePillClass, statusPillClass } from "@/lib/uiClass";
import type { LlmStage, ProviderId } from "@/lib/types";
import { Section2Candidate } from "./_components/Section2Candidate";
import { Section4Conditions } from "./_components/Section4Conditions";
import { Section5Questions } from "./_components/Section5Questions";
import { Section6Minutes } from "./_components/Section6Minutes";
import { Section8Evaluation } from "./_components/Section8Evaluation";
import { SessionMetaControls } from "./_components/SessionMetaControls";

export interface LlmDefaults {
  defaultProvider: ProviderId;
  hasKey: Record<ProviderId, boolean>;
  modelBy: Record<LlmStage, string>;
}

type StepKey = "s2" | "s4" | "s5" | "s6" | "s8";

const STEPS: { key: StepKey; no: string; label: string }[] = [
  { key: "s2", no: "①", label: "面談者情報" },
  { key: "s4", no: "②", label: "求める人材条件" },
  { key: "s5", no: "③", label: "質問リスト" },
  { key: "s6", no: "④", label: "面談内容" },
  { key: "s8", no: "⑤", label: "評価・合否判定" },
];

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: StepKey }>;
}) {
  const { id: rawId } = await params;
  const { section: rawSection } = await searchParams;
  // Server Action の redirect でエンコードした URL が、params 側で
  // デコードされず素通しになるケースがある（Next.js 16 / Turbopack）。
  // 既にデコード済みなら decodeURIComponent は冪等（% が無ければ無変換）なので安全。
  const id = (() => {
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  })();
  const meta = getSessionMeta(id);
  if (!meta) notFound();

  const candidate = getCandidate(id);
  const snapshot = getConditionsSnapshot(id);
  const questions = getQuestions(id);
  const minutes = getMinutes(id);
  const evaluation = getEvaluation(id);
  const roleMaster = getRole(meta.役割);
  const settings = loadSettings();
  const allRoles = listRoles();
  const availableRoles = allRoles.map((r) => ({
    id: r.id,
    label: r.役割 ? `${r.id}（${r.役割}）` : r.id,
  }));
  // 現在の役割がマスタから消されていても select に出せるよう、不足分を補完
  if (!availableRoles.some((r) => r.id === meta.役割)) {
    availableRoles.unshift({ id: meta.役割, label: `${meta.役割}（マスタ削除済）` });
  }

  // セッション内 ProviderModelSelect の既定表示に使う
  // (⚠ hasKey は boolean のみ。API キー文字列は client に渡さない)
  const llmDefaults: LlmDefaults = (() => {
    const defProv = settings.providers[settings.defaultProvider];
    return {
      defaultProvider: settings.defaultProvider,
      hasKey: {
        anthropic:
          !!process.env.ANTHROPIC_API_KEY?.trim() ||
          !!settings.providers.anthropic.key.trim(),
        openai:
          !!process.env.OPENAI_API_KEY?.trim() ||
          !!settings.providers.openai.key.trim(),
        google:
          !!(process.env.GOOGLE_API_KEY?.trim() ?? process.env.GEMINI_API_KEY?.trim()) ||
          !!settings.providers.google.key.trim(),
      },
      modelBy: {
        summary: defProv.models.summary ?? defProv.defaultModel,
        questions: defProv.models.questions ?? defProv.defaultModel,
        evaluation: defProv.models.evaluation ?? defProv.defaultModel,
        evaluationStrict: defProv.models.evaluationStrict ?? defProv.defaultModel,
      },
    };
  })();

  const rolePill = rolePillClass(meta.役割);
  const statusPill = statusPillClass(meta.status);

  const done: Record<StepKey, boolean> = {
    s2: !!candidate,
    s4: !!snapshot,
    s5: !!questions,
    s6: !!minutes,
    s8: !!evaluation,
  };

  // section 未指定なら「未完了の最初の節」を出す（全部完了なら評価 s8）。
  // ただし、そのまま描画するとフォーカス外し (onBlur → 自動保存) で done 状態が変わり、
  // 次のリバリデーションで defaultSection が別の節にジャンプしてしまう。
  // → 初回のみ URL に ?section= を刻んでリダイレクトし、以降は URL が正となるように固定する。
  const defaultSection: StepKey =
    STEPS.find((s) => !done[s.key])?.key ?? "s8";
  if (rawSection == null) {
    redirect(`/sessions/${encodeURIComponent(id)}?section=${defaultSection}`);
  }
  const section: StepKey = rawSection;

  const idx = STEPS.findIndex((s) => s.key === section);
  const prev = idx > 0 ? STEPS[idx - 1] : null;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : null;

  const createdAt = new Date(meta.作成日時);
  const pad = (n: number) => String(n).padStart(2, "0");
  const createdFull =
    `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())} ` +
    `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}:${pad(createdAt.getSeconds())}`;

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-4 border-b">
        <h1 className="font-bold text-lg">新規面談</h1>
      </div>
      <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
        <span className="font-bold whitespace-nowrap text-base truncate max-w-[16ch]" title={meta.id}>
          {meta.氏名}
        </span>
        <span className={rolePill}>{meta.役割}</span>
        <span className={statusPill}>{meta.status}</span>
        <div className="flex-1" />
        <SessionMetaControls
          sessionId={meta.id}
          initialHold={meta.hold}
          initialResult={meta.result}
          current氏名={meta.氏名}
          current役割={meta.役割}
          availableRoles={availableRoles}
        />
        <span className="text-xs text-muted-foreground opacity-70 whitespace-nowrap" title="作成日時">
          作成: {createdFull}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-6 min-h-[720px]">
        {/* Stepper (lg 未満では上に横積み) */}
        <aside className="lg:col-span-1 border-b lg:border-b-0 lg:border-r p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
            進捗 {Object.values(done).filter(Boolean).length} / {STEPS.length}
          </div>
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const isCurrent = s.key === section;
              const isDone = done[s.key];
              const nextDone = i < STEPS.length - 1 && done[STEPS[i + 1].key];
              return (
                <li key={s.key} className="relative pb-2">
                  {i < STEPS.length - 1 && (
                    <div
                      className={
                        "absolute left-4 top-8 h-full w-0.5 " +
                        (isDone && nextDone ? "bg-emerald-500" : "bg-secondary")
                      }
                    />
                  )}
                  {isCurrent ? (
                    <div className="bg-blue-50 px-2 py-2 rounded-lg border-2 border-blue-300 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0 ring-4 ring-blue-100 relative z-10">
                          ◉
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="text-sm font-semibold text-blue-800">
                            {s.no} {s.label}
                          </div>
                          <div className="text-2xs text-blue-600">
                            {isDone ? "保存済" : "未着手"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={`/sessions/${encodeURIComponent(id)}?section=${s.key}`}
                      className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-accent text-left"
                    >
                      <div
                        className={
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 relative z-10 " +
                          (isDone
                            ? "bg-emerald-500 text-white"
                            : "bg-card border-2 border-border text-muted-foreground opacity-70")
                        }
                      >
                        {isDone ? "✓" : i + 1}
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <div
                          className={
                            "text-sm " +
                            (isDone ? "font-medium text-foreground" : "text-muted-foreground")
                          }
                        >
                          {s.no} {s.label}
                        </div>
                        <div className="text-2xs text-muted-foreground opacity-70">
                          {isDone ? "保存済" : "未着手"}
                        </div>
                      </div>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>

        {/* 右側: 選択中の 1 節を表示 */}
        <main className="lg:col-span-5 p-6 min-w-0">
          {section === "s2" && (
            <Section2Candidate
              sessionId={id}
              initial={candidate}
              llmDefaults={llmDefaults}
            />
          )}
          {section === "s4" && (
            <Section4Conditions
              sessionId={id}
              roleId={meta.役割}
              roleMaster={roleMaster}
              snapshot={snapshot}
            />
          )}
          {section === "s5" && (
            <Section5Questions
              sessionId={id}
              initial={questions}
              questionCounts={settings.questionCounts}
              llmDefaults={llmDefaults}
            />
          )}
          {section === "s6" && (
            <Section6Minutes sessionId={id} initial={minutes} />
          )}
          {section === "s8" && (
            <Section8Evaluation
              sessionId={id}
              initial={evaluation}
              llmDefaults={llmDefaults}
              frozenAt={snapshot?.frozenAt ?? null}
              minutesUpdatedAt={minutes?.updatedAt ?? null}
            />
          )}

          {/* 前へ / 次へ (shadcn Button に統一で rounded-md / height を揃える) */}
          <div className="flex items-center gap-2 pt-6 mt-6 border-t">
            {prev ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/sessions/${encodeURIComponent(id)}?section=${prev.key}`}>
                  ← {prev.no} {prev.label}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex-1" />
            {next ? (
              <Button asChild size="sm">
                <Link href={`/sessions/${encodeURIComponent(id)}?section=${next.key}`}>
                  {next.no} {next.label} →
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Link href="/list">一覧へ戻る</Link>
              </Button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
