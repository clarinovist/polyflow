import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    // Version-skew protection: with an id per deployment the client compares
    // its id against the server's and hard-navigates (full reload) on a
    // mismatch, instead of leaving a stale tab on a broken client-side
    // navigation. Unset locally, so dev/test behaviour is unchanged.
    deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
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
