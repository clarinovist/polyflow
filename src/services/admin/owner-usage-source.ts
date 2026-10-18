import { Prisma } from '@prisma/client';
import { getAllRegisteredFeatures } from '@/lib/analytics/feature-registry';
import { OWNER_MODULES, ownerUsageRowSchema } from '@/lib/learning/owner-contracts';

/** Account-level observations only. Shared/kiosk accounts cannot identify a person. */
export async function collectOwnerUsage(db: Prisma.TransactionClient, tenantId: string, start: Date, end: Date) {
    const features = getAllRegisteredFeatures().filter(feature => (OWNER_MODULES as readonly string[]).includes(feature.moduleKey)).map(feature => feature.featureKey);
    const rows = await db.$queryRaw<Array<{ userId: string; module: string; views: bigint; activeDays: bigint; completed: bigint; failed: bigint; retries: bigint }>>(Prisma.sql`
        SELECT "userId", "moduleKey" AS "module",
            COUNT(*) FILTER (WHERE "eventType" IN ('FEATURE_VIEW','MOBILE_PAGE_VIEW')) AS views,
            COUNT(DISTINCT (("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date) AS "activeDays",
            COUNT(*) FILTER (WHERE "eventType" = 'MOBILE_TASK_COMPLETED') AS completed,
            COUNT(*) FILTER (WHERE "eventType" = 'MOBILE_TASK_FAILED') AS failed,
            COUNT(*) FILTER (WHERE "eventType" = 'MOBILE_TASK_RETRY') AS retries
        FROM "UsageEvent"
        WHERE "tenantId" = ${tenantId} AND "occurredAt" >= ${start} AND "occurredAt" < ${end}
          AND "createdAt" < ${end} AND "userId" <> ''
          AND "featureKey" IN (${Prisma.join(features)})
          AND "moduleKey" IN (${Prisma.join([...OWNER_MODULES])})
          AND "source" IN ('WEB','MOBILE_WEB')
          AND "eventType" IN ('FEATURE_VIEW','MOBILE_PAGE_VIEW','MOBILE_TASK_COMPLETED','MOBILE_TASK_FAILED','MOBILE_TASK_RETRY')
        GROUP BY "userId", "moduleKey" ORDER BY "userId", "moduleKey" LIMIT 501
    `);
    return { truncated: rows.length > 500, rows: rows.slice(0, 500).map(row => ownerUsageRowSchema.parse({ ...row, views: Number(row.views), activeDays: Number(row.activeDays), completed: Number(row.completed), failed: Number(row.failed), retries: Number(row.retries) })) };
}
