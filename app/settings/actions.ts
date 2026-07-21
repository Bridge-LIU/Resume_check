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
import { refreshPricingNow, readPricingCache } from "@/lib/pricingFetch";

/**
 * Anthropic 官方 docs から Claude 単価を即時再取得。
 * /settings の「単価を今すぐ更新」ボタン + /cost の refresh ボタンから呼ばれる。
 */
export async function refreshPricingNowAction(): Promise<{
  ok: boolean;
  error?: string;
  fetchedAt?: string;
  modelCount?: number;
}> {
  try {
    const cache = await refreshPricingNow();
    revalidatePath("/settings");
    revalidatePath("/cost");
    return {
      ok: true,
      fetchedAt: cache.fetchedAt,
      modelCount: Object.keys(cache.models).length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * HTML `<form action={...}>` から呼ぶための void 戻り値版。
 * UI 側で追加のクライアントコードなしでボタン → 単価再取得ができる。
 */
export async function refreshPricingFormAction(): Promise<void> {
  try {
    await refreshPricingNow();
  } catch (e) {
    console.error("[refreshPricingFormAction] failed:", e);
    // form action は例外を吐くと Next.js のエラー画面になるため、握りつぶして revalidate だけ返す
  }
  revalidatePath("/settings");
  revalidatePath("/cost");
}

/** 現在の単価 cache 状態を返す。UI 側で「最終更新: XX 分前」表示に使う。 */
export async function getPricingCacheStatusAction(): Promise<{
  fetchedAt: string | null;
  modelCount: number;
  source: string | null;
}> {
  const cache = readPricingCache();
  if (!cache) return { fetchedAt: null, modelCount: 0, source: null };
  return {
    fetchedAt: cache.fetchedAt,
    modelCount: Object.keys(cache.models).length,
    source: cache.source,
  };
}

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
