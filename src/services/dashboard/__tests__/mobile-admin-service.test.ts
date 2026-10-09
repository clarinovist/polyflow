import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
    $transaction: vi.fn(),
    productionIssue: { count: vi.fn() },
    productionOrder: { count: vi.fn() },
    maintenanceRequest: { count: vi.fn() },
    productVariant: { findMany: vi.fn() },
    purchaseRequest: { count: vi.fn() },
    purchaseOrder: { count: vi.fn() },
    invoice: { count: vi.fn() },
    purchaseInvoice: {
        count: vi.fn(),
        fields: { paidAmount: Symbol('paidAmount') },
    },
    journalEntry: { count: vi.fn() },
    bankReconciliation: { count: vi.fn() },
    leaveRequest: { count: vi.fn() },
};

vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => db }));

import { MobileAdminService } from '../mobile-admin-service';

const portals = [
    { id: 'admin', title: 'Admin', path: '/mobile/admin', status: 'BETA' },
    { id: 'finance', title: 'Finance', path: '/finance/mobile', status: 'ACTIVE' },
    { id: 'warehouse', title: 'Gudang', path: '/warehouse/mobile', status: 'ACTIVE' },
] as never;
const dependencies = [
    { moduleKey: 'PRODUCTION', permissionRoots: ['/production'], match: 'ANY' },
    { moduleKey: 'INVENTORY', permissionRoots: ['/warehouse/inventory'], match: 'ANY' },
    { moduleKey: 'PURCHASING', permissionRoots: ['/purchasing'], match: 'ANY' },
    { moduleKey: 'FINANCE', permissionRoots: ['/finance'], match: 'ANY' },
    { moduleKey: 'HRD', permissionRoots: ['/hrd'], match: 'ANY' },
] as never;

beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(
        (operation: (transaction: typeof db) => unknown) => operation(db),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T02:00:00.000Z'));
    db.productionIssue.count.mockResolvedValue(2);
    db.productionOrder.count.mockResolvedValue(3);
    db.maintenanceRequest.count.mockResolvedValue(4);
    db.productVariant.findMany.mockResolvedValue([
        {
            id: 'variant-low',
            minStockAlert: 10,
            inventories: [
                { quantity: 2, location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                { quantity: 100, location: { locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' } },
            ],
        },
    ]);
    db.purchaseRequest.count.mockResolvedValue(5);
    db.purchaseOrder.count.mockResolvedValue(6);
    db.invoice.count.mockResolvedValue(7);
    db.purchaseInvoice.count.mockResolvedValue(8);
    db.journalEntry.count.mockResolvedValue(9);
    db.bankReconciliation.count.mockResolvedValue(10);
    db.leaveRequest.count.mockResolvedValue(11);
});

describe('MobileAdminService', () => {
    it('queries only active and authorized modules and returns a minimum bounded DTO', async () => {
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'PRODUCTION', 'INVENTORY', 'FINANCE'],
            permissions: ['/production', '/finance'],
            availablePortals: portals,
            dataDependencies: dependencies,
        }, db as never);

        expect(db.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: 'RepeatableRead' },
        );
        expect(db.productionIssue.count).toHaveBeenCalledOnce();
        expect(db.invoice.count).toHaveBeenCalledOnce();
        expect(db.productVariant.findMany).not.toHaveBeenCalled();
        expect(db.purchaseRequest.count).not.toHaveBeenCalled();
        expect(db.leaveRequest.count).not.toHaveBeenCalled();
        expect(result.modules.map((module) => module.key)).toEqual(['PRODUCTION', 'FINANCE']);
        expect(result.unavailableModules).toEqual(['INVENTORY']);
        expect(db.invoice.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                salesOrder: expect.objectContaining({
                    customerId: { not: null },
                    NOT: expect.any(Array),
                }),
            }),
        });
        expect(result.highlights).toHaveLength(4);
        expect(result.tasks.length).toBeLessThanOrEqual(10);
        expect(result.counts).toEqual({ total: 7, returned: 7 });
        expect(result.shortcuts).toEqual([
            { id: 'finance', label: 'Finance', href: '/finance/mobile' },
            { id: 'warehouse', label: 'Gudang', href: '/warehouse/mobile' },
        ]);
        expect(JSON.stringify(result)).not.toMatch(/amount|employee|phone|email|account|document/i);
    });

    it('uses the canonical internal RM/FG scope for low-stock', async () => {
        db.productVariant.findMany.mockResolvedValue([
            {
                id: 'variant-low',
                minStockAlert: 10,
                inventories: [
                    { quantity: 2, location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                    { quantity: 100, location: { locationType: 'INTERNAL', locationPurpose: 'WIP' } },
                    { quantity: 100, location: { locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' } },
                ],
            },
        ]);

        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'INVENTORY'],
            permissions: 'ALL',
            availablePortals: portals,
            dataDependencies: dependencies,
        }, db as never);

        expect(
            result.modules.find((module) => module.key === 'INVENTORY'),
        ).toMatchObject({ state: 'AVAILABLE', exceptionCount: 1 });
    });

    it('uses only the supplied tenant client', async () => {
        const otherTenant = { ...db, invoice: { count: vi.fn() } };
        await MobileAdminService.getOverview({
            activeModules: ['CORE', 'FINANCE'],
            permissions: 'ALL',
            availablePortals: portals,
            dataDependencies: dependencies,
        }, db as never);
        expect(db.invoice.count).toHaveBeenCalled();
        expect(otherTenant.invoice.count).not.toHaveBeenCalled();
    });

    it('does not query an entitled module without its read permission', async () => {
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'FINANCE'],
            permissions: ['/production'],
            availablePortals: portals,
            dataDependencies: dependencies,
        }, db as never);
        expect(db.invoice.count).not.toHaveBeenCalled();
        expect(result.modules).toEqual([]);
        expect(result.unavailableModules).toEqual(['FINANCE']);
    });

    it('does not query any disabled module', async () => {
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE'], permissions: 'ALL', availablePortals: portals, dataDependencies: dependencies,
        }, db as never);
        expect(result.modules).toEqual([]);
        expect(result.tasks).toEqual([]);
        for (const delegate of [db.productionIssue.count, db.productVariant.findMany, db.purchaseRequest.count, db.invoice.count, db.leaveRequest.count]) {
            expect(delegate).not.toHaveBeenCalled();
        }
    });

    it('marks a failed active module unavailable instead of reporting a false zero', async () => {
        db.invoice.count.mockRejectedValueOnce(new Error('synthetic unavailable'));
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'PRODUCTION', 'FINANCE'], permissions: 'ALL', availablePortals: portals, dataDependencies: dependencies,
        }, db as never);
        expect(result.unavailableModules).toEqual(['FINANCE']);
        expect(result.modules.find((module) => module.key === 'FINANCE')).toEqual({
            key: 'FINANCE', label: 'Finance', state: 'UNAVAILABLE', exceptionCount: null, approvalCount: null,
        });
        expect(result.modules.find((module) => module.key === 'PRODUCTION')?.exceptionCount).toBe(5);
    });

    it('sorts deterministically, uses id as tie-breaker, and separates total from ten-item sample', async () => {
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'PRODUCTION', 'INVENTORY', 'PURCHASING', 'FINANCE', 'HRD'],
            permissions: 'ALL', availablePortals: portals, dataDependencies: dependencies,
        }, db as never);
        expect(result.counts).toEqual({ total: 12, returned: 10 });
        expect(result.tasks).toHaveLength(10);
        const ids = result.tasks.map((item) => item.id);
        expect(ids).toEqual([...ids].sort((left, right) => {
            const byPriority = { URGENT: 0, HIGH: 1, NORMAL: 2 } as const;
            const a = result.tasks.find((item) => item.id === left)!;
            const b = result.tasks.find((item) => item.id === right)!;
            return byPriority[a.priority] - byPriority[b.priority] || b.count - a.count || left.localeCompare(right);
        }));
    });

    it('removes task links when their destination portal did not pass the resolver', async () => {
        const result = await MobileAdminService.getOverview({
            activeModules: ['CORE', 'PRODUCTION'], permissions: 'ALL', availablePortals: [portals[0]], dataDependencies: dependencies,
        }, db as never);
        expect(result.tasks.every((item) => item.href === null)).toBe(true);
        expect(result.shortcuts).toEqual([]);
    });
});
