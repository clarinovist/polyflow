import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/sales/mobile/:path*",
        destination: "/field/sales/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
