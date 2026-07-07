import { listRoles, getEvalCriteria } from "@/lib/storage";
import RolesEditor from "./RolesEditor";
import EvalCriteriaEditor from "./EvalCriteriaEditor";
import MasterIO from "./MasterIO";
import type { EvalCriteria } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_EVAL: EvalCriteria = {
  方式: "BARS",
  評価軸: [],
  スケール: { 最小: 0, 最大: 5.0, 刻み: 0.5, 段階数: 11 },
  合格ライン: 4.2,
  普通ライン: 3.5,
  自己解決レベル: "0〜5の5段階で別途評価",
  出力: ["軸ごとのスコアと根拠", "総合スコア", "合否", "良い点", "懸念点"],
};

export default async function MasterPage() {
  const roles = listRoles();
  const evalCriteria = getEvalCriteria() ?? DEFAULT_EVAL;

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border shadow-sm">
        <div className="p-6 space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg">求人情報管理</h1>
              <p className="text-xs text-muted-foreground mt-2">
                役割別の「求める人材条件」と、共通の「評価条件（BARS）」を編集します。
                ここでの変更は<strong className="text-foreground/85">これから作成する面談</strong>に反映されます。
                既存の面談は④確定時の凍結スナップショットを使うため影響を受けません。
              </p>
            </div>
            <div className="shrink-0">
              <div className="text-xs text-muted-foreground mb-1 text-right">
                役割 + 評価条件をまとめて書き出し
              </div>
              <MasterIO />
            </div>
          </div>
        </div>
      </div>

      <RolesEditor initialRoles={roles} />
      <EvalCriteriaEditor initial={evalCriteria} roles={roles} />
    </div>
  );
}
