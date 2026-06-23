"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  { id: "s2", label: "② 面談者情報", key: "s2" as const },
  { id: "s4", label: "④ 求める人材条件", key: "s4" as const },
  { id: "s5", label: "⑤ 質問リスト", key: "s5" as const },
  { id: "s6", label: "⑥ 議事録", key: "s6" as const },
  { id: "s8", label: "⑧ 評価結果", key: "s8" as const },
];

type StatusMap = Record<"s2" | "s4" | "s5" | "s6" | "s8", boolean>;

export function SidebarNav({ status }: { status: StatusMap }) {
  const [active, setActive] = useState<string>("s2");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(e.target.id);
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const item of ITEMS) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  function handleJump(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  return (
    <aside className="md:w-48 md:border-r md:bg-zinc-50 p-2 text-sm flex flex-col gap-1 md:sticky md:top-4 md:self-start md:rounded-bl-xl md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleJump(item.id)}
            aria-current={isActive ? "true" : undefined}
            className={`px-3 py-2 rounded flex justify-between items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              isActive
                ? "bg-white border border-blue-300 font-medium"
                : "hover:bg-white"
            }`}
          >
            <span>{item.label}</span>
            <span className={status[item.key] ? "text-emerald-600" : "text-zinc-300"}>
              {status[item.key] ? "✓" : "○"}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
