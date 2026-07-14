import "server-only";
import { Archiver, ZipArchive } from "archiver";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { migrateSettings } from "@/lib/storage";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";

const DISTRIBUTION_ROLES = ["Dev", "ITSupport", "NW", "PMO", "Server"];

const ROOT_FILES = [
  ".env.local.example",
  ".gitignore",
  "eslint.config.mjs",
  "instrumentation.ts",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "start.bat",
  "運用マニュアル.HTML",
];

type DirRule = {
  dir: string;
  skip: (name: string, depth: number) => boolean;
};

const DIRS: DirRule[] = [
  // app/ 配下は「深さに関わらず preview* で始まるフォルダは全て除外」。
  // 現状 preview 系フォルダは全撤去済だが、将来 mockup を追加した際に
  // 配布に混入しないよう防衛ルールとして残す。
  { dir: "app", skip: (name) => /^preview/i.test(name) },
  { dir: "lib", skip: () => false },
  { dir: "マニュアル", skip: () => false },
  { dir: "public", skip: () => false },
  { dir: "scripts", skip: (name, depth) => depth === 0 && name === "dev" },
];

async function walk(
  archive: Archiver,
  fsPath: string,
  arcPath: string,
  skip: (name: string, depth: number) => boolean,
  depth = 0,
): Promise<void> {
  const entries = await fs.promises.readdir(fsPath, { withFileTypes: true });
  for (const entry of entries) {
    if (skip(entry.name, depth)) continue;
    const nextFs = path.join(fsPath, entry.name);
    const nextArc = arcPath ? `${arcPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(archive, nextFs, nextArc, skip, depth + 1);
    } else if (entry.isFile()) {
      archive.file(nextFs, { name: nextArc });
    }
  }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function GET(req: Request) {
  // 開発者専用の機能。配布された環境では有効化されていないため 404 を返す
  // （UI 側でもボタンを隠しているが、URL 直叩きに対する二重防御）。
  if (process.env.ENABLE_DEV_EXPORT !== "1") {
    return new Response("Not found", { status: 404 });
  }

  // ローカル origin 検査。悪意ある外部ページに誘導された開発者が
  // ソース＋評価条件テンプレを不本意にダウンロードさせられるのを防ぐ。
  // ブラウザのアドレスバー直打ちは通る（sec-fetch-site: none）。
  try {
    ensureLocalOrigin(req);
  } catch (e) {
    if (e instanceof ApiError) return apiErrorResponse(e);
    throw e;
  }

  const projectRoot = process.cwd();
  // 現行 settings.json ではなく、素の既定値（migrateSettings({})）を埋め込む。
  // 現行値を流すと開発者個人の retention 期間・モデル選択がそのまま配布される。
  const cleanSettings = migrateSettings({});

  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      for (const f of ROOT_FILES) {
        const abs = path.join(projectRoot, f);
        if (fs.existsSync(abs)) archive.file(abs, { name: f });
      }

      for (const rule of DIRS) {
        const abs = path.join(projectRoot, rule.dir);
        if (fs.existsSync(abs)) {
          await walk(archive, abs, rule.dir, rule.skip);
        }
      }

      archive.append(JSON.stringify(cleanSettings, null, 2) + "\n", {
        name: "data/settings.json",
      });

      const evalCriteriaPath = path.join(projectRoot, "data/master/eval_criteria.json");
      if (fs.existsSync(evalCriteriaPath)) {
        archive.file(evalCriteriaPath, { name: "data/master/eval_criteria.json" });
      }

      for (const roleId of DISTRIBUTION_ROLES) {
        const rolePath = path.join(projectRoot, `data/master/roles/${roleId}.json`);
        if (fs.existsSync(rolePath)) {
          archive.file(rolePath, { name: `data/master/roles/${roleId}.json` });
        }
      }

      await archive.finalize();
    } catch (e) {
      archive.destroy(e instanceof Error ? e : new Error(String(e)));
    }
  })();

  const stream = Readable.toWeb(archive) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="resume-claude-${timestamp()}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
