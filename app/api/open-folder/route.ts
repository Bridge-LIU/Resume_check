import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot } from "@/lib/storage";
import { apiErrorResponse } from "@/lib/apiError";

/**
 * ローカルの Explorer / Finder / xdg-open で指定フォルダを開く。
 * ローカル 1 ユーザ運用が前提のためシェル呼び出しをする（Web 公開は想定外）。
 *
 * URL:
 *   /api/open-folder            -> data/sessions を開く（既定）
 *   /api/open-folder?target=root -> data/ ルートを開く
 *   /api/open-folder?target=exports -> data/exports を開く
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target") ?? "sessions";

    // 許可された target のみ受け付ける（任意パスを開かせない）
    const dataRoot = getDataRoot();
    let dir: string;
    switch (target) {
      case "root":
        dir = dataRoot;
        break;
      case "sessions":
        dir = path.join(dataRoot, "sessions");
        break;
      case "exports":
        dir = path.join(dataRoot, "exports");
        break;
      case "master":
        dir = path.join(dataRoot, "master");
        break;
      case "analytics":
        dir = path.join(dataRoot, "analytics");
        break;
      case "logs":
        dir = path.join(dataRoot, "logs");
        break;
      default:
        return Response.json(
          { error: `未対応の target: ${target}` },
          { status: 400 },
        );
    }

    // ディレクトリが無ければ作る（sessions 等は空でも開けるように）
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const platform = process.platform;
    let cmd: string;
    let args: string[];
    if (platform === "win32") {
      // Windows: explorer.exe は "found + exit code 1" を返すことがあるが正常動作。
      cmd = "explorer.exe";
      args = [dir];
    } else if (platform === "darwin") {
      cmd = "open";
      args = [dir];
    } else {
      cmd = "xdg-open";
      args = [dir];
    }

    // detached + unref で本体プロセスと切り離す（サーバ停止に引きずられない）
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    return Response.json({ ok: true, dir });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
