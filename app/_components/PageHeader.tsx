type Props = {
  title: string;
  /** タイトル下に 1 行で表示される説明（page の目的や注意書き）。長文可、text-xs で描画。 */
  description?: React.ReactNode;
  /** タイトル横に「N 件」で表示される件数。 */
  count?: number;
  /** タイトル横のインライン補足（件数と並ぶ短い文字列）。 */
  meta?: string;
  /** 右端に寄せた領域。ボタン群やインライン IO 部品を置く。 */
  suffix?: React.ReactNode;
};

/**
 * 各ページの card 上端に載せる共通ヘッダ。
 * サイドバー「一覧」から常時到達できるため、戻るボタンは廃止。
 *
 * 使い方（card の内側 padding とは独立して border-b で仕切る）:
 * ```tsx
 * <div className="bg-card rounded-xl border shadow-sm">
 *   <PageHeader title="..." description="..." suffix={<Actions />} />
 *   <div className="p-6 space-y-3">...</div>
 * </div>
 * ```
 */
export function PageHeader({ title, description, count, meta, suffix }: Props) {
  return (
    <header className="px-4 py-2.5 border-b border-border">
      <div className="flex items-center gap-3 text-sm">
        <h1 className="font-bold whitespace-nowrap m-0 text-sm">{title}</h1>
        {count != null && (
          <span className="text-xs text-muted-foreground">{count} 件</span>
        )}
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        {suffix && <div className="ml-auto flex items-center gap-2">{suffix}</div>}
      </div>
      {description && (
        <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {description}
        </div>
      )}
    </header>
  );
}
