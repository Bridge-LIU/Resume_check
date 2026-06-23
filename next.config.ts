import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 履歴書 PDF/DOCX/XLSX を Server Action 経由でアップロードするため、
      // 既定 1MB → 5MB に拡張。base64 化で +33% のため、実ファイル 3.7MB 程度まで許容。
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
