"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  { id: "s2", label: "① 面談者情報", key: "s2" as const },
  { id: "s4", label: "② 求める人材条件", key: "s4" as const },
  { id: "s5", label: "③ 質問リスト", key: "s5" as const },
  { id: "s6", label: "④ 議事録", key: "s6" as const },
  { id: "s8", label: "⑤ 評価結果", key: "s8" as const },
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
    <nav
      aria-label="セクション内ナビゲーション"
      className="md:w-48 md:shrink-0 md:bg-zinc-100 md:ring-1 md:ring-zinc-200 md:m-3 p-2 text-sm flex flex-col gap-0.5 md:sticky md:top-4 md:self-start md:rounded-2xl md:max-h-[calc(100vh-2rem)] md:overflow-y-auto"
    >
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        const done = status[item.key];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleJump(item.id)}
            aria-current={isActive ? "true" : undefined}
            aria-label={`${item.label}（${done ? "入力済" : "未入力"}）`}
            className={`px-3 py-2 rounded-xl flex justify-between items-center text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${
              isActive
                ? "bg-white text-blue-700 font-medium shadow-sm"
                : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
            }`}
          >
            <span aria-hidden="true">{item.label}</span>
            <span
              aria-hidden="true"
              className={done ? "text-emerald-600" : "text-zinc-400"}
            >
              {done ? "✓" : "○"}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
