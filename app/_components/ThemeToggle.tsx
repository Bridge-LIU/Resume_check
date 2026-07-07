"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Tip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Tip content={isDark ? "ライトモードに切替" : "ダークモードに切替"}>
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "ライトモードに切替" : "ダークモードに切替"}
        className="w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground flex items-center justify-center transition-colors shrink-0"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </Tip>
  );
}
