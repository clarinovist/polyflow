import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: {
        purchaseOrder: { count: vi.fn(), findMany: vi.fn() },
        deliveryOrder: { count: vi.fn(), findMany: vi.fn() },
        productionOrder: { count: vi.fn(), findMany: vi.fn() },
        goodsReceipt: { count: vi.fn() },
        stockMovement: { count: vi.fn() },
    },
    guard: vi.fn(),
    permissions: vi.fn(),
    workspace: vi.fn(),
    resource: vi.fn(),
    inventory: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.guard,
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: mocks.permissions,
}));
vi.mock('@/lib/auth/access-policy', () => ({
    canAccessWorkspace: mocks.workspace,
    hasWorkspaceResourceAccess: mocks.resource,
}));
vi.mock('@/lib/auth/roles', () => ({
    getUserRoles: (user: { roles?: string[] }) => user.roles ?? [],
}));
vi.mock('@/services/inventory/warehouse-dashboard-service', () => ({
    readWarehouseInventoryThresholdSnapshot: mocks.inventory,
}));
vi.mock('@/lib/errors/errors', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));

import {
    DeliveryStatus,
    ProductionStatus,
    PurchaseOrderStatus,
} from '@prisma/client';
import { getWarehouseShiftBoard } from '../warehouse-dashboard';

const deliveryRows = Array.from({ length: 5 }, (_, index) => ({
    id: `do-${index + 1}`,
    orderNumber: `SJ-00${index + 1}`,
    deliveryDate: new Date(`2026-10-0${index + 1}T08:00:00.000Z`),
    salesOrder: { customer: { name: `Pelanggan ${index + 1}` } },
}));

const partialRows = [
    {
        id: 'po-dated',
        orderNumber: 'PO-001',
        expectedDate: new Date('2026-10-01T08:00:00.000Z'),
        supplier: { name: 'Pemasok A' },
    },
    {
        id: 'po-null',
        orderNumber: 'PO-002',
        expectedDate: null,
        supplier: { name: 'Pemasok B' },
    },
];

const waitingRows = [
    {
        id: 'spk-1',
        orderNumber: 'SPK-001',
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
    },
];

function setupHappyPath() {
    mocks.guard.mockResolvedValue({
        user: { id: 'u1', roles: ['WAREHOUSE'] },
    });
    mocks.permissions.mockResolvedValue({
        success: true,
        data: ['/warehouse'],
    });
    mocks.workspace.mockReturnValue(true);
    mocks.resource.mockReturnValue(true);
    mocks.prisma.purchaseOrder.count.mockImplementation(
        async (args?: { where?: { status?: string | { in?: string[] } } }) =>
            typeof args?.where?.status === 'object' ? 3 : 7,
    );
    mocks.prisma.deliveryOrder.count.mockImplementation(
        async (args?: { where?: { status?: string | { in?: string[] } } }) =>
            typeof args?.where?.status === 'object' ? 2 : 8,
    );
    mocks.prisma.productionOrder.count.mockImplementation(
        async (args?: { where?: { status?: string | { in?: string[] } } }) =>
            typeof args?.where?.status === 'object' ? 4 : 6,
    );
    mocks.prisma.goodsReceipt.count.mockResolvedValue(10);
    mocks.prisma.stockMovement.count.mockResolvedValue(5);
    mocks.prisma.deliveryOrder.findMany.mockResolvedValue(deliveryRows);
    mocks.prisma.purchaseOrder.findMany.mockResolvedValue(partialRows);
    mocks.prisma.productionOrder.findMany.mockResolvedValue(waitingRows);
    mocks.inventory.mockResolvedValue({
        lowStockCount: 1,
        reorderCount: 2,
        lowStockDrivers: [
            {
                id: 'variant-1',
                name: 'Resin A',
                skuCode: 'RM-A',
                unit: 'KG',
                eligibleQuantity: 2,
                threshold: 10,
                shortageRatio: 0.8,
            },
        ],
    });
}

describe('getWarehouseShiftBoard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupHappyPath();
    });

    it.each(['ADMIN', 'WAREHOUSE', 'PRODUCTION', 'PLANNING'])(
        'allows the tracked Warehouse root role %s with a root resource grant',
        async (role) => {
            mocks.guard.mockResolvedValue({
                user: { id: 'u1', roles: [role], allowedResources: [] },
            });

            const result = await getWarehouseShiftBoard();

            expect(result.success).toBe(true);
            expect(mocks.guard).toHaveBeenCalledTimes(1);
            expect(mocks.workspace).toHaveBeenCalledWith(
                expect.objectContaining({ roles: [role] }),
                'warehouse',
                '/warehouse',
            );
            expect(mocks.resource).toHaveBeenCalledWith(
                ['/warehouse'],
                'warehouse',
            );
        },
    );

    it('allows a cross-role user when the workspace policy and explicit root grant allow it', async () => {
        mocks.guard.mockResolvedValue({
            user: { id: 'sales-user', roles: ['SALES'], allowedResources: [] },
        });

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        expect(mocks.workspace).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['SALES'] }),
            'warehouse',
            '/warehouse',
        );
    });

    it('fails the whole action for a directly denied authenticated role before reading data', async () => {
        mocks.workspace.mockReturnValue(false);

        const result = await getWarehouseShiftBoard();

        expect(result).toEqual({
            success: false,
            error: 'Unauthorized: Akses root Warehouse tidak tersedia.',
        });
        expect(mocks.inventory).not.toHaveBeenCalled();
        expect(mocks.prisma.goodsReceipt.count).not.toHaveBeenCalled();
        expect(mocks.prisma.purchaseOrder.count).not.toHaveBeenCalled();
    });

    it('fails closed when only a nested Warehouse resource is granted', async () => {
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/warehouse/inventory'],
        });

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(false);
        expect(mocks.inventory).not.toHaveBeenCalled();
    });

    it('uses the session resource snapshot when the fresh permission read fails', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'u1',
                roles: ['WAREHOUSE'],
                allowedResources: ['/warehouse'],
            },
        });
        mocks.permissions.mockResolvedValue({
            success: false,
            error: 'permission read failed',
        });

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        expect(mocks.resource).toHaveBeenCalledWith(
            ['/warehouse'],
            'warehouse',
        );
    });

    it('returns available zeroes, server freshness, and the canonical one-read inventory snapshot', async () => {
        mocks.prisma.purchaseOrder.count.mockResolvedValue(0);
        mocks.prisma.deliveryOrder.count.mockResolvedValue(0);
        mocks.prisma.productionOrder.count.mockResolvedValue(0);
        mocks.prisma.goodsReceipt.count.mockResolvedValue(0);
        mocks.prisma.stockMovement.count.mockResolvedValue(0);
        mocks.prisma.deliveryOrder.findMany.mockResolvedValue([]);
        mocks.prisma.purchaseOrder.findMany.mockResolvedValue([]);
        mocks.prisma.productionOrder.findMany.mockResolvedValue([]);
        mocks.inventory.mockResolvedValue({
            lowStockCount: 0,
            reorderCount: 0,
            lowStockDrivers: [],
        });

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(new Date(result.data.generatedAt).toString()).not.toBe(
            'Invalid Date',
        );
        expect(result.data.health).toEqual({
            operational: {
                status: 'AVAILABLE',
                data: {
                    receivablePOs: 0,
                    openLoadOrders: 0,
                    materialQueue: 0,
                },
            },
            inventory: {
                status: 'AVAILABLE',
                data: { lowStock: 0, suggestedReorder: 0 },
            },
        });
        expect(result.data.today).toEqual({
            status: 'AVAILABLE',
            data: {
                goodsReceipts: 0,
                deliveriesShipped: 0,
                materialIssues: 0,
            },
        });
        expect(result.data.attention).toEqual({
            status: 'AVAILABLE',
            data: {
                loadingUnverified: { total: 0, returned: 0, items: [] },
                partialPOs: { total: 0, returned: 0, items: [] },
                waitingMaterial: { total: 0, returned: 0, items: [] },
            },
        });
        expect(result.data.drivers).toEqual({
            status: 'AVAILABLE',
            data: { lowStock: [] },
        });
        expect(mocks.inventory).toHaveBeenCalledTimes(1);
    });

    it('preserves successful sections when one data source fails without fabricating inventory zeroes', async () => {
        mocks.inventory.mockRejectedValue(new Error('inventory unavailable'));

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.health.operational).toMatchObject({
            status: 'AVAILABLE',
            data: {
                receivablePOs: 3,
                openLoadOrders: 2,
                materialQueue: 4,
            },
        });
        expect(result.data.health.inventory).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.data.drivers).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.data.today.status).toBe('AVAILABLE');
        expect(result.data.attention.status).toBe('AVAILABLE');
    });

    it('marks only the attention section unavailable when one backlog read fails', async () => {
        mocks.prisma.purchaseOrder.findMany.mockRejectedValue(
            new Error('attention unavailable'),
        );

        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.attention).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.data.health.operational.status).toBe('AVAILABLE');
        expect(result.data.health.inventory.status).toBe('AVAILABLE');
        expect(result.data.today.status).toBe('AVAILABLE');
        expect(result.data.drivers.status).toBe('AVAILABLE');
    });

    it('uses exact total counts with bounded, stable timestamp-plus-id samples and explicit null dates', async () => {
        const result = await getWarehouseShiftBoard();

        expect(result.success).toBe(true);
        if (
            !result.success ||
            !result.data ||
            result.data.attention.status !== 'AVAILABLE'
        )
            return;
        expect(result.data.attention.data.loadingUnverified).toMatchObject({
            total: 8,
            returned: 5,
        });
        expect(result.data.attention.data.partialPOs.items[1]).toMatchObject({
            id: 'po-null',
            expectedDate: null,
        });
        expect(mocks.prisma.deliveryOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
            }),
        );
        expect(mocks.prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [
                    { expectedDate: { sort: 'asc', nulls: 'last' } },
                    { id: 'asc' },
                ],
            }),
        );
        expect(mocks.prisma.productionOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 5,
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
        );
    });

    it('preserves operational and WIB today predicates', async () => {
        await getWarehouseShiftBoard();

        expect(mocks.prisma.purchaseOrder.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        PurchaseOrderStatus.SENT,
                        PurchaseOrderStatus.PARTIAL_RECEIVED,
                    ],
                },
            },
        });
        expect(mocks.prisma.deliveryOrder.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                },
            },
        });
        expect(mocks.prisma.productionOrder.count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [
                        ProductionStatus.RELEASED,
                        ProductionStatus.IN_PROGRESS,
                        ProductionStatus.WAITING_MATERIAL,
                    ],
                },
            },
        });
        expect(mocks.prisma.deliveryOrder.count).toHaveBeenCalledWith({
            where: {
                stockCommittedAt: {
                    gte: expect.any(Date),
                    lte: expect.any(Date),
                },
            },
        });
        expect(mocks.prisma.goodsReceipt.count).toHaveBeenCalledWith({
            where: {
                isMaklon: false,
                receivedDate: {
                    gte: expect.any(Date),
                    lte: expect.any(Date),
                },
            },
        });
        expect(mocks.prisma.stockMovement.count).toHaveBeenCalledWith({
            where: {
                type: 'OUT',
                productionOrderId: { not: null },
                createdAt: {
                    gte: expect.any(Date),
                    lte: expect.any(Date),
                },
            },
        });
    });
});
