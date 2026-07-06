import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
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
import { isFullEdition } from "@/lib/edition";
import type { LlmStage, ProviderId } from "@/lib/types";
import { Section2Candidate } from "./_components/Section2Candidate";
import { Section4Conditions } from "./_components/Section4Conditions";
import { Section5Questions } from "./_components/Section5Questions";
import { Section6Minutes } from "./_components/Section6Minutes";
import { Section8Evaluation } from "./_components/Section8Evaluation";
import { SessionMetaControls } from "./_components/SessionMetaControls";
import { SidebarNav } from "./_components/SidebarNav";

export interface LlmDefaults {
  defaultProvider: ProviderId;
  hasKey: Record<ProviderId, boolean>;
  modelBy: Record<LlmStage, string>;
}

const ROLE_PILL_MAP: Record<string, string> = {
  NW: "pill-role-nw",
  Server: "pill-role-sv",
  Dev: "pill-role-dev",
  Special: "pill-role-sp",
  PMO: "pill-role-pm",
  ITSupport: "pill-role-it",
};
const STATUS_PILL_MAP: Record<string, string> = {
  編集中: "pill-edit",
  質問公開: "pill-qpub",
  面談済: "pill-itv",
  評価済: "pill-eval",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
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

  // 完全版のみ: セッション内 ProviderModelSelect の既定表示に使う
  // (⚠ hasKey は boolean のみ。API キー文字列は client に渡さない)
  const llmDefaults: LlmDefaults | undefined = (() => {
    if (!isFullEdition()) return undefined;
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

  const rolePill = ROLE_PILL_MAP[meta.役割] ?? "pill";
  const statusPill = STATUS_PILL_MAP[meta.status] ?? "pill-edit";

  const sectionStatus = {
    "s2": !!candidate,
    "s4": !!snapshot,
    "s5": !!questions,
    "s6": !!minutes,
    "s8": !!evaluation,
  };

  const createdAt = new Date(meta.作成日時);
  const pad = (n: number) => String(n).padStart(2, "0");
  const createdFull =
    `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())} ` +
    `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}:${pad(createdAt.getSeconds())}`;

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
        <Tip content="一覧へ戻る">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="group h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
          >
            <Link href="/" aria-label="一覧へ戻る">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              一覧
            </Link>
          </Button>
        </Tip>
        <div className="h-5 w-px bg-zinc-200" aria-hidden="true" />
        <h1 className="font-bold whitespace-nowrap m-0 text-sm truncate max-w-[16ch]" title={meta.id}>
          {meta.氏名}
        </h1>
        <span className={`pill ${rolePill}`}>{meta.役割}</span>
        <span className={`pill ${statusPill}`}>{meta.status}</span>
        <div className="flex-1" />
        <SessionMetaControls
          sessionId={meta.id}
          initialHold={meta.hold}
          initialResult={meta.result}
          current氏名={meta.氏名}
          current役割={meta.役割}
          availableRoles={availableRoles}
        />
        <span className="text-xs text-zinc-400 whitespace-nowrap" title="作成日時">
          作成: {createdFull}
        </span>
      </header>

      <div className="flex flex-col md:flex-row">
        <SidebarNav status={sectionStatus} />
        <main className="flex-1 p-6 space-y-8 min-w-0">
          <section id="s2" className="scroll-mt-4">
            <Section2Candidate
              sessionId={id}
              initial={candidate}
              llmDefaults={llmDefaults}
            />
          </section>
          <section id="s4" className="scroll-mt-4">
            <Section4Conditions
              sessionId={id}
              roleId={meta.役割}
              roleMaster={roleMaster}
              snapshot={snapshot}
            />
          </section>
          <section id="s5" className="scroll-mt-4">
            <Section5Questions
              sessionId={id}
              initial={questions}
              questionCounts={settings.questionCounts}
              llmDefaults={llmDefaults}
            />
          </section>
          <section id="s6" className="scroll-mt-4">
            <Section6Minutes sessionId={id} initial={minutes} />
          </section>
          <section id="s8" className="scroll-mt-4">
            <Section8Evaluation
              sessionId={id}
              initial={evaluation}
              llmDefaults={llmDefaults}
              frozenAt={snapshot?.frozenAt ?? null}
              minutesUpdatedAt={minutes?.updatedAt ?? null}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
