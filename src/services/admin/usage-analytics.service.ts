import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { getAllRegisteredFeatures } from '@/lib/analytics/feature-registry';
import { BusinessRuleError } from '@/lib/errors/errors';

export interface UsageAnalyticsFilter {
    range?: 'today' | 'yesterday' | '7d' | '30d' | 'custom';
    startDate?: string;
    endDate?: string;
    tenantId?: string;
    moduleKey?: string;
}

export interface MetricWithTrend {
    value: number;
    prevValue: number;
    changePercent: number;
}

export interface FeatureUsageSummary {
    featureKey: string;
    label: string;
    moduleKey: string;
    totalViews: number;
    prevViews: number;
    changePercent: number;
    uniqueUsers: number;
    uniqueTenants: number;
}

export interface TenantUsageSummary {
    tenantId: string;
    tenantName: string;
    subdomain: string;
    totalViews: number;
    prevViews: number;
    changePercent: number;
    activeUsers: number;
    featuresUsed: number;
    lastActivity: Date | null;
}

export interface DailyTrendPoint {
    date: string;
    totalViews: number;
    activeUsers: number;
    activeTenants: number;
}

export interface UsageAnalyticsOverviewData {
    periodLabel: string;
    metrics: {
        activeUsers: MetricWithTrend;
        activeTenants: MetricWithTrend;
        totalViews: MetricWithTrend;
        featuresUsed: MetricWithTrend;
    };
    topFeatures: FeatureUsageSummary[];
    tenantSummaries: TenantUsageSummary[];
    dailyTrends: DailyTrendPoint[];
    availableTenants: { id: string; name: string; subdomain: string }[];
    availableModules: string[];
}

function parseYmd(dateStr: string): { year: number; month: number; day: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { year, month, day };
}

/**
 * Calculates start/end boundaries in Asia/Jakarta timezone (+07:00).
 */
function calculateJakartaBounds(filter: UsageAnalyticsFilter): {
    start: Date;
    end: Date;
    prevStart: Date;
    prevEnd: Date;
    label: string;
} {
    const range = filter.range || '7d';
    const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

    const nowUtc = new Date();
    // Shift UTC date to Jakarta local wall-clock time
    const jakartaNow = new Date(nowUtc.getTime() + JAKARTA_OFFSET_MS);

    let startJakarta: Date;
    let endJakarta: Date;
    let label = '7 Hari Terakhir';

    if (range === 'today') {
        startJakarta = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate(), 0, 0, 0, 0));
        endJakarta = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate(), 23, 59, 59, 999));
        label = 'Hari Ini';
    } else if (range === 'yesterday') {
        const yesterday = new Date(jakartaNow.getTime() - 24 * 60 * 60 * 1000);
        startJakarta = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0, 0));
        endJakarta = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 23, 59, 59, 999));
        label = 'Kemarin';
    } else if (range === '30d') {
        endJakarta = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate(), 23, 59, 59, 999));
        startJakarta = new Date(endJakarta.getTime() - 30 * 24 * 60 * 60 * 1000 + 1);
        label = '30 Hari Terakhir';
    } else if (range === 'custom') {
        if (!filter.startDate || !filter.endDate) {
            throw new BusinessRuleError('Tanggal mulai dan selesai (format YYYY-MM-DD) wajib diisi untuk rentang kustom.');
        }

        const startParsed = parseYmd(filter.startDate);
        const endParsed = parseYmd(filter.endDate);

        if (!startParsed || !endParsed) {
            throw new BusinessRuleError('Format tanggal kustom harus YYYY-MM-DD yang valid.');
        }

        startJakarta = new Date(Date.UTC(startParsed.year, startParsed.month, startParsed.day, 0, 0, 0, 0));
        endJakarta = new Date(Date.UTC(endParsed.year, endParsed.month, endParsed.day, 23, 59, 59, 999));

        if (startJakarta > endJakarta) {
            throw new BusinessRuleError('Tanggal mulai tidak boleh lebih besar dari tanggal selesai.');
        }

        // Cap custom range at 90 days matching raw event retention policy (Fix 5)
        if (endJakarta.getTime() - startJakarta.getTime() > 90 * 24 * 60 * 60 * 1000) {
            throw new BusinessRuleError('Rentang tanggal kustom maksimal 90 hari sesuai batas retensi event mentah.');
        }

        label = `${filter.startDate} s/d ${filter.endDate}`;
    } else {
        // 7d default
        endJakarta = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate(), 23, 59, 59, 999));
        startJakarta = new Date(endJakarta.getTime() - 7 * 24 * 60 * 60 * 1000 + 1);
        label = '7 Hari Terakhir';
    }

    // Convert Jakarta wall-clock dates back to UTC timestamps for database queries
    const start = new Date(startJakarta.getTime() - JAKARTA_OFFSET_MS);
    const end = new Date(endJakarta.getTime() - JAKARTA_OFFSET_MS);

    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start.getTime() - durationMs);

    return { start, end, prevStart, prevEnd, label };
}

function calcPercentChange(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
}

export class UsageAnalyticsService {
    static async getAnalytics(
        filter: UsageAnalyticsFilter = {},
    ): Promise<UsageAnalyticsOverviewData> {
        const { start, end, prevStart, prevEnd, label } = calculateJakartaBounds(filter);

        const tenantFilter = filter.tenantId && filter.tenantId !== 'all' ? filter.tenantId : undefined;
        const moduleFilter = filter.moduleKey && filter.moduleKey !== 'all' ? filter.moduleKey : undefined;

        // Base Prisma Where clause (strictly filtering eventType = 'FEATURE_VIEW')
        const baseWhereCurr: Record<string, unknown> = {
            eventType: 'FEATURE_VIEW',
            occurredAt: { gte: start, lte: end },
        };
        const baseWherePrev: Record<string, unknown> = {
            eventType: 'FEATURE_VIEW',
            occurredAt: { gte: prevStart, lte: prevEnd },
        };

        if (tenantFilter) {
            baseWhereCurr.tenantId = tenantFilter;
            baseWherePrev.tenantId = tenantFilter;
        }
        if (moduleFilter) {
            baseWhereCurr.moduleKey = moduleFilter;
            baseWherePrev.moduleKey = moduleFilter;
        }

        // Exclude platform main events from tenant adoption calculations (Finding 7)
        const tenantWhereCurr = {
            ...baseWhereCurr,
            tenantId: tenantFilter || { notIn: ['main', 'admin'] },
            moduleKey: moduleFilter || { not: 'admin' },
        };
        const tenantWherePrev = {
            ...baseWherePrev,
            tenantId: tenantFilter || { notIn: ['main', 'admin'] },
            moduleKey: moduleFilter || { not: 'admin' },
        };

        // Query Tenants list for filters and metadata
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, subdomain: true },
            orderBy: { name: 'asc' },
        });
        const tenantMap = new Map(tenants.map((t) => [t.id, t]));

        const tenantSqlClause = tenantFilter
            ? Prisma.sql`AND "tenantId" = ${tenantFilter}`
            : Prisma.empty;
        const moduleSqlClause = moduleFilter
            ? Prisma.sql`AND "moduleKey" = ${moduleFilter}`
            : Prisma.empty;

        // 1. Database-bounded Total Views Count
        const [currTotalViews, prevTotalViews] = await Promise.all([
            prisma.usageEvent.count({ where: baseWhereCurr }),
            prisma.usageEvent.count({ where: baseWherePrev }),
        ]);

        // 2. Database-bounded Active Users Count (Distinct tenantId + userId)
        const [currActiveUsersRes, prevActiveUsersRes] = await Promise.all([
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT CONCAT("tenantId", ':', "userId")) as count
                FROM "UsageEvent"
                WHERE "eventType" = 'FEATURE_VIEW'
                  AND "occurredAt" >= ${start} AND "occurredAt" <= ${end}
                  ${tenantSqlClause}
                  ${moduleSqlClause}
            `,
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT CONCAT("tenantId", ':', "userId")) as count
                FROM "UsageEvent"
                WHERE "eventType" = 'FEATURE_VIEW'
                  AND "occurredAt" >= ${prevStart} AND "occurredAt" <= ${prevEnd}
                  ${tenantSqlClause}
                  ${moduleSqlClause}
            `,
        ]);

        const currActiveUsers = Number(currActiveUsersRes[0]?.count || 0);
        const prevActiveUsers = Number(prevActiveUsersRes[0]?.count || 0);

        // 3. Database-bounded Active Tenants GroupBy
        const [currTenantsGroup, prevTenantsGroup] = await Promise.all([
            prisma.usageEvent.groupBy({
                by: ['tenantId'],
                where: tenantWhereCurr,
            }),
            prisma.usageEvent.groupBy({
                by: ['tenantId'],
                where: tenantWherePrev,
            }),
        ]);

        const currActiveTenants = currTenantsGroup.length;
        const prevActiveTenants = prevTenantsGroup.length;

        // 4. Database-bounded Distinct Features Used GroupBy
        const [currFeaturesGroup, prevFeaturesGroup] = await Promise.all([
            prisma.usageEvent.groupBy({
                by: ['featureKey'],
                where: baseWhereCurr,
            }),
            prisma.usageEvent.groupBy({
                by: ['featureKey'],
                where: baseWherePrev,
            }),
        ]);

        const currFeaturesUsed = currFeaturesGroup.length;
        const prevFeaturesUsed = prevFeaturesGroup.length;

        const metrics = {
            activeUsers: {
                value: currActiveUsers,
                prevValue: prevActiveUsers,
                changePercent: calcPercentChange(currActiveUsers, prevActiveUsers),
            },
            activeTenants: {
                value: currActiveTenants,
                prevValue: prevActiveTenants,
                changePercent: calcPercentChange(currActiveTenants, prevActiveTenants),
            },
            totalViews: {
                value: currTotalViews,
                prevValue: prevTotalViews,
                changePercent: calcPercentChange(currTotalViews, prevTotalViews),
            },
            featuresUsed: {
                value: currFeaturesUsed,
                prevValue: prevFeaturesUsed,
                changePercent: calcPercentChange(currFeaturesUsed, prevFeaturesUsed),
            },
        };

        // Registered Features Map for Labels
        const registeredFeatures = getAllRegisteredFeatures();
        const featureInfoMap = new Map(
            registeredFeatures.map((f) => [
                f.featureKey,
                { label: f.label, moduleKey: f.moduleKey },
            ]),
        );

        // 5. Database Top 25 Features Aggregation (PostgreSQL GroupBy)
        const topFeaturesRaw = await prisma.$queryRaw<{
            featureKey: string;
            moduleKey: string;
            currViews: bigint;
            uniqueUsers: bigint;
            uniqueTenants: bigint;
        }[]>`
            SELECT 
                "featureKey",
                "moduleKey",
                COUNT(*) as "currViews",
                COUNT(DISTINCT CONCAT("tenantId", ':', "userId")) as "uniqueUsers",
                COUNT(DISTINCT "tenantId") as "uniqueTenants"
            FROM "UsageEvent"
            WHERE "eventType" = 'FEATURE_VIEW'
              AND "occurredAt" >= ${start} AND "occurredAt" <= ${end}
              ${tenantSqlClause}
              ${moduleSqlClause}
            GROUP BY "featureKey", "moduleKey"
            ORDER BY "currViews" DESC
            LIMIT 25
        `;

        // Fetch previous period views for these top 25 features to calculate trends
        const topFeatureKeys = topFeaturesRaw.map((f) => f.featureKey);
        const prevTopFeaturesViews = topFeatureKeys.length > 0 ? await prisma.usageEvent.groupBy({
            by: ['featureKey'],
            _count: { _all: true },
            where: {
                ...baseWherePrev,
                featureKey: { in: topFeatureKeys },
            },
        }) : [];

        const prevFeatureViewsMap = new Map(
            prevTopFeaturesViews.map((p) => [p.featureKey, p._count._all]),
        );

        const topFeatures: FeatureUsageSummary[] = topFeaturesRaw.map((f) => {
            const info = featureInfoMap.get(f.featureKey);
            const currV = Number(f.currViews);
            const prevV = prevFeatureViewsMap.get(f.featureKey) || 0;
            return {
                featureKey: f.featureKey,
                label: info?.label || f.featureKey,
                moduleKey: info?.moduleKey || f.moduleKey,
                totalViews: currV,
                prevViews: prevV,
                changePercent: calcPercentChange(currV, prevV),
                uniqueUsers: Number(f.uniqueUsers),
                uniqueTenants: Number(f.uniqueTenants),
            };
        });

        // 6. Database Tenant Summaries Aggregation (PostgreSQL GroupBy)
        const tenantSummariesRaw = await prisma.$queryRaw<{
            tenantId: string;
            currViews: bigint;
            activeUsers: bigint;
            featuresUsed: bigint;
            lastActivity: Date;
        }[]>`
            SELECT 
                "tenantId",
                COUNT(*) as "currViews",
                COUNT(DISTINCT "userId") as "activeUsers",
                COUNT(DISTINCT "featureKey") as "featuresUsed",
                MAX("occurredAt") as "lastActivity"
            FROM "UsageEvent"
            WHERE "eventType" = 'FEATURE_VIEW'
              AND "occurredAt" >= ${start} AND "occurredAt" <= ${end}
              AND "tenantId" NOT IN ('main', 'admin')
              ${tenantSqlClause}
              ${moduleSqlClause}
            GROUP BY "tenantId"
            ORDER BY "currViews" DESC
        `;

        const activeTenantIds = tenantSummariesRaw.map((t) => t.tenantId);
        const prevTenantViews = activeTenantIds.length > 0 ? await prisma.usageEvent.groupBy({
            by: ['tenantId'],
            _count: { _all: true },
            where: {
                ...tenantWherePrev,
                tenantId: { in: activeTenantIds },
            },
        }) : [];

        const prevTenantViewsMap = new Map(
            prevTenantViews.map((p) => [p.tenantId, p._count._all]),
        );

        const tenantSummaries: TenantUsageSummary[] = tenantSummariesRaw.map((t) => {
            const tenantInfo = tenantMap.get(t.tenantId);
            const currV = Number(t.currViews);
            const prevV = prevTenantViewsMap.get(t.tenantId) || 0;
            return {
                tenantId: t.tenantId,
                tenantName: tenantInfo?.name || t.tenantId,
                subdomain: tenantInfo?.subdomain || t.tenantId,
                totalViews: currV,
                prevViews: prevV,
                changePercent: calcPercentChange(currV, prevV),
                activeUsers: Number(t.activeUsers),
                featuresUsed: Number(t.featuresUsed),
                lastActivity: t.lastActivity,
            };
        });

        // 7. Daily Trends Grouping (PostgreSQL GroupBy + WIB Zero-Filling) (Finding 6 & 17)
        const dailyTrendsRaw = await prisma.$queryRaw<{
            dateStr: string;
            totalViews: bigint;
            activeUsers: bigint;
            activeTenants: bigint;
        }[]>`
            SELECT 
                TO_CHAR("occurredAt" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') as "dateStr",
                COUNT(*) as "totalViews",
                COUNT(DISTINCT CONCAT("tenantId", ':', "userId")) as "activeUsers",
                COUNT(DISTINCT "tenantId") as "activeTenants"
            FROM "UsageEvent"
            WHERE "eventType" = 'FEATURE_VIEW'
              AND "occurredAt" >= ${start} AND "occurredAt" <= ${end}
              ${tenantSqlClause}
              ${moduleSqlClause}
            GROUP BY "dateStr"
            ORDER BY "dateStr" ASC
        `;

        const dbDailyMap = new Map(
            dailyTrendsRaw.map((d) => [
                d.dateStr,
                {
                    totalViews: Number(d.totalViews),
                    activeUsers: Number(d.activeUsers),
                    activeTenants: Number(d.activeTenants),
                },
            ]),
        );

        // Pre-fill continuous dates across the exact range in Asia/Jakarta (Zero-filling)
        const dailyTrends: DailyTrendPoint[] = [];
        const currCursor = new Date(start.getTime() + 7 * 60 * 60 * 1000);
        const endCursor = new Date(end.getTime() + 7 * 60 * 60 * 1000);

        while (currCursor <= endCursor) {
            const dateStr = currCursor.toISOString().split('T')[0];
            const existing = dbDailyMap.get(dateStr);
            dailyTrends.push({
                date: dateStr,
                totalViews: existing?.totalViews || 0,
                activeUsers: existing?.activeUsers || 0,
                activeTenants: existing?.activeTenants || 0,
            });
            currCursor.setUTCDate(currCursor.getUTCDate() + 1);
        }

        const availableModules = Array.from(
            new Set(registeredFeatures.map((f) => f.moduleKey)),
        ).sort();

        return {
            periodLabel: label,
            metrics,
            topFeatures,
            tenantSummaries,
            dailyTrends,
            availableTenants: tenants,
            availableModules,
        };
    }
}
