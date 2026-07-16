import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (used for AI document summarization, lib/pdf.ts) ships a
  // worker that Next.js's server bundler can't resolve unless the package
  // is kept external rather than bundled.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
