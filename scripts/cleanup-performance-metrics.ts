import { PrismaClient } from '@prisma/client';

// Kept in sync with PERFORMANCE_METRIC_RETENTION_DAYS in
// src/services/admin/performance-metrics-cleanup.service.ts. Duplicated here
// (not imported) because this file is compiled standalone via `tsc
// --ignoreConfig` for the production image (see Dockerfile) and can't
// resolve the `@/` path aliases used inside src/.
const RETENTION_DAYS = 30;

const prisma = new PrismaClient();

async function cleanupPerformanceMetrics() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log(
        `[PerformanceMetricCleanup] Cleaning rows older than ${RETENTION_DAYS} days (cutoff: ${cutoff.toISOString()})...`,
    );

    let hasFailure = false;
    let totalDeleted = 0;

    try {
        const mainDeleted = await prisma.performanceMetric.deleteMany({
            where: { createdAt: { lt: cutoff } },
        });
        totalDeleted += mainDeleted.count;
        console.log(
            `  -> [main] deleted ${mainDeleted.count} PerformanceMetric row(s).`,
        );

        const tenants = await prisma.tenant.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, dbUrl: true },
        });

        for (const tenant of tenants) {
            if (!tenant.dbUrl) {
                console.error(
                    `  -> [${tenant.name}] no dbUrl configured, skipping.`,
                );
                hasFailure = true;
                continue;
            }

            const tenantDb = new PrismaClient({
                datasources: { db: { url: tenant.dbUrl } },
            });
            try {
                const deleted = await tenantDb.performanceMetric.deleteMany({
                    where: { createdAt: { lt: cutoff } },
                });
                totalDeleted += deleted.count;
                console.log(
                    `  -> [${tenant.name}] deleted ${deleted.count} PerformanceMetric row(s).`,
                );
            } catch (err) {
                hasFailure = true;
                console.error(`  -> [${tenant.name}] FAILED:`, err);
            } finally {
                await tenantDb.$disconnect();
            }
        }

        console.log(
            `[PerformanceMetricCleanup] Done. Total deleted: ${totalDeleted}.`,
        );

        if (hasFailure) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(
            '[PerformanceMetricCleanup] Error during retention cleanup:',
            error,
        );
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

cleanupPerformanceMetrics();
