import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { listRoles } from "@/lib/storage";
import { NewSessionForm } from "./_components/NewSessionForm";

export default async function NewSessionPage() {
  const roles = listRoles();

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
        <Tip content="一覧へ戻る">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="group h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
          >
            <Link href="/" aria-label="一覧へ戻る">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              一覧
            </Link>
          </Button>
        </Tip>
        <div className="h-5 w-px bg-zinc-200" aria-hidden="true" />
        <div className="font-bold whitespace-nowrap">新規面談</div>
      </header>

      <NewSessionForm roles={roles} />
    </div>
  );
}
