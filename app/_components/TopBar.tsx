"use client";

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

export function TopBar() {
  return (
    <div className="fixed top-0 left-24 right-0 z-30 h-14 px-6 border-b border-border bg-card flex items-center gap-4 transition-colors">
      <Link href="/" className="font-bold text-foreground flex items-center gap-2">
        面談AI評価ツール
      </Link>
      <div className="flex-1" />
      <Button asChild size="sm">
        <Link href="/new">＋ 新規面談</Link>
      </Button>
      <ThemeToggle />
      {/* アバター（現状はローカル運用のためユーザ切替なし。将来の識別用にプレースホルダを置く） */}
      <div
        aria-label="ユーザ"
        className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 shrink-0"
      />
    </div>
  );
}
