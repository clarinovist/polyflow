import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { resolveTenantContext } from '@/lib/core/tenant';
import { resolveFeatureFromPath } from '@/lib/analytics/feature-registry';
import { canAccessWorkspace, WorkspaceKey } from '@/lib/auth/access-policy';
import { z } from 'zod';

const VALID_WORKSPACES: readonly string[] = [
    'admin',
    'dashboard',
    'warehouse',
    'production',
    'finance',
    'sales',
    'purchasing',
    'hrd',
    'maklon',
    'distribution',
];

const EVENT_TYPES = [
    'FEATURE_VIEW',
    'MOBILE_TASK_STARTED',
    'MOBILE_TASK_COMPLETED',
    'MOBILE_TASK_FAILED',
] as const;

const EVENT_SOURCES = ['WEB', 'MOBILE_WEB'] as const;

const trackSchema = z.object({
    pathname: z.string().min(1).max(500),
    sessionId: z.string().max(100).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    source: z.enum(EVENT_SOURCES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

// Telemetry must never become a PII sink: keep flat scalars only.
function sanitizeTelemetryMetadata(input: unknown): Record<string, string | number | boolean> | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
    const out: Record<string, string | number | boolean> = {};
    let kept = 0;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (kept >= 20 || key.length > 64) continue;
        if (typeof value === 'string') {
            out[key] = value.slice(0, 500);
            kept++;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            out[key] = value;
            kept++;
        }
    }
    return kept > 0 ? out : undefined;
}

// Short-window in-memory deduplication cache
const recentEventsCache = new Map<string, number>();

// Rate-limiting cache per user (max 60 events / minute)
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of recentEventsCache.entries()) {
        if (now - timestamp > 10000) {
            recentEventsCache.delete(key);
        }
    }
    for (const [key, data] of rateLimitCache.entries()) {
        if (now > data.resetTime) {
            rateLimitCache.delete(key);
        }
    }
}, 60000);

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const tenantRes = await resolveTenantContext(req.headers);

        if (tenantRes.type !== 'RESOLVED') {
            return NextResponse.json(
                { error: 'Invalid or unresolved tenant context' },
                { status: 403 },
            );
        }

        const tenantId = tenantRes.tenantId;

        // Rate limiting check: max 60 calls / minute per user (Fix 1)
        const now = Date.now();
        const userLimitKey = `${tenantId}:${userId}`;
        const userRateData = rateLimitCache.get(userLimitKey) || {
            count: 0,
            resetTime: now + 60000,
        };

        if (now > userRateData.resetTime) {
            userRateData.count = 1;
            userRateData.resetTime = now + 60000;
        } else {
            userRateData.count++;
        }

        rateLimitCache.set(userLimitKey, userRateData);

        if (userRateData.count > 60) {
            return NextResponse.json(
                { error: 'Too many tracking requests' },
                { status: 429 },
            );
        }

        // Zod validation
        let bodyRaw: unknown;
        try {
            bodyRaw = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parseResult = trackSchema.safeParse(bodyRaw);
        if (!parseResult.success) {
            return NextResponse.json(
                { error: 'Invalid request payload', details: parseResult.error.format() },
                { status: 400 },
            );
        }

        const { pathname, sessionId: rawSessionId } = parseResult.data;
        const nestedMeta =
            parseResult.data.metadata && typeof parseResult.data.metadata === 'object'
                ? (parseResult.data.metadata as Record<string, unknown>)
                : undefined;
        const eventType = parseResult.data.eventType
            ?? (typeof nestedMeta?.eventType === 'string' && (EVENT_TYPES as readonly string[]).includes(nestedMeta.eventType)
                ? (nestedMeta.eventType as (typeof EVENT_TYPES)[number])
                : 'FEATURE_VIEW');
        const source = parseResult.data.source
            ?? (typeof nestedMeta?.source === 'string' && (EVENT_SOURCES as readonly string[]).includes(nestedMeta.source)
                ? (nestedMeta.source as (typeof EVENT_SOURCES)[number])
                : 'WEB');
        const cleanMetadata = sanitizeTelemetryMetadata(parseResult.data.metadata);

        // Server-derived feature resolution.
        // Unmapped paths are recorded (not rejected) so new pages surface
        // in analytics within a day instead of staying invisible forever.
        const resolved = resolveFeatureFromPath(pathname);
        let featureKey: string;
        let moduleKey: string;
        let unmappedPath: string | undefined;
        if (!resolved) {
            const firstSegment = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] ?? '';
            moduleKey = VALID_WORKSPACES.includes(firstSegment) ? firstSegment : 'unmapped';
            featureKey = 'unmapped';
            unmappedPath = pathname.slice(0, 500);
        } else {
            featureKey = resolved.featureKey;
            moduleKey = resolved.moduleKey;
        }

        // Authorization check for workspace-gated modules
        const validWorkspaces = VALID_WORKSPACES;
        if (validWorkspaces.includes(moduleKey)) {
            if (!canAccessWorkspace(session.user, moduleKey as WorkspaceKey, pathname)) {
                return NextResponse.json(
                    { error: `Forbidden: user lacks access to module ${moduleKey}` },
                    { status: 403 },
                );
            }
        }

        const sessionId = (rawSessionId || 'session-default').slice(0, 100);

        // Atomic in-memory deduplication check
        const dedupKey = `${tenantId}:${userId}:${featureKey}:${sessionId}`;
        const lastSeen = recentEventsCache.get(dedupKey);

        if (lastSeen && now - lastSeen < 3000) {
            return NextResponse.json({ success: true, deduplicated: true });
        }

        recentEventsCache.set(dedupKey, now);

        // Save event to main DB
        await prisma.usageEvent.create({
            data: {
                tenantId,
                userId,
                featureKey,
                moduleKey,
                eventType,
                source,
                sessionId,
                ...(unmappedPath || cleanMetadata
                    ? { metadata: { ...(cleanMetadata ?? {}), ...(unmappedPath ? { unmappedPath } : {}) } }
                    : {}),
            },
        });

        return NextResponse.json({ success: true, ...(unmappedPath ? { unmapped: true } : {}) });
    } catch (error) {
        console.error('[UsageAnalyticsIngestion] Error tracking event:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
