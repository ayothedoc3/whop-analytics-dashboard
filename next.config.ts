import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [{ hostname: "**" }],
  },
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
};

export default withWhopAppConfig(nextConfig);
