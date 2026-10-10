'use server';

import { getTenantDbFromContext } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    dashboardSectionState,
    observeDashboardSection,
} from '@/services/dashboard/dashboard-section-observability';
import {
    readWarehouseLoadingAttention,
    readWarehouseMaterialQueue,
    readWarehouseOpenLoadCounts,
    readWarehouseReceivablePOs,
    readWarehouseTodayMaterialIssues,
    readWarehouseTodayReceived,
    readWarehouseTodayShipped,
    type WarehouseLoadingAttention,
} from '@/services/inventory/warehouse-operational-reader';

export type WarehouseMobileSection<T> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; data: null }
    | { status: 'HIDDEN'; data: null };

export interface WarehouseMobileDashboard {
    generatedAt: string;
    loads: WarehouseMobileSection<{
        loading: number;
        pending: number;
    }>;
    receiving: WarehouseMobileSection<{ receivable: number }>;
    materialQueue: WarehouseMobileSection<{ count: number }>;
    todayShipped: WarehouseMobileSection<{ count: number }>;
    todayReceived: WarehouseMobileSection<{ count: number }>;
    todayMaterialIssues: WarehouseMobileSection<{ count: number }>;
    loadingAttention: WarehouseMobileSection<WarehouseLoadingAttention>;
    openOpname: WarehouseMobileSection<{ count: number }>;
    links: {
        outgoing: '/warehouse/mobile/outgoing' | null;
        incoming: '/warehouse/mobile/incoming' | null;
        opname: '/warehouse/mobile/opname' | null;
    };
}

const MOBILE_LOADING_SAMPLE_LIMIT = 3;

function available<T>(data: T): WarehouseMobileSection<T> {
    return { status: 'AVAILABLE', data };
}
function unavailable<T>(): WarehouseMobileSection<T> {
    return { status: 'UNAVAILABLE', data: null };
}
function hidden<T>(): WarehouseMobileSection<T> {
    return { status: 'HIDDEN', data: null };
}
async function settleSection<T>(
    section: string,
    generatedAt: Date,
    permitted: boolean,
    reader: () => Promise<T>,
): Promise<WarehouseMobileSection<T>> {
    if (!permitted) {
        return observeDashboardSection({
            route: 'warehouse-mobile',
            section,
            generatedAt,
            read: async () => hidden<T>(),
            state: dashboardSectionState,
        });
    }
    try {
        return await observeDashboardSection({
            route: 'warehouse-mobile',
            section,
            generatedAt,
            read: async () => available(await reader()),
            state: dashboardSectionState,
        });
    } catch {
        return unavailable();
    }
}

export const getWarehouseMobileDashboard = withTenant(
    async function getWarehouseMobileDashboard() {
        return safeAction(async () => {
            const access = await requireMobilePortalAccess('warehouse');
            const db = getTenantDbFromContext();
            if (!db) {
                throw new BusinessRuleError(
                    'Konteks tenant Warehouse Mobile tidak tersedia.',
                );
            }

            const permissions =
                access.permissions === 'ALL' ? 'ALL' : [...access.permissions];
            const canOpen = (href: string) =>
                canSeeNavHref(href, permissions, '/warehouse');
            const outgoingHref = canOpen('/warehouse/mobile/outgoing')
                ? ('/warehouse/mobile/outgoing' as const)
                : null;
            const incomingHref = canOpen('/warehouse/mobile/incoming')
                ? ('/warehouse/mobile/incoming' as const)
                : null;
            const opnameHref = canOpen('/warehouse/mobile/opname')
                ? ('/warehouse/mobile/opname' as const)
                : null;

            const snapshotAt = new Date();
            const bounds = getWibDayBounds(toBusinessDateString(snapshotAt));
            const [
                loads,
                receiving,
                materialQueue,
                todayShipped,
                todayReceived,
                todayMaterialIssues,
                loadingAttention,
                openOpname,
            ] = await Promise.all([
                settleSection(
                    'loads',
                    snapshotAt,
                    Boolean(outgoingHref),
                    async () => {
                        const result = await readWarehouseOpenLoadCounts(db);
                        return {
                            loading: result.loadingOrders,
                            pending: result.pendingOrders,
                        };
                    },
                ),
                settleSection(
                    'receiving',
                    snapshotAt,
                    Boolean(incomingHref),
                    async () => ({
                        receivable: await readWarehouseReceivablePOs(db),
                    }),
                ),
                settleSection('material-queue', snapshotAt, true, async () => ({
                    count: await readWarehouseMaterialQueue(db),
                })),
                settleSection(
                    'today-shipped',
                    snapshotAt,
                    Boolean(outgoingHref),
                    async () => ({
                        count: await readWarehouseTodayShipped(db, bounds),
                    }),
                ),
                settleSection(
                    'today-received',
                    snapshotAt,
                    Boolean(incomingHref),
                    async () => ({
                        count: await readWarehouseTodayReceived(db, bounds),
                    }),
                ),
                settleSection(
                    'today-material-issues',
                    snapshotAt,
                    true,
                    async () => ({
                        count: await readWarehouseTodayMaterialIssues(
                            db,
                            bounds,
                        ),
                    }),
                ),
                settleSection(
                    'loading-attention',
                    snapshotAt,
                    Boolean(outgoingHref),
                    () =>
                        readWarehouseLoadingAttention(
                            db,
                            MOBILE_LOADING_SAMPLE_LIMIT,
                            (id) => `${outgoingHref}/${id}`,
                        ),
                ),
                settleSection(
                    'open-opname',
                    snapshotAt,
                    Boolean(opnameHref),
                    async () => ({
                        count: await db.stockOpname.count({
                            where: { status: 'OPEN' },
                        }),
                    }),
                ),
            ]);

            return {
                generatedAt: new Date().toISOString(),
                loads,
                receiving,
                materialQueue,
                todayShipped,
                todayReceived,
                todayMaterialIssues,
                loadingAttention,
                openOpname,
                links: {
                    outgoing: outgoingHref,
                    incoming: incomingHref,
                    opname: opnameHref,
                },
            } satisfies WarehouseMobileDashboard;
        });
    },
);
