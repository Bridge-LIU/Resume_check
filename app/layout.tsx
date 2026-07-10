import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/ui/tooltip";
import { HeartbeatPing } from "./_components/HeartbeatPing";
import { ThemeProvider } from "./_components/ThemeProvider";
import { SideBar } from "./_components/SideBar";
import { TopBar } from "./_components/TopBar";

export const metadata: Metadata = {
  title: "面談AI評価ツール",
  description: "ローカルで動く面談主催・評価ツール",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body id="app-body" className="min-h-full bg-background text-foreground transition-colors">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            {/* SideBar: fixed left-0 / TopBar: fixed top-0 (both viewport 固定) */}
            <SideBar />
            <TopBar />
            {/* main は sidebar 幅 24 + topbar 高 14 分オフセット。
             *   後台管理システム風に max-width 制約を外して全幅を使う。 */}
            <main className="pl-24 pt-14 min-h-screen">
              <div className="w-full p-6">{children}</div>
            </main>
            <HeartbeatPing />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
