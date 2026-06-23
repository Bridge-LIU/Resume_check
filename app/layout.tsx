import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "面談AI評価ツール",
  description: "ローカルで動く面談主催・評価ツール",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body id="app-body" className="min-h-full bg-zinc-100 text-zinc-900 flex flex-col">
        <TooltipProvider delayDuration={200}>
          <div className="max-w-6xl mx-auto w-full p-6 flex-1">
            <Header />
            <main className="mt-4">{children}</main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <header className="px-6 py-3 border-b flex items-center gap-6">
        <Link href="/" className="font-bold">
          面談AI評価ツール
        </Link>
        <nav className="flex gap-1 text-sm">
          <NavLink href="/">一覧</NavLink>
          <NavLink href="/analytics">分析</NavLink>
          <NavLink href="/master">マスタ</NavLink>
          <NavLink href="/settings">設定</NavLink>
        </nav>
        <div className="flex-1" />
        <Button asChild size="sm">
          <Link href="/new">＋ 新規面談</Link>
        </Button>
      </header>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  // 細かいハイライトは各ページ側で対応（usePathname を使わずグローバルに統一スタイル）
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded hover:bg-zinc-100 text-zinc-600 text-sm"
    >
      {children}
    </Link>
  );
}
