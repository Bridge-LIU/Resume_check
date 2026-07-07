import { redirect } from "next/navigation";

// 旧 /home 用の互換リダイレクト。ホーム画面は / に統合された。
export default function LegacyHomeRedirect() {
  redirect("/");
}
