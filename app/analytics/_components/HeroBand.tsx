import { Sparkles } from "lucide-react";

/** /analytics ページ最上部の Hero。ページの目的説明 + 合格率大字。 */
export function HeroBand({
  total,
  pass,
}: {
  total: number;
  pass: number;
}) {
  const passRate = total > 0 ? pass / total : 0;
  return (
    <div className="bg-gradient-to-br from-primary/10 via-card to-card rounded-xl border shadow-sm p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 text-2xs text-primary/85 font-mono uppercase tracking-widest mb-1">
            <Sparkles className="h-3 w-3" /> Analytics Dashboard
          </div>
          <h1 className="text-2xl font-bold mb-2">面談分析ダッシュボード</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            完了した面談を匿名化して集計。氏名 / 履歴書 / 面談内容は含みません（PII なし）。
            採用判断のパターン、軸バランス、役割別の傾向を確認して、
            <span className="text-foreground/85 font-medium">
              「次の面談で何を重点的に聞くか」
            </span>
            を決めるためのビューです。
          </p>
        </div>
        <div className="bg-card/70 backdrop-blur rounded-lg border px-5 py-3 shadow-sm">
          <div className="text-2xs text-muted-foreground uppercase tracking-wider">
            合格率 · 全期間
          </div>
          <div className="text-4xl font-bold tabular text-primary mt-0.5">
            {(passRate * 100).toFixed(0)}
            <span className="text-lg font-normal text-muted-foreground ml-0.5">
              %
            </span>
          </div>
          <div className="text-2xs text-muted-foreground mt-0.5 tabular">
            {pass} / {total} 件
          </div>
        </div>
      </div>
    </div>
  );
}
