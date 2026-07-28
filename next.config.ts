import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    async redirects() {
        return [
            {
                source: '/sales/mobile',
                destination: '/field/sales',
                permanent: false,
            },
            {
                source: '/sales/mobile/:path*',
                destination: '/field/sales/:path*',
                permanent: false,
            },
        ];
    },
};

export default nextConfig;
