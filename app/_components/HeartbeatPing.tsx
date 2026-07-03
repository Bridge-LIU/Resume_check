"use client";

import { useEffect } from "react";

/**
 * 定期的に /api/heartbeat へ POST してブラウザが生きていることを知らせる。
 * サーバは AUTO_SHUTDOWN=1 の場合、一定時間 ping が無いと自動終了する（lib/heartbeat.ts）。
 * タブを閉じれば setInterval も止まり、自動で心拍が止まる。
 *
 * Chrome/Edge のバックグラウンドタブでは setInterval が ~60 秒に間引かれるため、
 * サーバ側閾値（180 秒）に対して十分な回数の ping が届くよう、以下 2 系統で送信する:
 * 1. setInterval(ping, 20_000): フォアグラウンド時は 20 秒、バックグラウンド時は
 *    ~60 秒に間引かれる。
 * 2. visibilitychange: タブが可視になった瞬間に即 ping（再度アクティブになったとき
 *    のリカバリ）。
 */
export function HeartbeatPing() {
  useEffect(() => {
    const ping = () => {
      fetch("/api/heartbeat", {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        // 一時的な通信失敗は無視。次の interval で再送される
      });
    };
    ping();
    const id = setInterval(ping, 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
