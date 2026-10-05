import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    // Version-skew protection: with an id per deployment the client compares
    // its id against the server's and hard-navigates (full reload) on a
    // mismatch, instead of leaving a stale tab on a broken client-side
    // navigation. Unset locally, so dev/test behaviour is unchanged.
    deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
    experimental: {
        // Reverse-proxy (Caddy) multi-tenant: Server Actions dari
        // *.polyflow.uk harus diterima meski Host internal berbeda.
        // Temuan F12: x-forwarded-host mismatch meng-abort 1 aksi.
        serverActions: {
            allowedOrigins: ['*.polyflow.uk', 'polyflow.uk'],
        },
    },
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
