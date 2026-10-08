import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { readFile } from 'node:fs/promises';
import os from 'os';

interface OperationsSnapshot {
    generatedAt: string;
    status: 'healthy' | 'warning' | 'critical';
    releaseSha: string | null;
    backup: {
        status: 'healthy' | 'warning' | 'critical';
        databaseCount: number;
        latestAgeSeconds: number | null;
        assistantSources: number;
        lastJob: 'success' | 'failed' | 'unknown';
    };
    disk: { usedPercent: number; level: 'normal' | 'warning' | 'critical' };
    recovery: {
        rpoHours: number;
        rtoHours: number;
        lastRestoreDrill: { status: 'passed'; durationSeconds: number; databaseCount: number };
    };
}

const SNAPSHOT_PATH = process.env.OPERATIONS_SNAPSHOT_PATH ?? '/app/operations/health.json';
const SNAPSHOT_MAX_AGE_MS = 45 * 60 * 1000;

function isOperationsSnapshot(value: unknown): value is OperationsSnapshot {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<OperationsSnapshot>;
    const generatedAt = Date.parse(candidate.generatedAt ?? '');
    const backup = candidate.backup;
    const disk = candidate.disk;
    const recovery = candidate.recovery;
    return Number.isFinite(generatedAt) && generatedAt <= Date.now() + 60_000 &&
        ['healthy', 'warning', 'critical'].includes(candidate.status ?? '') &&
        ['healthy', 'warning', 'critical'].includes(backup?.status ?? '') &&
        Number.isInteger(backup?.databaseCount) && (backup?.databaseCount ?? -1) >= 0 &&
        (backup?.latestAgeSeconds === null || (typeof backup?.latestAgeSeconds === 'number' && backup.latestAgeSeconds >= 0)) &&
        Number.isInteger(backup?.assistantSources) && (backup?.assistantSources ?? -1) >= 0 &&
        ['success', 'failed', 'unknown'].includes(backup?.lastJob ?? '') &&
        typeof disk?.usedPercent === 'number' && disk.usedPercent >= 0 && disk.usedPercent <= 100 &&
        ['normal', 'warning', 'critical'].includes(disk?.level ?? '') &&
        recovery?.rpoHours === 24 && recovery?.rtoHours === 2 &&
        recovery.lastRestoreDrill?.status === 'passed' &&
        Number.isInteger(recovery.lastRestoreDrill.durationSeconds) &&
        Number.isInteger(recovery.lastRestoreDrill.databaseCount);
}

async function readOperationsSnapshot() {
    try {
        const parsed: unknown = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
        if (!isOperationsSnapshot(parsed)) return { available: false, stale: true, data: null };
        const ageMs = Date.now() - Date.parse(parsed.generatedAt);
        return { available: true, stale: !Number.isFinite(ageMs) || ageMs > SNAPSHOT_MAX_AGE_MS, data: parsed };
    } catch {
        return { available: false, stale: true, data: null };
    }
}

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const startTime = Date.now();
        let dbStatus = 'connected';
        let dbLatency = 0;
        try {
            await prisma.$queryRaw`SELECT 1`;
            dbLatency = Date.now() - startTime;
        } catch {
            dbStatus = 'disconnected';
        }
        const operations = await readOperationsSnapshot();
        const memoryUsage = process.memoryUsage();
        const degraded = dbStatus !== 'connected' || operations.stale || operations.data?.status === 'critical';
        return NextResponse.json({
            timestamp: new Date().toISOString(),
            status: degraded ? 'DEGRADED' : 'OK',
            db: { status: dbStatus, latencyMs: dbLatency },
            releaseSha: process.env.NEXT_DEPLOYMENT_ID?.slice(0, 12) ?? null,
            operations,
            system: { uptimeSeconds: process.uptime(), osUptimeSeconds: os.uptime(), platform: os.platform(), arch: os.arch(), cpus: os.cpus().length },
            memory: { rssBytes: memoryUsage.rss, heapTotalBytes: memoryUsage.heapTotal, heapUsedBytes: memoryUsage.heapUsed, osTotalBytes: os.totalmem(), osFreeBytes: os.freemem() },
        });
    } catch {
        return NextResponse.json({ status: 'ERROR', error: 'Gagal menjalankan diagnostics' }, { status: 500 });
    }
}
