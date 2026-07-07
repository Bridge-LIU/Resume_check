"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// initial* と内部 state の同期は親側の <SessionListFilters key=...> による再マウントで行う。
// 旧実装は useEffect で setState を呼んで同期していたが、React 19 の
// react-hooks/set-state-in-effect ルールに抵触するため key パターンへ移行。
import { X } from "lucide-react";
import type { SessionMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "" は「すべて」を意味する。Select は "" を許容しないので __all__ を内部値に使う */
const ALL = "__all__";

const STATUS_OPTIONS: SessionMeta["status"][] = [
  "編集中",
  "質問公開",
  "面談済",
  "評価済",
];
const RESULT_OPTIONS: SessionMeta["result"][] = ["採用", "不採用", "未確定"];
const VERDICT_OPTIONS: NonNullable<SessionMeta["合否"]>[] = [
  "合格",
  "普通",
  "不合格",
];

export function SessionListFilters({
  initialState,
  initialRole,
  initialResult,
  initialVerdict,
  initialQ,
  roleOptions,
  basePath = "/list",
  hideStatus = false,
}: {
  initialState?: string;
  initialRole?: string;
  initialResult?: string;
  initialVerdict?: string;
  initialQ?: string;
  roleOptions: string[];
  /** フィルタ変更時の遷移先ルート。/compare でも使えるようにする */
  basePath?: string;
  /** 「状態」ドロップダウンを非表示にする（/compare は 評価済 前提のため） */
  hideStatus?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, setState] = useState(initialState ?? "");
  const [role, setRole] = useState(initialRole ?? "");
  const [result, setResult] = useState(initialResult ?? "");
  const [verdict, setVerdict] = useState(initialVerdict ?? "");
  const [q, setQ] = useState(initialQ ?? "");

  // 親側で key を URL パラメータに連動させているため、URL 変更時はこのコンポーネント
  // ごと再マウントされ、上記 useState 初期値が initial* から再評価される。

  const push = useCallback(
    (next: { state: string; role: string; result: string; verdict: string; q: string }) => {
      const params = new URLSearchParams();
      if (next.state) params.set("state", next.state);
      if (next.role) params.set("role", next.role);
      if (next.result) params.set("result", next.result);
      if (next.verdict) params.set("verdict", next.verdict);
      if (next.q) params.set("q", next.q);
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${basePath}?${qs}` : basePath);
      });
    },
    [router, basePath],
  );

  // q だけ debounce
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (q === (initialQ ?? "")) return;
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      push({ state, role, result, verdict, q });
    }, 300);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function handleState(v: string) {
    const next = v === ALL ? "" : v;
    setState(next);
    push({ state: next, role, result, verdict, q });
  }
  function handleRole(v: string) {
    const next = v === ALL ? "" : v;
    setRole(next);
    push({ state, role: next, result, verdict, q });
  }
  function handleResult(v: string) {
    const next = v === ALL ? "" : v;
    setResult(next);
    push({ state, role, result: next, verdict, q });
  }
  function handleVerdict(v: string) {
    const next = v === ALL ? "" : v;
    setVerdict(next);
    push({ state, role, result, verdict: next, q });
  }
  function reset() {
    setState("");
    setRole("");
    setResult("");
    setVerdict("");
    setQ("");
    startTransition(() => router.push(basePath));
  }

  const hasAnyFilter = !!(state || role || result || verdict || q);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {!hideStatus && (
        <FilterField label="状態">
          <Select value={state || ALL} onValueChange={handleState}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>すべて</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}

      <FilterField label="役割">
        <Select value={role || ALL} onValueChange={handleRole}>
          <SelectTrigger className="h-9 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="合否">
        <Select value={verdict || ALL} onValueChange={handleVerdict}>
          <SelectTrigger className="h-9 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {VERDICT_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="採否">
        <Select value={result || ALL} onValueChange={handleResult}>
          <SelectTrigger className="h-9 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {RESULT_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="氏名検索" className="flex-1 min-w-[200px]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="氏名を入力（自動で絞り込み）"
          className="h-9 text-sm"
        />
      </FilterField>

      {hasAnyFilter && (
        <Button variant="ghost" size="sm" onClick={reset} className="h-9 self-end">
          <X className="h-4 w-4" />
          リセット
        </Button>
      )}
    </div>
  );
}

/** ラベルが上、コントロールが下の縦並びフィールド。高さが揃う */
function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground font-medium leading-none">
        {label}
      </span>
      {children}
    </div>
  );
}
