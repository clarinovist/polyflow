import { withTenantRoute } from "@/lib/core/tenant";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';

import os from 'os';

export const GET = withTenantRoute(
async function GET() {
    const startTime = Date.now();

    try {
        // Test database connectivity
        await prisma.$queryRaw`SELECT 1`;
        const dbLatency = Date.now() - startTime;

        const memoryUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();

        return NextResponse.json(
            {
                status: 'healthy',
                version: process.env.npm_package_version || '0.9.0',
                timestamp: new Date().toISOString(),
                db: {
                    status: 'connected',
                    latencyMs: dbLatency,
                },
                system: {
                    uptime: process.uptime(),
                    memory: {
                        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
                        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                        osTotal: Math.round(totalMem / 1024 / 1024) + ' MB',
                        osFree: Math.round(freeMem / 1024 / 1024) + ' MB'
                    },
                    loadAverage: os.loadavg()
                }
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
