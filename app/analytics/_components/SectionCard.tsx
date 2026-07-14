/**
 * /analytics ページの各段共通シェル。タイトル + 「何に答えるか」の質問 + 本体。
 */
export function SectionCard({
  title,
  question,
  right,
  children,
}: {
  title: string;
  /** タイトル直下に「💬 …」で表示される、このセクションが答えるユーザー質問 */
  question?: string;
  /** ヘッダ右端のバッジやアクション */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">{title}</h3>
          {question && (
            <div className="text-2xs text-muted-foreground mt-0.5 leading-relaxed">
              💬 {question}
            </div>
          )}
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
