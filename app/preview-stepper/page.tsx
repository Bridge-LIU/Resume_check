import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// v07 ステッパー案の実 Next.js プレビュー。
// nav には出さない（/manual と同じ扱い）。ダミーデータ。
// mode=paste / api を URL クエリで切替可能。

type StepKey = "s2" | "s4" | "s5" | "s6" | "s8";
type Mode = "paste" | "api";

type SP = Promise<{ section?: StepKey; mode?: Mode }>;

const STEPS: {
  key: StepKey;
  no: string;
  label: string;
  status: "done" | "current" | "todo";
  meta: string;
}[] = [
  { key: "s2", no: "②", label: "候補者情報", status: "done",    meta: "要約済 ・ 09:12" },
  { key: "s4", no: "④", label: "条件確定",   status: "done",    meta: "凍結 09:15 🔒" },
  { key: "s5", no: "⑤", label: "質問",       status: "current", meta: "15 問 ・ 表示中" },
  { key: "s6", no: "⑥", label: "面談内容",     status: "todo",    meta: "未着手" },
  { key: "s8", no: "⑧", label: "評価",       status: "todo",    meta: "未着手" },
];

export default async function PreviewStepperPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const { section = "s5", mode = "api" } = await searchParams;
  const currentIdx = STEPS.findIndex((s) => s.key === section);
  const current = STEPS[currentIdx] ?? STEPS[2];
  const prev = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const next = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;

  return (
    <div className="space-y-4">
      {/* 上部の切替バナー */}
      <div className="bg-card rounded-xl border shadow-sm p-3 flex items-center gap-3 text-xs">
        <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">
          プレビュー
        </span>
        <span className="text-muted-foreground">案07 ステッパー UI（実 Next.js ページ、ダミーデータ）</span>
        <span className="text-muted-foreground opacity-70">|</span>
        <span className="text-muted-foreground">節:</span>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <Link
              key={s.key}
              href={`/preview-stepper?section=${s.key}&mode=${mode}`}
              className={
                "px-2 py-0.5 rounded " +
                (s.key === section
                  ? "bg-blue-600 text-white"
                  : "border hover:bg-accent text-foreground/85")
              }
            >
              {s.no} {s.label}
            </Link>
          ))}
        </div>
        <span className="text-muted-foreground opacity-70">|</span>
        <span className="text-muted-foreground">Mode:</span>
        <div className="flex gap-1">
          <Link
            href={`/preview-stepper?section=${section}&mode=paste`}
            className={
              "px-2 py-0.5 rounded " +
              (mode === "paste"
                ? "bg-zinc-800 text-white"
                : "border hover:bg-accent text-foreground/85")
            }
          >
            貼付
          </Link>
          <Link
            href={`/preview-stepper?section=${section}&mode=api`}
            className={
              "px-2 py-0.5 rounded " +
              (mode === "api"
                ? "bg-emerald-600 text-white"
                : "border hover:bg-accent text-foreground/85")
            }
          >
            API
          </Link>
        </div>
        <div className="flex-1" />
        <Link href="/" className="text-primary hover:underline">
          現行画面 →
        </Link>
      </div>

      {/* セッション本体（現行 SessionPage と同じ外殻） */}
      <div className="bg-card rounded-xl border shadow-sm">
        {/* Header 再現 */}
        <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
          <Link
            href="/"
            className="h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 flex items-center"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            一覧
          </Link>
          <div className="h-5 w-px bg-secondary" />
          <h1 className="font-bold text-sm">山田 太郎</h1>
          <span className="pill pill-role-nw">ネットワーク</span>
          <span className="pill pill-qpub">質問公開</span>
          <div className="flex-1" />
          <button className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-accent">
            ⏸ 保留
          </button>
          <select className="text-xs border rounded px-2 py-1 bg-card">
            <option>採否: 未確定</option>
          </select>
          <span className="text-xs text-muted-foreground opacity-70 whitespace-nowrap">
            作成: 2026-06-30 09:00:12
          </span>
        </header>

        {/* Body: 左 stepper + 右 main */}
        <div className="grid grid-cols-4 min-h-[720px]">
          <aside className="col-span-1 border-r p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
              進捗 {STEPS.filter((s) => s.status === "done").length + 1} / {STEPS.length}
            </div>
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const isCurrent = s.key === section;
                const isDone = s.status === "done";
                const nextDone = STEPS[i + 1]?.status === "done";
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
                      <div className="bg-blue-50 -mx-2 px-4 py-2 rounded-lg border-2 border-blue-300 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0 ring-4 ring-blue-100 relative z-10">
                            ◉
                          </div>
                          <div className="flex-1 min-w-0 pt-1">
                            <div className="text-sm font-semibold text-blue-800">
                              {s.no} {s.label}
                            </div>
                            <div className="text-2xs text-blue-600">{s.meta}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Link
                        href={`/preview-stepper?section=${s.key}`}
                        className="w-full flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-accent text-left"
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
                          <div className="text-2xs text-muted-foreground opacity-70">{s.meta}</div>
                        </div>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 pt-4 border-t space-y-2">
              <button className="w-full text-xs border rounded-lg px-3 py-2 hover:bg-accent">
                📄 全体プレビュー
              </button>
              <button className="w-full text-xs border rounded-lg px-3 py-2 text-red-600 hover:bg-red-50">
                🗑️ ゴミ箱へ
              </button>
            </div>
          </aside>

          <main className="col-span-3 p-6 space-y-4">
            <SectionContent step={current} mode={mode} />
            <div className="flex items-center gap-2 pt-4 border-t">
              {prev ? (
                <Link
                  href={`/preview-stepper?section=${prev.key}&mode=${mode}`}
                  className="border rounded-lg px-4 py-2 text-sm hover:bg-accent"
                >
                  ← {prev.no} {prev.label}
                </Link>
              ) : (
                <span />
              )}
              <div className="flex-1" />
              <button className="border rounded-lg px-4 py-2 text-sm hover:bg-accent">
                保存
              </button>
              {next ? (
                <Link
                  href={`/preview-stepper?section=${next.key}&mode=${mode}`}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {next.no} {next.label} →
                </Link>
              ) : (
                <button className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
                  評価を確定
                </button>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ProviderModelSelect() {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Provider:</span>
      <select className="border rounded px-2 py-1 bg-card">
        <option>anthropic</option>
        <option>openai</option>
        <option>google</option>
      </select>
      <select className="border rounded px-2 py-1 bg-card">
        <option>claude-opus-4-7</option>
        <option>claude-sonnet-4-6</option>
      </select>
    </div>
  );
}

function SectionContent({
  step,
  mode,
}: {
  step: (typeof STEPS)[number];
  mode: Mode;
}) {
  const apiSupported = step.key === "s2" || step.key === "s5" || step.key === "s8";
  const activeMode: Mode = apiSupported ? mode : "paste";

  const title = (
    <div className="flex items-center gap-3 flex-wrap pb-3 border-b">
      <h2 className="text-xl font-bold">
        {step.no} {step.label}
      </h2>
      {step.status === "done" && (
        <span className="text-xs text-emerald-600 flex items-center gap-1">
          ✓ 保存済
        </span>
      )}
      <span className="text-xs text-muted-foreground opacity-70">{step.meta}</span>
      <div className="flex-1" />
      {apiSupported ? (
        <>
          {activeMode === "api" && <ProviderModelSelect />}
          <div className="flex rounded-lg border bg-card overflow-hidden text-xs">
            <span
              className={
                "px-3 py-1.5 " +
                (activeMode === "paste"
                  ? "bg-blue-600 text-white font-medium"
                  : "text-muted-foreground")
              }
            >
              貼付
            </span>
            <span
              className={
                "px-3 py-1.5 " +
                (activeMode === "api"
                  ? "bg-emerald-600 text-white font-medium"
                  : "text-muted-foreground")
              }
            >
              API
            </span>
          </div>
        </>
      ) : (
        <span className="text-xs text-muted-foreground opacity-70 italic">
          この節に Mode 切替はありません
        </span>
      )}
    </div>
  );

  if (step.key === "s2") {
    return (
      <>
        {title}
        {activeMode === "api" && (
          <div className="border rounded-lg p-3 bg-muted space-y-3">
            <div className="text-xs text-muted-foreground">
              履歴書（<strong>PDF / Word(.doc / .docx) / Excel(.xlsx / .xls)</strong>）をアップロードするか、
              テキストを貼り付けて「要約する（API）」を押すと AI が経歴・スキル・強み・懸念点で要約します。
              <div className="text-muted-foreground mt-1">
                ※ ファイルはサーバー側でテキスト抽出してから送信します（PDF の生バイナリは送りません）。
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                履歴書ファイル（任意）
              </div>
              <div className="flex items-center gap-2">
                <button className="border rounded-lg px-3 py-1.5 text-xs hover:bg-card">
                  📎 履歴書をアップ
                </button>
                <span className="text-2xs text-muted-foreground">
                  yamada_taro_cv.pdf ・ 12.4KB
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">履歴書テキスト（貼付も可）</div>
              <textarea
                rows={4}
                className="w-full border rounded-lg p-2 text-xs bg-card"
                placeholder="または履歴書テキストを直接貼り付け"
                defaultValue="山田 太郎 / 職歴 10 年 / SIer で NW 構築、その後社内 SE でクラウド移行担当..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium">
                要約する（API）
              </button>
              <span className="text-xs text-muted-foreground">
                anthropic / claude-sonnet-4-6 で実行
              </span>
            </div>
          </div>
        )}
        {activeMode === "paste" && (
          <div className="text-xs text-muted-foreground bg-blue-50/50 border border-blue-200 rounded-lg p-3">
            💡 貼付モード: 履歴書を Max チャットで要約 → 結果を下の項目に貼付してください
          </div>
        )}
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">経歴</div>
            <div className="border rounded-lg p-3 bg-muted">10 年、SIer → 社内 SE</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">主要スキル</div>
            <div className="border rounded-lg p-3 bg-muted">
              Cisco / Palo Alto / AWS Direct Connect / TransitGateway
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">強み</div>
            <div className="border rounded-lg p-3 bg-muted">
              大規模社内 NW 刷新の要件定義から検証まで自走した経験
            </div>
          </div>
        </div>
      </>
    );
  }
  if (step.key === "s4") {
    return (
      <>
        {title}
        <div className="text-xs text-muted-foreground bg-blue-50/50 border border-blue-200 rounded-lg p-3">
          🔒 凍結済（2026-06-30 09:15）— このセッションの評価軸・合格ラインは以下で固定されます
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">役割</div>
            <div className="font-medium mt-1">ネットワーク</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">合格ライン</div>
            <div className="font-medium mt-1 tabular">70</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">経験</div>
            <div className="font-medium mt-1">3 年以上 / 未経験不可</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">評価軸 / 重み</div>
          <ul className="space-y-1.5 text-sm">
            {[
              ["自己解決", 5],
              ["技術理解", 5],
              ["コミュニケーション", 3],
              ["業務経験", 4],
              ["適応力・柔軟性", 3],
            ].map(([n, w]) => (
              <li key={n} className="flex items-center gap-3 border rounded-lg p-2.5">
                <span className="flex-1">{n}</span>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        "w-5 h-5 rounded flex items-center justify-center text-xs " +
                        (i < (w as number)
                          ? "bg-blue-500 text-white"
                          : "bg-muted text-muted-foreground opacity-70")
                      }
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }
  if (step.key === "s5") {
    return (
      <>
        {title}
        {activeMode === "api" ? (
          <div className="border rounded-lg p-3 bg-muted flex items-center gap-3">
            <div className="flex-1 text-xs text-muted-foreground">
              ① 面談者情報 + ② 凍結条件を入力に、AI で
              「人間性 <b>7</b> 問 + 技術 <b>8</b> 問」を section 付きで生成します。
              <div className="text-muted-foreground mt-1">
                anthropic / claude-sonnet-4-6 で実行
              </div>
            </div>
            <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap">
              質問を生成
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-blue-50/50 border border-blue-200 rounded-lg p-3">
            💡 ④で凍結した条件に基づき、AI 生成のプロンプトを貼り付けてください
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            人間性 <b>7</b>
          </span>
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
            技術 <b>8</b>
          </span>
          <span className="text-xs text-muted-foreground">計 15 問</span>
          <div className="flex-1" />
          <button className="text-xs text-muted-foreground hover:text-blue-600">
            ▼ 質問数を変更
          </button>
        </div>
        <div className="border rounded-lg divide-y">
          {[
            [
              "Q1",
              "職務経歴の中で、最も自走的に動けた案件を教えてください。",
              "🎯 自己解決レベル ・ ⭐ STAR 型",
            ],
            [
              "Q2",
              "障害対応で「これは自分の判断で動いた」と誇れる例を教えてください。",
              "🎯 自己解決レベル ・ ⭐ STAR 型",
            ],
            [
              "Q3",
              "Cisco と Palo Alto を選ぶ場面と理由を教えてください。",
              "🎯 技術理解",
            ],
            [
              "Q4",
              "AWS Direct Connect 構築時にハマった点は？",
              "🎯 技術理解 ・ ⭐ STAR 型",
            ],
          ].map(([id, q, tag]) => (
            <div key={id} className="p-3 flex items-start gap-3 hover:bg-accent">
              <span className="text-xs text-muted-foreground opacity-70 tabular w-8 pt-0.5">{id}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{q}</div>
                <div className="text-2xs text-muted-foreground mt-1">{tag}</div>
              </div>
              <button className="text-xs text-muted-foreground opacity-70 hover:text-blue-600">✎</button>
            </div>
          ))}
          <div className="p-3 text-center text-xs text-muted-foreground opacity-70">
            … 残り 11 問（クリックで全表示）
          </div>
        </div>
      </>
    );
  }
  if (step.key === "s6") {
    return (
      <>
        {title}
        <div className="text-xs text-muted-foreground bg-amber-50/50 border border-amber-200 rounded-lg p-3">
          面談中の記録をここに貼付／記入します。保存時に面談内容として ⑧ 評価の入力になります
        </div>
        <textarea
          rows={12}
          className="w-full border rounded-lg p-3 text-sm bg-muted leading-relaxed"
          defaultValue={`Q1: 職務経歴で最も自走的に動けた案件は？
A1: 前職の大規模社内ネットワーク刷新で、要件定義から検証まで一人で回した。
仮説を立てて実機検証で確認するのを繰り返した…

Q2: 障害対応の具体例は？
A2: 深夜の VPN 断で、原因が … `}
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>2,340 字</span>
          <span>・</span>
          <span>面談 60 分</span>
        </div>
      </>
    );
  }
  // s8
  return (
    <>
      {title}
      {activeMode === "api" && (
        <div className="border rounded-lg p-3 bg-muted space-y-3">
          <div className="text-xs text-muted-foreground">
            ② 凍結条件 + ⑥ 面談内容を入力に、AI が BARS で採点します。
            厳格モードでより高性能なモデルを使用。
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium">
              評価する（API）
            </button>
            <label className="flex items-center gap-2 text-sm text-foreground/85 cursor-pointer">
              <span className="inline-block w-9 h-5 bg-blue-500 rounded-full relative">
                <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-card rounded-full shadow" />
              </span>
              厳格モード（Opus 4.7）
            </label>
            <span className="text-xs text-muted-foreground">※ 結果は自動保存されます</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="text-xs text-emerald-700">総合スコア</div>
          <div className="text-4xl font-bold tabular text-emerald-700 mt-1">82.4</div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="text-xs text-emerald-700">合否</div>
          <div className="text-3xl font-bold text-emerald-700 mt-1">合格</div>
        </div>
        <div className="rounded-xl bg-muted border p-4">
          <div className="text-xs text-muted-foreground">採否</div>
          <div className="text-3xl font-bold text-emerald-700 mt-1">採用</div>
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">評価軸</div>
        <ul className="text-sm space-y-2">
          {[
            ["自己解決", 4.2, 84],
            ["技術理解", 4.5, 90],
            ["コミュニケーション", 3.8, 76],
            ["業務経験", 4.0, 80],
          ].map(([n, v, w]) => (
            <li key={n as string} className="flex gap-3">
              <span className="w-32">{n}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${w}%` }} />
              </div>
              <span className="w-8 text-right tabular">
                {(v as number).toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
