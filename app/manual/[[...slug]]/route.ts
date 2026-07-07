import { readFile } from "node:fs/promises";
import path from "node:path";

// /manual と /manual/assets/xxx.png を manual/ ディレクトリからそのまま配信する。
// manual/ は git tracked だが public/ 外なので Next の静的配信では拾えないため、
// Route Handler で読んで返す（path traversal 防御あり）。
//
// - GET /manual                       → manual/操作マニュアル.html （相対リンクを絶対化して配信）
// - GET /manual/assets/list.png       → manual/assets/list.png
// - それ以外の拡張子は 404

const MANUAL_ROOT = path.resolve(process.cwd(), "manual");

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
 * HTML 内の相対リンク（<img src="assets/xxx.png"> や <a href="assets/xxx">）を
 * サーバー配信用の絶対パス（"/manual/assets/xxx.png"）に書き換える。
 * これにより URL が `/manual` でも `/manual/` でも画像が正しく解決される。
 *
 * 対応する属性: src / href / poster / data-src
 * 対象パターン: 属性値が `assets/...` で始まるもの
 * 副作用: file:// で開いた場合（standalone）は書き換え無し = 相対パスのまま動く
 */
function rewriteRelativeAssetLinks(html: string): string {
  return html.replace(
    /\b(src|href|poster|data-src)=(["'])assets\//g,
    (_m, attr, quote) => `${attr}=${quote}/manual/assets/`,
  );
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/manual/[[...slug]]">,
) {
  const { slug } = await ctx.params;
  const rel =
    slug && slug.length > 0 ? slug.join("/") : "操作マニュアル.html";

  const target = path.resolve(MANUAL_ROOT, rel);
  const inside =
    target === MANUAL_ROOT || target.startsWith(MANUAL_ROOT + path.sep);
  if (!inside) return new Response("Not Found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext];
  if (!type) return new Response("Not Found", { status: 404 });

  try {
    const data = await readFile(target);
    // HTML のときだけ相対パスを絶対化。他（画像等）はそのままバイナリで返す。
    if (ext === ".html" || ext === ".htm") {
      const rewritten = rewriteRelativeAssetLinks(data.toString("utf-8"));
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "no-store",
        },
      });
    }
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
