import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 配布 ZIP は `.next/standalone/` 一括同梱で npm install / build を端末側で回さない。
  // Next.js standalone 預打包（更新機構が想定する）用の出力モード。
  //
  // 出力先: `.next/standalone/server.js` （+ 最小 node_modules）
  //         + `.next/static/`（別途 コピーが必要）
  //         + `public/`（別途 コピーが必要）
  //
  // 端末側 start.bat は `.next/standalone/server.js` の存在を検知して
  // `node .next/standalone/server.js` を呼ぶ分岐を持つ想定。
  output: "standalone",

  // ⚠️ Next.js の outputFileTracing は `lib/storage.ts` が `process.cwd() + /data`
  // にアクセスしていることを見て `data/` フォルダ全体（== ユーザーの面接データ）を
  // standalone bundle に取り込んでしまう。以下は明示的な排除リスト。
  outputFileTracingExcludes: {
    "*": [
      "./data/**",              // PII 保護（sessions / master / settings.json / analytics 全部）
      "./.preview/**",          // ローカル画面ショット・mockup
      "./.superpowers/**",      // Claude Code 一時
      "./.claude/**",           // Claude Code 設定
      "./.git/**",              // git 履歴
      "./.next/cache/**",       // build cache（standalone runtime 不要）
      "./scripts/dev/**",       // 開発者専用スクリプト
      "./マニュアル/**",         // マニュアル資材
      "./運用マニュアル.HTML",  // 統合マニュアル HTML
      "./AGENTS.md",
      "./CLAUDE.md",
      "./README.md",
      "./GET",                  // 由来不明の 0 byte ファイル
      "./start.bat",            // 起動スクリプトは配布 ZIP の root 直下に別配置
      "./.env.local",           // ローカル環境変数
      "./.env.local.example",
      "./tsconfig.tsbuildinfo",
    ],
  },

  // native / worker ファイルは Next.js の自動 trace で拾いきれない可能性があるため明示。
  // 参考: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  outputFileTracingIncludes: {
    "*": [
      // unpdf は pdf.js worker を lazy import。standalone で worker が欠けると PDF 抽出が壊れる
      "./node_modules/unpdf/**/*.mjs",
      "./node_modules/unpdf/**/*.js",
      // word-extractor は WordDocument や関連 XML テンプレートを実行時に読む
      "./node_modules/word-extractor/**/*.xml",
      "./node_modules/word-extractor/**/*.js",
      // pdfkit のフォント（PDF 生成時にフォントを埋め込むために必要）
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },

  experimental: {
    serverActions: {
      // 履歴書 PDF/DOCX/XLSX を Server Action 経由でアップロードするため、
      // 既定 1MB → 5MB に拡張。base64 化で +33% のため、実ファイル 3.7MB 程度まで許容。
      bodySizeLimit: "5mb",
    },
    // barrel import を使っていなくても、対象パッケージの subpath 解決を最適化して
    // クライアントバンドルを縮める（Next 16 で stable に近い experimental）。
    optimizePackageImports: [
      "lucide-react",
      "sonner",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-select",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tooltip",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },
  // サーバ専用かつ Node の native/動的読込に依存するパッケージは
  // バンドル対象から外して RSC のトレース誤検出と build 不安定を回避する。
  //
  // ⚠️ 2026-07-14 unpdf を除外リストから外した:
  //   Turbopack の standalone build で `[externals]_unpdf_*.js` chunk が
  //   実行時に "Failed to load chunk ... from module 90911" で失敗する事象を確認。
  //   external 経路を経由せず SSR bundle に含めることで chunk 解決を回避する。
  //   bundle サイズは ~2MB 増える見込み。
  serverExternalPackages: ["exceljs", "mammoth", "xlsx", "pdfkit", "docx"],
};

export default nextConfig;
