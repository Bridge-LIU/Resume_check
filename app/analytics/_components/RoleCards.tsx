import type { RoleBucket } from "@/lib/analytics";
import { rolePillClass } from "@/lib/uiClass";

/**
 * 役割別カード。合格率大字 + 平均 + 底部 pass/mid/fail 三色バー。
 * 合格率降順に並べる。
 */
export function RoleCards({ data }: { data: RoleBucket[] }) {
  const sorted = [...data].sort((a, b) => b.passRate - a.passRate);
  if (sorted.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        役割データがありません。
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {sorted.map((r) => (
        <RoleCard key={r.役割} r={r} />
      ))}
    </div>
  );
}

function RoleCard({ r }: { r: RoleBucket }) {
  const rateCls =
    r.passRate >= 0.6
      ? "text-emerald-600 dark:text-emerald-400"
      : r.passRate >= 0.4
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  const passW = r.total > 0 ? (r.pass / r.total) * 100 : 0;
  const midW = r.total > 0 ? (r.mid / r.total) * 100 : 0;
  const failW = r.total > 0 ? (r.fail / r.total) * 100 : 0;
  return (
    <div className="border rounded-lg p-3 bg-card hover:ring-1 hover:ring-primary/40 hover:shadow-[0_0_14px_hsl(var(--primary)/0.2)] transition-all">
      <div className="mb-2">
        <span className={rolePillClass(r.役割)}>{r.役割}</span>
      </div>
      <div className={`text-3xl font-bold tabular ${rateCls}`}>
        {(r.passRate * 100).toFixed(0)}
        <span className="text-sm font-normal ml-0.5">%</span>
      </div>
      <div className="text-2xs text-muted-foreground tabular">
        合格 {r.pass} / {r.total} 件 ・ 平均 {r.avgTotal.toFixed(1)}
      </div>
      <div className="flex h-1.5 mt-2 rounded overflow-hidden bg-muted">
        {passW > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${passW}%` }}
            title={`合格 ${r.pass}`}
          />
        )}
        {midW > 0 && (
          <div
            className="bg-amber-400"
            style={{ width: `${midW}%` }}
            title={`普通 ${r.mid}`}
          />
        )}
        {failW > 0 && (
          <div
            className="bg-rose-500"
            style={{ width: `${failW}%` }}
            title={`不合格 ${r.fail}`}
          />
        )}
      </div>
    </div>
  );
}
