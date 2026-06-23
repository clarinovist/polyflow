import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverActions: {
    bodySizeLimit: "4mb",
  },
};

export default nextConfig;
