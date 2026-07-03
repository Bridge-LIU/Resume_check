"use client";

import type { LlmStage, ProviderId } from "@/lib/types";
import { PROVIDERS, TIER_ICON } from "@/lib/llm/registry";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ProviderModelOverride {
  provider?: ProviderId;
  model?: string;
}

interface Props {
  /** 工程キー（既定モデルの表示に使う） */
  stage: LlmStage;
  /** settings の既定プロバイダ */
  defaultProvider: ProviderId;
  /** settings の defaultProvider × stage の既定モデル（表示用） */
  defaultModel: string;
  /** 現在の override（未指定なら settings 既定で動く） */
  value: ProviderModelOverride | undefined;
  /** 変更時。undefined を渡すと「設定の既定に戻す」 */
  onChange: (next: ProviderModelOverride | undefined) => void;
  /** API キーが入っていないプロバイダのモデルは disabled に */
  hasKey: Record<ProviderId, boolean>;
  /** disabled 全体（pending 中など） */
  disabled?: boolean;
}

const DEFAULT_VALUE = "__default__";

function encode(p: ProviderId, m: string): string {
  return `${p}::${m}`;
}

function decode(v: string): ProviderModelOverride | undefined {
  if (v === DEFAULT_VALUE) return undefined;
  const [p, m] = v.split("::");
  if (!p || !m) return undefined;
  return { provider: p as ProviderId, model: m };
}

export function ProviderModelSelect({
  stage: _stage,
  defaultProvider,
  defaultModel,
  value,
  onChange,
  hasKey,
  disabled,
}: Props) {
  const current = value
    ? encode(value.provider ?? defaultProvider, value.model ?? defaultModel)
    : DEFAULT_VALUE;

  const defaultLabel =
    PROVIDERS[defaultProvider].models.find((m) => m.id === defaultModel)?.label ?? defaultModel;
  const defaultText = `${PROVIDERS[defaultProvider].icon} ${PROVIDERS[defaultProvider].shortName} / ${defaultLabel}（既定）`;

  return (
    <Select
      value={current}
      onValueChange={(v) => onChange(decode(v))}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-8 text-xs w-auto max-w-[320px] gap-1.5"
        title="このセクションで使うプロバイダとモデル（既定は /settings で変更）"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE} className="text-xs">
          {defaultText}
        </SelectItem>
        {(Object.keys(PROVIDERS) as ProviderId[]).map((pid) => {
          const info = PROVIDERS[pid];
          const enabled = hasKey[pid];
          return (
            <SelectGroup key={pid}>
              <SelectLabel className="text-xs text-zinc-500">
                {info.icon} {info.displayName}
                {enabled ? "" : "（キー未設定）"}
              </SelectLabel>
              {info.models.map((m) => (
                <SelectItem
                  key={m.id}
                  value={encode(pid, m.id)}
                  disabled={!enabled}
                  className="text-xs"
                >
                  {m.label} {TIER_ICON[m.tier]}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
