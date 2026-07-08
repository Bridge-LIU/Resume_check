"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";

type Item = {
  href: string;
  icon: string;
  label: string;
  /** URL prefix で active 判定する（false: 完全一致） */
  matchPrefix?: boolean;
  /** 別タブで開く（`/manual` のような外部/独立 HTML 向け） */
  external?: boolean;
};

const MAIN: Item[] = [
  { href: "/",           icon: "🏠", label: "ホーム" },
  { href: "/list",       icon: "📊", label: "面談一覧", matchPrefix: true },
  { href: "/compare",    icon: "🔀", label: "比較",   matchPrefix: true },
  { href: "/analytics",  icon: "📈", label: "分析",   matchPrefix: true },
  { href: "/master",     icon: "🗂️", label: "求人情報", matchPrefix: true },
  { href: "/cost",       icon: "🧾", label: "APIコスト", matchPrefix: true },
];

const FOOTER: Item[] = [
  { href: "/trash",    icon: "🗑️", label: "ゴミ箱",  matchPrefix: true },
  { href: "/settings", icon: "⚙️", label: "設定",    matchPrefix: true },
  { href: "/manual",   icon: "❔", label: "ヘルプ",  external: true },
];

// nav item 共通クラス（light / dark 両対応）
const NAV_BASE =
  "relative flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-colors";
const NAV_INACTIVE =
  "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 " +
  "dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white";
const NAV_ACTIVE =
  "bg-blue-100 text-blue-700 dark:bg-blue-600/25 dark:text-white";

/** サイドバー用: サーバの Explorer/Finder でローカルフォルダを開くボタン */
function OpenFolderButton() {
  async function onClick() {
    try {
      const res = await fetch("/api/open-folder?target=sessions", {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(`フォルダを開けませんでした: ${j?.error ?? res.statusText}`);
      }
    } catch (e) {
      alert(`フォルダを開けませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${NAV_BASE} ${NAV_INACTIVE}`}
      title="data/sessions フォルダを Explorer で開く"
    >
      <span className="text-lg leading-none">📁</span>
      <span>フォルダ</span>
    </button>
  );
}

function isActive(pathname: string, item: Item): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

export function SideBar() {
  const pathname = usePathname() ?? "/";

  return (
    <aside
      className={
        "fixed top-0 left-0 h-screen w-24 z-40 flex flex-col py-4 border-r " +
        "bg-white text-zinc-700 border-zinc-200 " +
        "dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
      }
    >
      <Link
        href="/"
        aria-label="面談AI評価ツール ホーム"
        className={
          "group mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-6 shadow-sm transition-all hover:shadow-md hover:scale-105 " +
          "bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 " +
          "dark:from-blue-500 dark:via-indigo-500 dark:to-violet-500"
        }
      >
        <ClipboardCheck
          className="w-6 h-6 text-white drop-shadow-sm"
          strokeWidth={2.25}
          aria-hidden="true"
        />
      </Link>

      <nav className="flex flex-col gap-1 px-2">
        {MAIN.map((it) => (
          <NavButton key={it.href} item={it} active={isActive(pathname, it)} />
        ))}
      </nav>

      <div className="flex-1" />

      <nav className="flex flex-col gap-1 px-2">
        <OpenFolderButton />
        {FOOTER.map((it) => (
          <NavButton key={it.href} item={it} active={isActive(pathname, it)} />
        ))}
      </nav>
    </aside>
  );
}

function NavButton({ item, active }: { item: Item; active: boolean }): ReactNode {
  // active: 左端 accent bar + 明確な bg 差でホバー時と誤認しない
  // text-xs (12px) はタップターゲット / 可読性を確保（旧 text-2xs=10px から）
  const className = `${NAV_BASE} ${active ? NAV_ACTIVE : NAV_INACTIVE}`;

  const content = (
    <>
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-blue-500 dark:bg-blue-400"
        />
      )}
      <span className="text-lg leading-none">{item.icon}</span>
      <span>{item.label}</span>
    </>
  );

  if (item.external) {
    // 別タブで独立 HTML（manual）を開く
    return (
      <Link
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {content}
    </Link>
  );
}
