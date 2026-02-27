import { withTenantRoute } from "@/lib/tenant";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const GET = withTenantRoute(
async function GET() {
    const startTime = Date.now();

    try {
        // Test database connectivity
        await prisma.$queryRaw`SELECT 1`;
        const dbLatency = Date.now() - startTime;

        return NextResponse.json(
            {
                status: 'healthy',
                version: process.env.npm_package_version || '0.9.0',
                timestamp: new Date().toISOString(),
                db: {
                    status: 'connected',
                    latencyMs: dbLatency,
                },
                uptime: process.uptime(),
            },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            {
                status: 'unhealthy',
                version: process.env.npm_package_version || '0.9.0',
                timestamp: new Date().toISOString(),
                db: {
                    status: 'disconnected',
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            },
            { status: 503 }
        );
    }
}
);
