import type { PrismaClient } from '@prisma/client';
import type { ModuleKey } from '@/lib/modules/module-registry';
import { hasTenantModuleDirect } from '@/lib/modules/tenant-entitlements';
import {
    detectorResources,
    type DetectorKey,
} from '@/lib/findings/detector-catalog';
import {
    detectCriticalStock,
    detectMissingFinanceJournals,
    detectOverdueAp,
    detectOverdueAr,
    detectProductionNoProgress,
    detectStuckSalesOrders,
} from './detectors';
import {
    skippedDetectionResult,
    type DetectionResult,
} from './detection-types';

type DetectorSpec = {
    key: DetectorKey;
    module: ModuleKey;
    run: (tenantDb: PrismaClient) => Promise<DetectionResult>;
};

// Overdue AP follows the PURCHASING entitlement, same as the legacy
// cleanup-cron producer; the purchase invoice pages live under /purchasing.
const DETECTORS: DetectorSpec[] = [
    { key: 'critical_stock', module: 'INVENTORY', run: detectCriticalStock },
    { key: 'stuck_so', module: 'SALES', run: detectStuckSalesOrders },
    { key: 'overdue_ar', module: 'FINANCE', run: detectOverdueAr },
    { key: 'overdue_ap', module: 'PURCHASING', run: detectOverdueAp },
    {
        key: 'missing_finance_journal',
        module: 'FINANCE',
        run: detectMissingFinanceJournals,
    },
    {
        key: 'production_no_progress',
        module: 'PRODUCTION',
        run: detectProductionNoProgress,
    },
];

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function resolveEntitlements(
    tenantId: string,
): Promise<Map<ModuleKey, boolean | Error>> {
    const modules = [...new Set(DETECTORS.map((d) => d.module))];
    const checks = await Promise.allSettled(
        modules.map((m) => hasTenantModuleDirect(tenantId, m)),
    );
    return new Map(
        modules.map((m, i) => {
            const check = checks[i];
            return [
                m,
                check.status === 'fulfilled'
                    ? check.value
                    : new Error(errorMessage(check.reason)),
            ];
        }),
    );
}

function runOne(
    spec: DetectorSpec,
    entitlement: boolean | Error | undefined,
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const resources = detectorResources(spec.key);
    if (entitlement instanceof Error || entitlement === undefined) {
        return Promise.resolve(
            skippedDetectionResult(
                spec.key,
                resources,
                'entitlement check failed',
            ),
        );
    }
    if (!entitlement) {
        return Promise.resolve(
            skippedDetectionResult(
                spec.key,
                resources,
                `module ${spec.module} not entitled`,
            ),
        );
    }
    return spec.run(tenantDb);
}

/**
 * Runs every detector the tenant is entitled to, in parallel, against the
 * explicit tenant client. Never rejects: a non-entitled module (or a failed
 * entitlement check) yields `skipped`, a thrown detector yields `failed`, and
 * neither lets a sync auto-resolve open findings.
 */
export async function runEntitledDetectors(
    tenantId: string,
    tenantDb: PrismaClient,
): Promise<DetectionResult[]> {
    const entitlements = await resolveEntitlements(tenantId);
    const runs = await Promise.allSettled(
        DETECTORS.map((spec) =>
            runOne(spec, entitlements.get(spec.module), tenantDb),
        ),
    );

    return runs.map((run, i) => {
        const spec = DETECTORS[i];
        const result: DetectionResult =
            run.status === 'fulfilled'
                ? run.value
                : {
                      detector: spec.key,
                      status: 'failed',
                      error: errorMessage(run.reason),
                      requiredResources: detectorResources(spec.key),
                      items: [],
                  };
        if (result.status === 'failed') {
            console.error(
                `[DETECTORS] ${spec.key} failed for tenant ${tenantId}:`,
                result.error,
            );
        }
        return result;
    });
}
