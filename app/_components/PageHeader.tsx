type Props = {
  title: string;
  meta?: string;
  count?: number;
  suffix?: React.ReactNode;
};

/**
 * 各ページ内カードの上部ヘッダ。
 * サイドバー「一覧」から常時到達できるため、戻るボタンは廃止。
 * 旧 backHref/backLabel/noBack プロパティも合わせて撤去。
 */
export function PageHeader({ title, meta, count, suffix }: Props) {
  return (
    <header className="px-4 py-2.5 border-b border-border flex items-center gap-3 text-sm">
      <h1 className="font-bold whitespace-nowrap m-0 text-sm">{title}</h1>
      {count != null && (
        <span className="text-xs text-muted-foreground">{count} 件</span>
      )}
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      {suffix}
    </header>
  );
}
