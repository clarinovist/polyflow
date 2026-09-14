import { PrismaClient } from '@prisma/client';
import {
    runPerformanceMetricCleanup,
    type PerformanceMetricDb,
    type PerformanceMetricMainDb,
    type PerformanceMetricCleanupReport,
} from '../src/lib/ops/performance-metrics-cleanup';

type OwnedDb<T> = T & { $disconnect: () => Promise<void> };

export interface PerformanceMetricCleanupCliDependencies {
    createMainClient: () => OwnedDb<PerformanceMetricMainDb>;
    createTenantClient: (url: string) => OwnedDb<PerformanceMetricDb>;
    now: () => Date;
    logger: Pick<Console, 'log' | 'error'>;
    setExitCode: (code: number) => void;
}

/** Import-safe adapter; only the entrypoint below uses ambient runtime dependencies. */
export async function runPerformanceMetricCleanupCli(
    dependencies: PerformanceMetricCleanupCliDependencies,
    retentionDays?: number,
): Promise<PerformanceMetricCleanupReport> {
    const report = await runPerformanceMetricCleanup({
        now: dependencies.now,
        acquireMain: () => {
            const db = dependencies.createMainClient();
            return { db, ownership: 'owned', disconnect: () => db.$disconnect() };
        },
        acquireTenant: (url) => {
            const db = dependencies.createTenantClient(url);
            return { db, ownership: 'owned', disconnect: () => db.$disconnect() };
        },
    }, retentionDays);

    // Never log registry names/IDs, URLs or raw exceptions. Ordinals preserve
    // per-target status without allowing credential-bearing metadata into logs.
    report.results.forEach((result, index) => {
        const target = index === 0 ? 'main' : `tenant #${index}`;
        const message = `  -> [${target}] ${result.online ? 'OK' : 'FAILED'}: deleted ${result.deletedCount} PerformanceMetric row(s).${result.error ? ` ${result.error}.` : ''}`;
        if (result.online) {
            dependencies.logger.log(message);
        } else {
            dependencies.logger.error(message);
        }
    });
    for (const error of report.errors) {
        dependencies.logger.error(`[PerformanceMetricCleanup] ${error}.`);
    }
    dependencies.logger.log(
        `[PerformanceMetricCleanup] Done. Total deleted: ${report.totalDeleted}. Status: ${report.hasFailure ? 'FAILED' : 'OK'}.`,
    );
    if (report.hasFailure) {
        dependencies.setExitCode(1);
    }
    return report;
}

if (require.main === module) {
    void runPerformanceMetricCleanupCli({
        createMainClient: () => new PrismaClient(),
        createTenantClient: (url) => new PrismaClient({
            datasources: { db: { url } },
        }),
        now: () => new Date(),
        logger: console,
        setExitCode: (code) => { process.exitCode = code; },
    }).catch(() => {
        console.error('[PerformanceMetricCleanup] Unexpected cleanup failure.');
        process.exitCode = 1;
    });
}
