import { listRoles, getEvalCriteria } from "@/lib/storage";
import RolesEditor from "./RolesEditor";
import EvalCriteriaEditor from "./EvalCriteriaEditor";
import MasterIO from "./MasterIO";
import { PageHeader } from "@/app/_components/PageHeader";
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
      <div className="bg-white rounded-xl border shadow-sm">
        <PageHeader title="マスタ管理" />
        <div className="p-6">
          <p className="text-xs text-zinc-500">
            役割別の「求める人材条件」と、共通の「評価条件（BARS）」を編集します。
            ここでの変更は<strong className="text-zinc-700">これから作成する面談</strong>に反映されます。
            既存の面談は④確定時の凍結スナップショットを使うため影響を受けません。
          </p>
        </div>
      </div>

      <MasterIO />
      <RolesEditor initialRoles={roles} />
      <EvalCriteriaEditor initial={evalCriteria} roles={roles} />
    </div>
  );
}
