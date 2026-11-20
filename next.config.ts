import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "bcryptjs", "nodemailer", "sharp", "@aws-sdk/client-s3"],
  // Migrationsdateien werden zur Laufzeit gelesen
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // Entwicklung mit Community-Subdomains über *.lvh.me (zeigt auf 127.0.0.1)
  allowedDevOrigins: ["*.lvh.me", "lvh.me"],
};

export default nextConfig;
