import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["exceljs", "unpdf", "mammoth", "xlsx", "pdfkit", "docx"],
};

export default nextConfig;
