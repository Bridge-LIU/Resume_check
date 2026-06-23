"use server";

import { redirect } from "next/navigation";
import { createSession, getRole, listRoleIds } from "@/lib/storage";
import { writeAudit } from "@/lib/auditLog";
import { validateName, validateRoleIdRef } from "@/lib/validation";

/** Server Action の標準エラー（Client 側で throw → boundary で拾う想定） */
class ValidationError extends Error {}

export async function createSessionAction(formData: FormData): Promise<void> {
  const 氏名Raw = String(formData.get("氏名") ?? "");
  const roleIdRaw = String(formData.get("役割") ?? "");

  // Client 側にもバリデーションを置くが、Server 側でも必ず検証する（直接 API を叩かれる可能性に備える防御層）
  const nameResult = validateName(氏名Raw);
  if (!nameResult.ok) throw new ValidationError(nameResult.error);

  const roleResult = validateRoleIdRef(roleIdRaw, listRoleIds());
  if (!roleResult.ok) throw new ValidationError(roleResult.error);

  const role = getRole(roleResult.value);
  if (!role) throw new ValidationError("役割マスタの読み込みに失敗しました");

  const meta = createSession(nameResult.value, roleResult.value);
  writeAudit("session.create", {
    sessionId: meta.id,
    meta: { roleId: roleResult.value },
  });
  // meta.id には日本語（氏名）が含まれる。エンコードしないと
  // Server Action 内部の x-action-redirect ヘッダで Invalid character エラーになる
  redirect(`/sessions/${encodeURIComponent(meta.id)}`);
}
