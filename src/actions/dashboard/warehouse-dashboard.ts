'use server';

import { PurchaseOrderStatus, ProductionStatus } from '@prisma/client';
import { getMyPermissions } from '@/actions/admin/permissions';
import {
    canAccessWorkspace,
    hasWorkspaceResourceAccess,
} from '@/lib/auth/access-policy';
import { getUserRoles } from '@/lib/auth/roles';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    readWarehouseInventoryThresholdSnapshot,
    type WarehouseLowStockDriver,
} from '@/services/inventory/warehouse-dashboard-service';
import {
    readWarehouseDesktopOperational,
    readWarehouseLoadingAttention,
    readWarehouseTodayActivity,
} from '@/services/inventory/warehouse-operational-reader';

export type WarehouseSection<T> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; data: null };

export interface WarehouseAttentionSample<T> {
    total: number;
    returned: number;
    items: T[];
}

export interface WarehouseShiftBoard {
    generatedAt: string;
    health: {
        operational: WarehouseSection<{
            receivablePOs: number;
            openLoadOrders: number;
            materialQueue: number;
        }>;
        inventory: WarehouseSection<{
            lowStock: number;
            suggestedReorder: number;
        }>;
    };
    today: WarehouseSection<{
        goodsReceipts: number;
        deliveriesShipped: number;
        materialIssues: number;
    }>;
    attention: WarehouseSection<{
        loadingUnverified: WarehouseAttentionSample<{
            id: string;
            number: string;
            customerName?: string;
            deliveryDate: string;
        }>;
        partialPOs: WarehouseAttentionSample<{
            id: string;
            orderNumber: string;
            supplierName: string;
            expectedDate: string | null;
        }>;
        waitingMaterial: WarehouseAttentionSample<{
            id: string;
            orderNumber: string;
            createdAt: string;
        }>;
    }>;
    drivers: WarehouseSection<{
        lowStock: WarehouseLowStockDriver[];
    }>;
}

const ATTENTION_SAMPLE_LIMIT = 5;

async function requireWarehouseRootRead() {
    const session = await requireAuth();
    const permissionResult = await getMyPermissions();
    const sessionResources =
        (session.user as { allowedResources?: string[] }).allowedResources ??
        [];
    const resources =
        permissionResult.success && permissionResult.data
            ? permissionResult.data
            : sessionResources;
    const userForPolicy = {
        ...session.user,
        roles: getUserRoles(session.user),
        allowedResources: resources === 'ALL' ? sessionResources : resources,
    };
    const canOpenRoot =
        canAccessWorkspace(userForPolicy, 'warehouse', '/warehouse') &&
        hasWorkspaceResourceAccess(resources, 'warehouse') &&
        (resources === 'ALL' || resources.includes('/warehouse'));

    if (!canOpenRoot) {
        throw new AuthorizationError(
            'Unauthorized: Akses root Warehouse tidak tersedia.',
        );
    }

    return session;
}

function available<T>(data: T): WarehouseSection<T> {
    return { status: 'AVAILABLE', data };
}

function unavailable<T>(): WarehouseSection<T> {
    return { status: 'UNAVAILABLE', data: null };
}

async function settleSection<T>(
    reader: () => Promise<T>,
): Promise<WarehouseSection<T>> {
    try {
        return available(await reader());
    } catch {
        return unavailable();
    }
}

async function readOperationalHealth() {
    return readWarehouseDesktopOperational(prisma);
}

async function readTodayActivity() {
    const bounds = getWibDayBounds(toBusinessDateString(new Date()));
    return readWarehouseTodayActivity(prisma, bounds);
}

async function readAttention() {
    const partialWhere = {
        status: PurchaseOrderStatus.PARTIAL_RECEIVED,
    };
    const waitingWhere = {
        status: ProductionStatus.WAITING_MATERIAL,
    };

    const [
        loadingUnverified,
        partialTotal,
        partialPOs,
        waitingTotal,
        waitingMaterial,
    ] = await Promise.all([
        readWarehouseLoadingAttention(prisma, ATTENTION_SAMPLE_LIMIT),
        prisma.purchaseOrder.count({ where: partialWhere }),
        prisma.purchaseOrder.findMany({
            where: partialWhere,
            select: {
                id: true,
                orderNumber: true,
                expectedDate: true,
                supplier: { select: { name: true } },
            },
            // Missing expected dates are explicit and sort after dated POs.
            orderBy: [
                { expectedDate: { sort: 'asc', nulls: 'last' } },
                { id: 'asc' },
            ],
            take: ATTENTION_SAMPLE_LIMIT,
        }),
        prisma.productionOrder.count({ where: waitingWhere }),
        prisma.productionOrder.findMany({
            where: waitingWhere,
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: ATTENTION_SAMPLE_LIMIT,
        }),
    ]);

    return {
        loadingUnverified,
        partialPOs: {
            total: partialTotal,
            returned: partialPOs.length,
            items: partialPOs.map((purchaseOrder) => ({
                id: purchaseOrder.id,
                orderNumber: purchaseOrder.orderNumber,
                supplierName: purchaseOrder.supplier.name,
                expectedDate: purchaseOrder.expectedDate?.toISOString() ?? null,
            })),
        },
        waitingMaterial: {
            total: waitingTotal,
            returned: waitingMaterial.length,
            items: waitingMaterial.map((productionOrder) => ({
                id: productionOrder.id,
                orderNumber: productionOrder.orderNumber,
                createdAt: productionOrder.createdAt.toISOString(),
            })),
        },
    };
}

export const getWarehouseShiftBoard = withTenant(
    async function getWarehouseShiftBoard() {
        return safeAction(async () => {
            // Mirror the Warehouse layout's role/resource policy. A direct
            // action call must neither bypass explicit resources nor reject a
            // cross-role user who has a current `/warehouse` grant.
            await requireWarehouseRootRead();

            const [operational, inventory, today, attention] =
                await Promise.all([
                    settleSection(readOperationalHealth),
                    settleSection(readWarehouseInventoryThresholdSnapshot),
                    settleSection(readTodayActivity),
                    settleSection(readAttention),
                ]);

            return {
                generatedAt: new Date().toISOString(),
                health: {
                    operational,
                    inventory:
                        inventory.status === 'AVAILABLE'
                            ? available({
                                  lowStock: inventory.data.lowStockCount,
                                  suggestedReorder: inventory.data.reorderCount,
                              })
                            : unavailable<{
                                  lowStock: number;
                                  suggestedReorder: number;
                              }>(),
                },
                today,
                attention,
                drivers:
                    inventory.status === 'AVAILABLE'
                        ? available({
                              lowStock: inventory.data.lowStockDrivers,
                          })
                        : unavailable<{
                              lowStock: WarehouseLowStockDriver[];
                          }>(),
            } satisfies WarehouseShiftBoard;
        });
    },
);
