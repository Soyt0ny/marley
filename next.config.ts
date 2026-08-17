import type { NextConfig } from "next";

/**
 * Images are served from Cloudflare R2 through a public host. Only that host is whitelisted;
 * `images.domains` is deprecated in Next 16 in favour of `remotePatterns`.
 */
const assetHost = process.env.NEXT_PUBLIC_ASSET_HOST?.trim();

const nextConfig: NextConfig = {
  // Produces .next/standalone for the Docker image Dokploy builds on the VPS.
  output: "standalone",
  images: {
    remotePatterns: assetHost
      ? [{ protocol: "https", hostname: assetHost, pathname: "/**" }]
      : [],
  },
};

export default nextConfig;
