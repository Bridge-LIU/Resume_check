import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { MonthlyBucket } from "@/lib/analytics";

/**
 * KPI 4 枚: 合格率 / 平均総合スコア / 面談数 / 役割数。
 * 各 KPI は前期比 (Trend) と 6 月分 Sparkline を並記。
 */
export function KpiRow({
  total,
  pass,
  avgTotal,
  roleCount,
  monthly,
}: {
  total: number;
  pass: number;
  avgTotal: number;
  roleCount: number;
  monthly: MonthlyBucket[];
}) {
  const passRate = total > 0 ? pass / total : 0;

  const cur = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];

  const passRateOf = (m: MonthlyBucket): number =>
    m.total > 0 ? m.pass / m.total : 0;

  const passRateDelta = cur && prev ? passRateOf(cur) - passRateOf(prev) : 0;
  const avgDelta = cur && prev ? cur.avgTotal - prev.avgTotal : 0;
  const countDelta =
    cur && prev ? (cur.total - prev.total) / Math.max(prev.total, 1) : 0;

  const passRateSpark = monthly.map(passRateOf);
  const avgSpark = monthly.map((m) => m.avgTotal);
  const countSpark = monthly.map((m) => m.total);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        icon={<Target className="h-4 w-4" />}
        label="合格率"
        value={(passRate * 100).toFixed(0)}
        suffix="%"
        trend={<Trend delta={passRateDelta} />}
        sparkline={
          <Sparkline points={passRateSpark} color="hsl(var(--primary))" />
        }
        emphasis
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="平均総合スコア"
        value={avgTotal.toFixed(2)}
        suffix=" / 5"
        trend={<Trend delta={avgDelta} />}
        sparkline={<Sparkline points={avgSpark} color="hsl(160 60% 40%)" />}
      />
      <KpiCard
        icon={<Users className="h-4 w-4" />}
        label="面談数"
        value={total.toString()}
        suffix="件"
        trend={<Trend delta={countDelta} />}
        sparkline={<Sparkline points={countSpark} color="hsl(230 60% 55%)" />}
      />
      <KpiCard
        icon={<Users className="h-4 w-4" />}
        label="役割数"
        value={roleCount.toString()}
        suffix="種"
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
  trend,
  sparkline,
  emphasis,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  trend?: React.ReactNode;
  sparkline?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`
        border rounded-lg p-4 transition-all
        ${emphasis ? "bg-primary/5 ring-1 ring-primary/30" : "bg-card"}
        hover:ring-1 hover:ring-primary/40 hover:shadow-[0_0_16px_hsl(var(--primary)/0.25)]
      `}
    >
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span
          className={`text-3xl font-bold tabular ${emphasis ? "text-primary" : ""}`}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-sm text-muted-foreground font-normal">
            {suffix}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 min-h-[20px]">
        {trend ?? <span />}
        {sparkline}
      </div>
    </div>
  );
}

/** 前期比バッジ。delta > 0 で上昇、invert=true なら「上昇 = 悪い」（例: 不合格率）扱い */
function Trend({ delta, invert = false }: { delta: number; invert?: boolean }) {
  const goodUp = !invert;
  const isUp = delta > 0.001;
  const isDown = delta < -0.001;
  const cls = isUp
    ? goodUp
      ? "text-emerald-600 bg-emerald-500/10"
      : "text-rose-600 bg-rose-500/10"
    : isDown
      ? goodUp
        ? "text-rose-600 bg-rose-500/10"
        : "text-emerald-600 bg-emerald-500/10"
      : "text-muted-foreground bg-muted";
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const abs = Math.abs(delta);
  const fmt = abs >= 1 ? abs.toFixed(1) : (abs * 100).toFixed(0) + "%";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-2xs font-medium px-1.5 py-0.5 rounded-full ${cls}`}
      title="前期比"
    >
      <Icon className="h-3 w-3" />
      {isUp || isDown ? fmt : "—"}
    </span>
  );
}

function Sparkline({
  points,
  color = "hsl(var(--primary))",
}: {
  points: number[];
  color?: string;
}) {
  if (points.length === 0) return null;
  const W = 80;
  const H = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 0.001);
  const pts = points
    .map(
      (v, i) =>
        `${(i / Math.max(points.length - 1, 1)) * W},${H - ((v - min) / range) * H}`,
    )
    .join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
