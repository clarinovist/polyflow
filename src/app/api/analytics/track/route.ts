import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { resolveTenantContext } from '@/lib/core/tenant';
import { resolveFeatureFromPath } from '@/lib/analytics/feature-registry';
import { canAccessWorkspace, WorkspaceKey } from '@/lib/auth/access-policy';
import { z } from 'zod';

const trackSchema = z.object({
    pathname: z.string().min(1).max(500),
    sessionId: z.string().max(100).optional(),
});

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

        // Server-derived feature resolution
        const resolved = resolveFeatureFromPath(pathname);
        if (!resolved) {
            return NextResponse.json(
                { error: 'Pathname is not in the tracked feature registry' },
                { status: 400 },
            );
        }

        const { featureKey, moduleKey } = resolved;

        // Authorization check for workspace-gated modules
        const validWorkspaces = [
            'admin',
            'dashboard',
            'warehouse',
            'production',
            'finance',
            'sales',
            'purchasing',
            'hrd',
            'maklon',
        ];
        if (validWorkspaces.includes(moduleKey)) {
            if (!canAccessWorkspace(session.user, moduleKey as WorkspaceKey, pathname)) {
                return NextResponse.json(
                    { error: `Forbidden: user lacks access to module ${moduleKey}` },
                    { status: 403 },
                );
            }
        }

        const sessionId = (rawSessionId || 'session-default').slice(0, 100);
        const eventType = 'FEATURE_VIEW';
        const source = 'WEB';

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
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[UsageAnalyticsIngestion] Error tracking event:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
