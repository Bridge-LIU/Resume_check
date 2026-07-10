"use client";

import { useState } from "react";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { RadioGroup, RadioGroupItem } from "@/ui/radio-group";

const DEFAULT_PROJECT_ROOT = "./data";

export function DataRootField({ defaultValue }: { defaultValue: string }) {
  const isDefault = defaultValue.trim() === DEFAULT_PROJECT_ROOT;
  const [mode, setMode] = useState<"project" | "custom">(
    isDefault ? "project" : "custom",
  );
  const [custom, setCustom] = useState(isDefault ? "" : defaultValue);

  const submittedValue = mode === "project" ? DEFAULT_PROJECT_ROOT : custom;
  const customIsEmpty = mode === "custom" && custom.trim() === "";

  return (
    <section className="space-y-2">
      <div className="font-medium text-sm">データ保存先</div>
      <div className="text-xs text-muted-foreground">
        <code className="bg-muted px-1 rounded">master/</code>、
        <code className="bg-muted px-1 rounded">sessions/</code> 等を置く場所。
        相対パスはプロジェクトルート基準。
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as "project" | "custom")}
        className="space-y-2"
      >
        <div className="flex items-start gap-2 text-sm">
          <RadioGroupItem id="dataRoot-project" value="project" className="mt-1" />
          <Label htmlFor="dataRoot-project" className="font-normal cursor-pointer">
            <div>
              プロジェクト内{" "}
              <code className="bg-muted px-1 rounded">./data/</code>
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              アプリと一緒に保存。お試し・1人運用向け。
            </div>
          </Label>
        </div>

        <div className="flex items-start gap-2 text-sm">
          <RadioGroupItem id="dataRoot-custom" value="custom" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="dataRoot-custom" className="font-normal cursor-pointer">
              カスタム
            </Label>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={mode !== "custom"}
              // mode=custom のときだけ ブラウザネイティブの required バリデーションを
              // 有効化して、空のまま保存ボタンを押すと フォーム送信を阻止する
              required={mode === "custom"}
              aria-invalid={customIsEmpty}
              placeholder={`例: C:\\Users\\admin\\面談AI評価ツール`}
              className={`font-mono mt-1 ${customIsEmpty ? "border-red-400 focus-visible:ring-red-400" : ""}`}
            />
            {customIsEmpty ? (
              <div className="text-xs text-red-600 mt-1">
                カスタムパスを入力してください（空のまま保存できません）
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                ネットワークドライブや別パーティション等。絶対パス推奨。
              </div>
            )}
          </div>
        </div>
      </RadioGroup>

      <input type="hidden" name="dataRoot" value={submittedValue} />
    </section>
  );
}
