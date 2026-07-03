"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * グローバルエラー境界。Server Component / Server Action / Route Handler から
 * uncaught な例外が浮上したときの最後の受け皿。
 * Next.js の規約上 client component で 'use client' が必須。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 詳細はサーバ側でも記録されるが、クライアント側にも残しておくと再現性確認が楽。
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-8 space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-bold">エラーが発生しました</h1>
        <p className="text-sm text-zinc-600">
          処理中に予期しない問題が起きました。再試行しても解消しない場合は、
          下のメッセージを確認してください。
        </p>
        <pre className="bg-zinc-50 border rounded p-3 text-xs text-zinc-700 whitespace-pre-wrap break-all">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded font-medium"
          >
            再試行
          </button>
          <Link
            href="/"
            className="border hover:bg-zinc-50 text-sm px-3 py-1.5 rounded"
          >
            一覧へ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
