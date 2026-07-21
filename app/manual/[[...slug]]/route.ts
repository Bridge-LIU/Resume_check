import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProjectRoot } from "@/lib/storage";

// /manual と /manual/assets/xxx.png を配信する。
// HTML はプロジェクトルート直下の `運用マニュアル.HTML`（ダブルクリック起動も可）、
// 画像等の資材は `マニュアル/assets/` に置く二段構成。
// public/ 外なので Next の静的配信では拾えないため、Route Handler で読んで返す
// （path traversal 防御あり）。
//
// - GET /manual                       → 運用マニュアル.HTML （相対リンクを絶対化して配信）
// - GET /manual/assets/list.png       → マニュアル/assets/list.png
// - それ以外の拡張子は 404

// standalone 版は server.js が cwd を `.next/standalone/` に変更するため、
// 素の process.cwd() だと HTML が見つからない。lib/storage の
// getProjectRoot() が RESUME_CLAUDE_PROJECT_ROOT 環境変数を含む正しい解決順で
// プロジェクト根を返す。
const PROJECT_ROOT = getProjectRoot();
const HTML_PATH = path.resolve(PROJECT_ROOT, "運用マニュアル.HTML");
const ASSETS_ROOT = path.resolve(PROJECT_ROOT, "マニュアル");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

/**
 * HTML 内の相対リンク（<img src="マニュアル/assets/xxx.png"> 等）を
 * サーバー配信用の絶対パス（"/manual/assets/xxx.png"）に書き換える。
 *
 * ダブルクリック起動時は書き換えず、相対パス `マニュアル/assets/xxx.png` が
 * そのままファイルシステムで解決される（HTML と マニュアル/ が同階層に存在）。
 *
 * 対応する属性: src / href / poster / data-src
 * 対象パターン: 属性値が `マニュアル/assets/...` で始まるもの
 */
function rewriteRelativeAssetLinks(html: string): string {
  return html.replace(
    /\b(src|href|poster|data-src)=(["'])マニュアル\/assets\//g,
    (_m, attr, quote) => `${attr}=${quote}/manual/assets/`,
  );
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/manual/[[...slug]]">,
) {
  const { slug } = await ctx.params;

  // slug なし → HTML 本体
  if (!slug || slug.length === 0) {
    try {
      const data = await readFile(HTML_PATH);
      const rewritten = rewriteRelativeAssetLinks(data.toString("utf-8"));
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  // slug あり → マニュアル/ 配下の資材（画像等）
  const rel = slug.join("/");
  const target = path.resolve(ASSETS_ROOT, rel);
  const inside =
    target === ASSETS_ROOT || target.startsWith(ASSETS_ROOT + path.sep);
  if (!inside) return new Response("Not Found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext];
  if (!type) return new Response("Not Found", { status: 404 });

  try {
    const data = await readFile(target);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
