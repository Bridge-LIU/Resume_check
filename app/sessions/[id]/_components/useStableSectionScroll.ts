"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * セクションのトップ位置を画面上で固定する。
 *
 * モード切替などで子要素の高さが大きく変わる場合、放っておくと
 * ページ全体が縦に動いて視覚的なジャンプ（抖动）になる。
 * 切替直前にトップ位置を記録し、レイアウト後に差分だけ scrollBy する。
 *
 * 使い方:
 *   const { ref, capture } = useStableSectionScroll(mode);
 *   <div ref={ref}>...
 *   <ModeSwitch onChange={(m) => { capture(); setMode(m); }} />
 */
export function useStableSectionScroll<T>(dep: T) {
  const ref = useRef<HTMLDivElement | null>(null);
  const topBeforeRef = useRef<number | null>(null);

  const capture = () => {
    topBeforeRef.current = ref.current?.getBoundingClientRect().top ?? null;
  };

  useLayoutEffect(() => {
    if (topBeforeRef.current == null) return;
    const cur = ref.current?.getBoundingClientRect().top ?? 0;
    const delta = cur - topBeforeRef.current;
    topBeforeRef.current = null;
    if (delta !== 0) window.scrollBy(0, delta);
  }, [dep]);

  return { ref, capture };
}
