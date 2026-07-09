"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 数値入力（segmented `[-] value [+]` 型）。
 *
 * - 全体を 1 つの枠で囲み、左右にステップ用のボタンを段組で配置。
 *   ネイティブ spin ボタンより視覚的に落ち着き、狭い枠でも読みやすい。
 * - value / onChange / step / min / max は素の <input type="number"> と同じ挙動。
 * - onValueChange を渡すと数値パース済の値でコールバック（step / min / max を尊重）。
 * - readOnly / disabled のときは +/- を隠す。
 * - className は外枠 <div>、inputClassName は内部 <input> にそれぞれ適用。
 */
export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "size"> {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (value: number) => void;
  inputClassName?: string;
  /** size="sm": h-7 のコンパクト表示。デフォルトは h-9。 */
  size?: "sm" | "md";
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      inputClassName,
      value,
      defaultValue,
      step,
      min,
      max,
      readOnly,
      disabled,
      onChange,
      onValueChange,
      size = "md",
      ...props
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => innerRef.current!, []);

    const stepNum = typeof step === "number" ? step : Number(step ?? 1) || 1;

    const clamp = (n: number): number => {
      let out = n;
      if (typeof min === "number") out = Math.max(min, out);
      else if (typeof min === "string" && min !== "") out = Math.max(Number(min), out);
      if (typeof max === "number") out = Math.min(max, out);
      else if (typeof max === "string" && max !== "") out = Math.min(Number(max), out);
      return out;
    };

    const applyDelta = (dir: 1 | -1) => {
      const el = innerRef.current;
      if (!el || readOnly || disabled) return;
      const current = Number(el.value === "" ? 0 : el.value);
      if (!Number.isFinite(current)) return;
      const next = clamp(round(current + dir * stepNum, stepNum));
      if (next === current) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, String(next));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      onValueChange?.(next);
    };

    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      onChange?.(e);
      if (onValueChange) {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onValueChange(n);
      }
    };

    const showButtons = !readOnly && !disabled;
    const isSm = size === "sm";
    const outerHeight = isSm ? "h-7" : "h-9";
    const btnWidth = isSm ? "w-6" : "w-7";
    const iconSize = isSm ? "w-3 h-3" : "w-3.5 h-3.5";

    return (
      <div
        className={cn(
          // 全体を 1 つの枠でくくり、focus 時にリング表示（focus-within で内部 input のフォーカスを検知）
          "inline-flex items-stretch rounded-md border border-input bg-card shadow-sm transition-colors",
          outerHeight,
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background focus-within:border-ring",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
      >
        {showButtons && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="値を減らす"
            onClick={() => applyDelta(-1)}
            className={cn(
              "shrink-0 flex items-center justify-center",
              "border-r border-input text-muted-foreground hover:text-foreground hover:bg-accent",
              "transition-colors rounded-l-md",
              btnWidth,
            )}
          >
            <Minus className={iconSize} strokeWidth={2.5} />
          </button>
        )}
        <input
          ref={innerRef}
          type="number"
          value={value}
          defaultValue={defaultValue}
          step={step}
          min={min}
          max={max}
          readOnly={readOnly}
          disabled={disabled}
          onChange={handleChange}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-center text-sm text-foreground",
            "focus-visible:outline-none",
            // 端が丸まっている場合の内側を隠す
            !showButtons && "rounded-md",
            inputClassName,
          )}
          {...props}
        />
        {showButtons && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="値を増やす"
            onClick={() => applyDelta(1)}
            className={cn(
              "shrink-0 flex items-center justify-center",
              "border-l border-input text-muted-foreground hover:text-foreground hover:bg-accent",
              "transition-colors rounded-r-md",
              btnWidth,
            )}
          >
            <Plus className={iconSize} strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  },
);
NumberInput.displayName = "NumberInput";

/** step の刻みで丸める（浮動小数点誤差対策）。step=0.1 なら 3.30000000004 → 3.3 */
function round(v: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return v;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

export { NumberInput };
