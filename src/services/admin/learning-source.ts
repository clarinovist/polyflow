import { Prisma } from '@prisma/client';
import { getAllRegisteredFeatures } from '@/lib/analytics/feature-registry';
import { Observation, observationSchema } from '@/lib/learning/contracts';

type AggregateDb = Pick<Prisma.TransactionClient, '$queryRaw'>;
const modules = ['dashboard', 'warehouse', 'production', 'finance', 'sales', 'purchasing', 'hrd', 'maklon', 'distribution', 'unmapped'];

/** Database-side scalar aggregates only. Never hydrate rows, metadata or identities. */
export async function collectLearningObservations(db: AggregateDb, start: Date, end: Date): Promise<Observation[]> {
    const features = getAllRegisteredFeatures().filter(feature => feature.moduleKey !== 'admin').map(feature => feature.featureKey);
    const [usage] = await db.$queryRaw<Array<{ mobileFailed: bigint; mobileTotal: bigint; unmapped: bigint; views: bigint }>>(Prisma.sql`
        SELECT
            COUNT(*) FILTER (WHERE "eventType" = 'MOBILE_TASK_FAILED') AS "mobileFailed",
            COUNT(*) FILTER (WHERE "eventType" IN ('MOBILE_TASK_COMPLETED', 'MOBILE_TASK_FAILED')) AS "mobileTotal",
            COUNT(*) FILTER (WHERE "eventType" IN ('FEATURE_VIEW','MOBILE_PAGE_VIEW') AND "featureKey" = 'unmapped') AS "unmapped",
            COUNT(*) FILTER (WHERE "eventType" IN ('FEATURE_VIEW','MOBILE_PAGE_VIEW')) AS "views"
        FROM "UsageEvent"
        WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}
          AND "createdAt" < ${end}
          AND "moduleKey" IN (${Prisma.join(modules)})
          AND "featureKey" IN (${Prisma.join([...features, 'unmapped'])})
          AND "source" IN ('WEB','MOBILE_WEB')
    `);
    const [help] = await db.$queryRaw<Array<{ failed: bigint; total: bigint }>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE "outcome" IN ('FAILED','PARTIAL')) AS "failed", COUNT(*) AS "total"
        FROM "HelpInteraction"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
          AND "outcome" IN ('SUCCESS','FAILED','PARTIAL')
          AND "channel" IN ('web','telegram')
    `);
    return [
        { metricKey: 'help_failure_share', numerator: Number(help.failed), denominator: Number(help.total) },
        { metricKey: 'mobile_failure_share', numerator: Number(usage.mobileFailed), denominator: Number(usage.mobileTotal) },
        { metricKey: 'unmapped_view_share', numerator: Number(usage.unmapped), denominator: Number(usage.views) },
    ].map(value => observationSchema.parse(value));
}
