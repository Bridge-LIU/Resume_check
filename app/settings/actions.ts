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
