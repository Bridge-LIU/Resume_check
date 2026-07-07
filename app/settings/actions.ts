"use server";

import { revalidatePath } from "next/cache";
import {
  listTrash,
  previewSweep,
  purgeFromTrash,
  restoreFromTrash,
  runSweep,
  tailDeletionLog,
} from "@/lib/retention";
import type { PreviewItem, SweepResult, TrashItem } from "@/lib/retention";
import {
  getRetentionSchedulerStatus,
  type RetentionSchedulerStatus,
} from "@/lib/retentionScheduler";

export async function previewSweepAction(): Promise<PreviewItem[]> {
  return previewSweep();
}

export async function runSweepAction(): Promise<SweepResult> {
  const result = runSweep();
  revalidatePath("/");
  revalidatePath("/list");
  revalidatePath("/settings");
  revalidatePath("/trash");
  return result;
}

export async function getDeletionLogAction(n = 30): Promise<string[]> {
  return tailDeletionLog(n);
}

export async function listTrashAction(): Promise<TrashItem[]> {
  return listTrash();
}

export async function restoreSessionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    restoreFromTrash(id);
    revalidatePath("/");
    revalidatePath("/list");
    revalidatePath("/trash");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getRetentionSchedulerStatusAction(): Promise<RetentionSchedulerStatus> {
  return getRetentionSchedulerStatus();
}

export async function purgeSessionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    purgeFromTrash(id);
    revalidatePath("/trash");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * ゴミ箱内のすべての退避セッションを完全削除する。
 * 途中で 1 件失敗しても他は続行し、成功件数と失敗内容をまとめて返す。
 */
export async function purgeAllFromTrashAction(): Promise<{
  ok: boolean;
  purgedCount: number;
  failed: { id: string; error: string }[];
}> {
  const items = listTrash();
  const failed: { id: string; error: string }[] = [];
  let purgedCount = 0;
  for (const it of items) {
    try {
      purgeFromTrash(it.id);
      purgedCount++;
    } catch (e) {
      failed.push({ id: it.id, error: (e as Error).message });
    }
  }
  revalidatePath("/trash");
  return { ok: failed.length === 0, purgedCount, failed };
}
