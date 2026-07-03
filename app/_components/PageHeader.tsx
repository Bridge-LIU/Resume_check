import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";

type Props = {
  title: string;
  meta?: string;
  count?: number;
  suffix?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function PageHeader({
  title,
  meta,
  count,
  suffix,
  backHref = "/",
  backLabel = "一覧",
}: Props) {
  return (
    <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
      <Tip content={`${backLabel}へ戻る`}>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="group h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
        >
          <Link href={backHref} aria-label={`${backLabel}へ戻る`}>
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            {backLabel}
          </Link>
        </Button>
      </Tip>
      <div className="h-5 w-px bg-zinc-200" aria-hidden="true" />
      <h1 className="font-bold whitespace-nowrap m-0 text-sm">{title}</h1>
      {count != null && (
        <span className="text-xs text-zinc-500">{count} 件</span>
      )}
      {meta && <span className="text-xs text-zinc-500">{meta}</span>}
      {suffix}
    </header>
  );
}
