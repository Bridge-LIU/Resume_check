import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * 走光 border 系の統一リンク / 文字ボタン。
 *
 * - `variant="action"` … 独立操作（「すべて表示」「工程別内訳を展開」「リセット」等）
 *    静止 ring/30 → hover 时 ring 变实 + 淡蓝 glow shadow（tech 感 C 強度）
 * - `variant="inline"` … 文中リンク（「ゴミ箱」「/master」等）
 *    行間を割らない底線＋hover 光晕。ring は使わない。
 * - `variant="name"`   … 名前 / タイトルリンク（session 氏名等）
 *    静止は foreground。hover 时 text 变 primary + ring 出现 + glow。
 *
 * `group` を自動付与するので、子要素で `group-hover:translate-x-0.5` などの
 * hover 追随アニメを組める。Collapsible の `group-data-[state=open]:` にも透過。
 */
const actionLinkVariants = cva(
  "group inline-flex items-center whitespace-nowrap transition-all duration-200 cursor-pointer",
  {
    variants: {
      variant: {
        action:
          "gap-0.5 text-primary font-medium px-2 py-0.5 rounded-md ring-1 ring-primary/30 hover:ring-primary hover:shadow-[0_0_18px_rgba(37,99,235,0.55)] dark:hover:shadow-[0_0_20px_rgba(59,130,246,0.6)]",
        inline:
          "text-primary font-medium border-b border-primary/30 hover:border-primary hover:[text-shadow:0_0_6px_rgba(37,99,235,0.45)]",
        name: "text-foreground font-medium px-1.5 -mx-1.5 py-0.5 rounded-md ring-1 ring-transparent hover:text-primary hover:ring-primary/40 hover:shadow-[0_0_12px_rgba(37,99,235,0.4)]",
      },
    },
    defaultVariants: { variant: "action" },
  },
);

export interface ActionLinkProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof actionLinkVariants> {
  /** true 时用 Radix Slot 委托到子元素（例：Next.js `<Link>` を包む用） */
  asChild?: boolean;
}

const ActionLink = React.forwardRef<HTMLButtonElement, ActionLinkProps>(
  ({ className, variant, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // Slot 経由時は type を勝手に付けない（子要素が <a> の可能性がある）
        {...(asChild ? {} : { type: type ?? "button" })}
        className={cn(actionLinkVariants({ variant, className }))}
        {...props}
      />
    );
  },
);
ActionLink.displayName = "ActionLink";

export { ActionLink, actionLinkVariants };
