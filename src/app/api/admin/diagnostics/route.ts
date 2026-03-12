import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import os from 'os';

export async function GET() {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'ADMIN') {
            return new NextResponse('Unauthorized. Only ADMIN can access diagnostics.', { status: 401 });
        }

        const startTime = Date.now();
        let dbStatus = 'connected';
        let dbLatency = 0;
        let dbError = null;

        try {
            await prisma.$queryRaw`SELECT 1`;
            dbLatency = Date.now() - startTime;
        } catch (e) {
            dbStatus = 'disconnected';
            dbError = e instanceof Error ? e.message : 'Unknown database error';
        }

        // Redis is not actively pinged here assuming it is handled via Next.js cache 
        // OR we can leave it pending actual implementation.
        
        // Environment Completeness Check
        const envKeys = [
            'DATABASE_URL',
            'NEXTAUTH_SECRET',
            'NEXTAUTH_URL',
            'SENTRY_DSN',
            'SENTRY_AUTH_TOKEN'
        ];
        
        const envCompleteness = envKeys.map(key => ({
            key,
            isSet: !!process.env[key]
        }));

        const diskTotal = 'N/A in Edge/Serverless'; // Node API doesn't have native disk space OS module yet
        const diskFree = 'N/A';

        const memoryUsage = process.memoryUsage();

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            status: dbStatus === 'connected' ? 'OK' : 'DEGRADED',
            db: {
                status: dbStatus,
                latencyMs: dbLatency,
                error: dbError
            },
            system: {
                uptimeSeconds: process.uptime(),
                osUptimeSeconds: os.uptime(),
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
            },
            memory: {
                rssBytes: memoryUsage.rss,
                heapTotalBytes: memoryUsage.heapTotal,
                heapUsedBytes: memoryUsage.heapUsed,
                osTotalBytes: os.totalmem(),
                osFreeBytes: os.freemem(),
            },
            storage: {
                diskTotal,
                diskFree
            },
            environment: envCompleteness
        }, { status: 200 });
        
    } catch (error) {
        return NextResponse.json({
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
