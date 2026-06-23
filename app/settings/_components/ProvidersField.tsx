"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { ProviderConfig, ProviderId } from "@/lib/types";
import { PROVIDERS, TIER_ICON } from "@/lib/llm/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/use-confirm";

interface Props {
  defaultProvider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  envStatus: Record<ProviderId, boolean>;
}

const ACCENT_BG: Record<ProviderId, string> = {
  anthropic: "bg-amber-50/40 border-amber-200",
  openai: "bg-emerald-50/40 border-emerald-200",
  google: "bg-indigo-50/40 border-indigo-200",
};

const PILL_BG: Record<ProviderId, string> = {
  anthropic: "bg-amber-100 text-amber-900",
  openai: "bg-emerald-100 text-emerald-900",
  google: "bg-indigo-100 text-indigo-900",
};

export function ProvidersField({ defaultProvider, providers, envStatus }: Props) {
  const [selectedDefault, setSelectedDefault] = useState<ProviderId>(defaultProvider);
  const { confirm, ConfirmDialog } = useConfirm();

  return (
    <section className="space-y-3">
      <div className="font-medium text-sm">AI プロバイダ設定</div>
      <div className="text-xs text-zinc-500 leading-relaxed">
        各プロバイダの API キーを入力。<strong>既定</strong>に選ばれたプロバイダが ②⑤⑧ の API モード実行時に使われる。
        環境変数（<code className="bg-zinc-100 px-1 rounded">ANTHROPIC_API_KEY</code> /{" "}
        <code className="bg-zinc-100 px-1 rounded">OPENAI_API_KEY</code> /{" "}
        <code className="bg-zinc-100 px-1 rounded">GOOGLE_API_KEY</code>）が設定されている場合はそちらが優先。
      </div>

      <RadioGroup
        name="defaultProvider"
        value={selectedDefault}
        onValueChange={(v) => setSelectedDefault(v as ProviderId)}
        className="space-y-3 gap-0"
      >
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
          <ProviderCard
            key={id}
            id={id}
            info={PROVIDERS[id]}
            config={providers[id]}
            isDefault={selectedDefault === id}
            hasEnvKey={envStatus[id]}
            confirm={confirm}
          />
        ))}
      </RadioGroup>
      <ConfirmDialog />
    </section>
  );
}

function ProviderCard({
  id,
  info,
  config,
  isDefault,
  hasEnvKey,
  confirm,
}: {
  id: ProviderId;
  info: (typeof PROVIDERS)[ProviderId];
  config: ProviderConfig;
  isDefault: boolean;
  hasEnvKey: boolean;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const hasFileKey = !!config.key.trim();
  const isConfigured = hasFileKey || hasEnvKey;
  // 未設定なら最初から編集可、設定済ならロック状態が既定
  const [editing, setEditing] = useState(!hasFileKey);
  const [selectedModel, setSelectedModel] = useState<string>(config.defaultModel);
  const status = hasEnvKey
    ? { label: "環境変数で設定済", cls: "text-emerald-700" }
    : hasFileKey
      ? { label: "✓ 設定済", cls: "text-emerald-600" }
      : { label: "未設定", cls: "text-zinc-400" };

  async function handleToggleEditing(checked: boolean) {
    if (checked && hasFileKey) {
      const ok = await confirm({
        title: `${info.shortName} の API キーを編集しますか？`,
        description:
          "保存済のキーを上書きする可能性があります。新しいキーを入力して「保存」を押すまで現状のキーは保持されます。",
        confirmLabel: "編集を許可",
      });
      if (!ok) return;
    }
    setEditing(checked);
  }

  // 表示制御：ロック中は disabled、保存済なら placeholder で「••••• 設定済」表示
  const inputDisabled = !editing;
  const placeholder = !editing
    ? hasFileKey
      ? "•••••••••••••••• （保存済・ロック中）"
      : "未設定"
    : hasFileKey
      ? "新しい API キーを入力（空欄なら現状維持）"
      : `${info.shortName} の API キー`;

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${ACCENT_BG[id]} ${isConfigured ? "" : "opacity-90"}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Label
          htmlFor={`default_${id}`}
          className="flex items-center gap-2 cursor-pointer"
        >
          <RadioGroupItem
            id={`default_${id}`}
            value={id}
            disabled={!isConfigured}
          />
          <span className={`pill ${PILL_BG[id]}`}>
            {info.icon} {info.displayName}
          </span>
          {isDefault && (
            <span className="text-xs text-emerald-700 font-medium">既定</span>
          )}
        </Label>
        <div className="flex-1"></div>
        <span className={`text-xs ${status.cls}`}>{status.label}</span>
      </div>

      <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
        <Label htmlFor={`key_${id}`} className="text-xs text-zinc-500">
          API キー
        </Label>
        <div className="flex gap-2 items-center">
          <Input
            id={`key_${id}`}
            name={`provider_${id}_key`}
            type="password"
            defaultValue=""
            autoComplete="off"
            disabled={inputDisabled}
            placeholder={placeholder}
            title={inputDisabled ? "右の鍵アイコンをクリックして編集" : ""}
            className={`font-mono text-xs ${inputDisabled ? "cursor-not-allowed" : ""}`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleToggleEditing(!editing)}
            title={editing ? "ロックを掛ける" : "編集する（確認あり）"}
            aria-label={editing ? "ロックを掛ける" : "編集を許可"}
            className={
              editing
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
                : ""
            }
          >
            {editing ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </Button>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger
              className="h-9 text-xs w-auto whitespace-nowrap"
              title={`${info.shortName} の既定モデル`}
              aria-label={`${info.shortName} の既定モデル`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {info.models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.label} {TIER_ICON[m.tier]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="hidden"
            name={`provider_${id}_defaultModel`}
            value={selectedModel}
          />
        </div>
      </div>

      {hasFileKey && !hasEnvKey && editing && (
        <div className="pl-[108px]">
          <Label
            htmlFor={`remove_${id}`}
            className="inline-flex items-center gap-2 text-xs text-zinc-600 font-normal cursor-pointer"
          >
            <Checkbox id={`remove_${id}`} name={`remove_${id}`} value="on" />
            保存済キーを削除
          </Label>
        </div>
      )}
    </div>
  );
}
