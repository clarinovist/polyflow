import type { ModuleKey } from '@/lib/modules/module-registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const snapshotAt = new Date('2026-10-07T02:00:00.000Z');
const portals = [
    { id: 'admin', title: 'Admin', path: '/mobile/admin', status: 'BETA' },
    {
        id: 'production',
        title: 'Production',
        path: '/production/mobile',
        status: 'ACTIVE',
    },
    {
        id: 'finance',
        title: 'Finance',
        path: '/finance/mobile',
        status: 'ACTIVE',
    },
    {
        id: 'warehouse',
        title: 'Gudang',
        path: '/warehouse/mobile',
        status: 'ACTIVE',
    },
    {
        id: 'hrd-supervisor',
        title: 'HRD planned',
        path: '/hrd/mobile',
        status: 'PLANNED',
    },
] as never;
const dependencies = [
    { moduleKey: 'PRODUCTION', permissionRoots: ['/production'], match: 'ANY' },
    {
        moduleKey: 'INVENTORY',
        permissionRoots: ['/warehouse/inventory'],
        match: 'ANY',
    },
    { moduleKey: 'PURCHASING', permissionRoots: ['/purchasing'], match: 'ANY' },
    { moduleKey: 'FINANCE', permissionRoots: ['/finance'], match: 'ANY' },
    { moduleKey: 'HRD', permissionRoots: ['/hrd'], match: 'ANY' },
] as never;

function context(
    activeModules: readonly ModuleKey[],
    permissions: readonly string[] | 'ALL' = 'ALL',
) {
    return {
        activeModules,
        permissions,
        availablePortals: portals,
        dataDependencies: dependencies,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(snapshotAt);
    db.$transaction.mockImplementation(
        (operation: (transaction: typeof db) => unknown) => operation(db),
    );
    db.productionIssue.count.mockResolvedValue(2);
    db.productionOrder.count.mockResolvedValue(3);
    db.maintenanceRequest.count.mockResolvedValue(4);
    db.productVariant.findMany.mockResolvedValue([
        {
            id: 'variant-low',
            name: 'Synthetic variant',
            skuCode: 'SYN-1',
            primaryUnit: 'KG',
            minStockAlert: 10,
            reorderPoint: 5,
            inventories: [
                {
                    quantity: 2,
                    location: {
                        locationType: 'INTERNAL',
                        locationPurpose: 'RAW_MATERIAL',
                    },
                },
                {
                    quantity: 100,
                    location: {
                        locationType: 'CUSTOMER_OWNED',
                        locationPurpose: 'RAW_MATERIAL',
                    },
                },
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

afterEach(() => vi.useRealTimers());

describe('MobileAdminService', () => {
    it('uses canonical owners, one shared snapshot, and one RepeatableRead transaction per queryable module', async () => {
        const result = await MobileAdminService.getOverview(
            context([
                'CORE',
                'PRODUCTION',
                'INVENTORY',
                'PURCHASING',
                'FINANCE',
                'HRD',
            ]),
            db as never,
        );

        expect(result.generatedAt).toBe(snapshotAt.toISOString());
        expect(db.$transaction).toHaveBeenCalledTimes(5);
        for (const call of db.$transaction.mock.calls) {
            expect(call[1]).toEqual({ isolationLevel: 'RepeatableRead' });
        }
        expect(db.productionIssue.count).toHaveBeenCalledWith({
            where: { status: 'OPEN' },
        });
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                status: 'IN_PROGRESS',
                plannedEndDate: { lt: snapshotAt },
            },
        });
        expect(db.maintenanceRequest.count).toHaveBeenCalledWith({
            where: { status: 'PENDING' },
        });
        expect(db.productVariant.findMany).toHaveBeenCalledOnce();
        expect(db.productVariant.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    archivedAt: null,
                    OR: [
                        { minStockAlert: { gt: 0 } },
                        { reorderPoint: { gt: 0 } },
                    ],
                },
            }),
        );
        expect(db.purchaseRequest.count).toHaveBeenCalledWith({
            where: { status: 'OPEN' },
        });
        expect(db.purchaseOrder.count).toHaveBeenCalledWith({
            where: { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } },
        });
        expect(db.purchaseInvoice.count).toHaveBeenCalledTimes(2);
        for (const [{ where }] of db.purchaseInvoice.count.mock.calls) {
            expect(where).toEqual({
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                dueDate: { lt: new Date('2026-10-06T17:00:00.000Z') },
                totalAmount: {
                    gt: db.purchaseInvoice.fields.paidAmount,
                },
            });
        }
        expect(db.invoice.count).toHaveBeenCalledWith({
            where: {
                AND: [
                    {
                        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                        remainingAmount: { gt: 0 },
                    },
                ],
                dueDate: { lt: new Date('2026-10-06T17:00:00.000Z') },
                salesOrder: {
                    customerId: { not: null },
                    AND: [
                        { NOT: { orderNumber: { startsWith: 'SO-OPEN-' } } },
                        { NOT: { orderNumber: { startsWith: 'OB-AR-' } } },
                        {
                            OR: [
                                { notes: null },
                                {
                                    NOT: {
                                        notes: {
                                            startsWith: 'Opening Balance Entry',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            OR: [
                                { notes: null },
                                {
                                    NOT: {
                                        notes: {
                                            startsWith: 'Sheet Penjualan Jun:',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        });
        expect(db.leaveRequest.count).toHaveBeenCalledWith({
            where: { status: 'PENDING' },
        });
        expect(result.modules.map((module) => module.key)).toEqual([
            'PRODUCTION',
            'INVENTORY',
            'PURCHASING',
            'FINANCE',
            'HRD',
        ]);
    });

    it('queries only authorized modules and lists entitled unauthorized modules as UNAVAILABLE in canonical order', async () => {
        const result = await MobileAdminService.getOverview(
            context(
                ['CORE', 'PRODUCTION', 'INVENTORY', 'FINANCE'],
                ['/production', '/finance'],
            ),
            db as never,
        );

        expect(db.$transaction).toHaveBeenCalledTimes(2);
        expect(db.productionIssue.count).toHaveBeenCalledOnce();
        expect(db.invoice.count).toHaveBeenCalledOnce();
        expect(db.productVariant.findMany).not.toHaveBeenCalled();
        expect(result.modules).toEqual([
            {
                key: 'PRODUCTION',
                label: 'Produksi',
                state: 'AVAILABLE',
                exceptionCount: 5,
                approvalCount: 4,
            },
            {
                key: 'INVENTORY',
                label: 'Stok',
                state: 'UNAVAILABLE',
                exceptionCount: null,
                approvalCount: null,
            },
            {
                key: 'FINANCE',
                label: 'Finance',
                state: 'AVAILABLE',
                exceptionCount: 34,
                approvalCount: 9,
            },
        ]);
        expect(result.unavailableModules).toEqual(['INVENTORY']);
        expect(result.counts).toEqual({ total: 7, returned: 7 });
    });

    it('does not query an entitled module without its read permission', async () => {
        const result = await MobileAdminService.getOverview(
            context(['CORE', 'FINANCE'], ['/production']),
            db as never,
        );

        expect(db.$transaction).not.toHaveBeenCalled();
        expect(db.invoice.count).not.toHaveBeenCalled();
        expect(result.modules).toEqual([
            {
                key: 'FINANCE',
                label: 'Finance',
                state: 'UNAVAILABLE',
                exceptionCount: null,
                approvalCount: null,
            },
        ]);
        expect(result.unavailableModules).toEqual(['FINANCE']);
        expect(result.tasks).toEqual([]);
        expect(result.highlights).toEqual([
            {
                key: 'exceptions',
                label: 'Total pengecualian',
                value: 0,
                severity: 'INFO',
            },
            {
                key: 'approvals',
                label: 'Menunggu persetujuan',
                value: 0,
                severity: 'INFO',
            },
            {
                key: 'tasks',
                label: 'Total kelompok tugas',
                value: 0,
                severity: 'INFO',
            },
            {
                key: 'modules',
                label: 'Modul tersedia',
                value: '0/1',
                severity: 'WARNING',
            },
        ]);
    });

    it('keeps disabled, non-entitled, and unrequested modules absent and unqueried', async () => {
        const result = await MobileAdminService.getModuleSections(
            {
                ...context(['CORE', 'PRODUCTION', 'FINANCE']),
                onlyModules: ['FINANCE'],
            },
            db as never,
        );

        expect(result.modules.map((module) => module.key)).toEqual(['FINANCE']);
        expect(db.$transaction).toHaveBeenCalledOnce();
        expect(db.invoice.count).toHaveBeenCalledOnce();
        expect(db.productionIssue.count).not.toHaveBeenCalled();
        expect(db.productVariant.findMany).not.toHaveBeenCalled();
        expect(db.purchaseRequest.count).not.toHaveBeenCalled();
        expect(db.leaveRequest.count).not.toHaveBeenCalled();
    });

    it('keeps a failed module visible but excludes it from tasks, totals, and highlights', async () => {
        db.invoice.count.mockRejectedValueOnce(
            new Error('synthetic unavailable'),
        );
        const result = await MobileAdminService.getOverview(
            context(['CORE', 'PRODUCTION', 'FINANCE']),
            db as never,
        );

        expect(result.unavailableModules).toEqual(['FINANCE']);
        expect(result.modules.find((module) => module.key === 'FINANCE')).toEqual({
            key: 'FINANCE',
            label: 'Finance',
            state: 'UNAVAILABLE',
            exceptionCount: null,
            approvalCount: null,
        });
        expect(result.tasks.every((item) => item.module === 'PRODUCTION')).toBe(
            true,
        );
        expect(result.counts).toEqual({ total: 3, returned: 3 });
        expect(result.highlights).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'exceptions', value: 5 }),
                expect.objectContaining({ key: 'approvals', value: 4 }),
                expect.objectContaining({ key: 'tasks', value: 3 }),
                expect.objectContaining({ key: 'modules', value: '1/2' }),
            ]),
        );
    });

    it('distinguishes available zero from unavailable', async () => {
        db.leaveRequest.count.mockResolvedValue(0);
        const available = await MobileAdminService.getOverview(
            context(['CORE', 'HRD']),
            db as never,
        );

        expect(available.modules).toEqual([
            {
                key: 'HRD',
                label: 'HRD',
                state: 'AVAILABLE',
                exceptionCount: 0,
                approvalCount: 0,
            },
        ]);
        expect(available.tasks).toEqual([]);
        expect(available.unavailableModules).toEqual([]);

        db.leaveRequest.count.mockRejectedValueOnce(new Error('unavailable'));
        const unavailable = await MobileAdminService.getOverview(
            context(['CORE', 'HRD']),
            db as never,
        );
        expect(unavailable.modules[0]).toMatchObject({
            state: 'UNAVAILABLE',
            exceptionCount: null,
            approvalCount: null,
        });
    });

    it('sorts deterministically and reports total before the ten-item sample', async () => {
        const result = await MobileAdminService.getOverview(
            context([
                'CORE',
                'PRODUCTION',
                'INVENTORY',
                'PURCHASING',
                'FINANCE',
                'HRD',
            ]),
            db as never,
        );

        expect(result.counts).toEqual({ total: 12, returned: 10 });
        expect(result.tasks).toHaveLength(10);
        expect(result.tasks.map((item) => item.id)).toEqual([
            'finance:overdue-ap',
            'purchasing:overdue-invoices',
            'finance:overdue-ar',
            'production:open-issues',
            'inventory:low-stock',
            'hrd:pending-leave',
            'finance:open-reconciliation',
            'finance:draft-journals',
            'purchasing:waiting-receipt',
            'purchasing:open-requests',
        ]);
    });

    it('serializes only count/status/link DTO fields without owner rows or nominal and identity data', async () => {
        const result = await MobileAdminService.getOverview(
            context([
                'CORE',
                'PRODUCTION',
                'INVENTORY',
                'PURCHASING',
                'FINANCE',
                'HRD',
            ]),
            db as never,
        );
        const serialized = JSON.stringify(result);

        for (const forbidden of [
            'Synthetic variant',
            'SYN-1',
            'eligibleQuantity',
            'threshold',
            'shortageRatio',
            'plannedQuantity',
            'actualQuantity',
            'operatorName',
            'employeeId',
            'employeeName',
            'payroll',
            'loanPortfolio',
            'remainingAmount',
            'totalAmount',
            'paidAmount',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('keeps only exact or subpath links from resolver-approved non-Admin portals', async () => {
        const result = await MobileAdminService.getOverview(
            context(['CORE', 'PRODUCTION', 'FINANCE']),
            db as never,
        );

        expect(
            result.tasks.find(
                (item) => item.id === 'production:open-issues',
            )?.href,
        ).toBe('/production/mobile');
        expect(
            result.tasks.find(
                (item) => item.id === 'production:maintenance-approval',
            )?.href,
        ).toBe('/production/mobile/maintenance');
        expect(
            result.tasks.find((item) => item.id === 'finance:overdue-ar')?.href,
        ).toBe('/finance/mobile');
        expect(
            result.tasks.find(
                (item) => item.id === 'finance:draft-journals',
            )?.href,
        ).toBeNull();
        expect(
            result.shortcuts.every(
                (item) =>
                    item.id !== 'admin' && item.id !== 'hrd-supervisor',
            ),
        ).toBe(true);

        const withoutProductionPortal = await MobileAdminService.getOverview(
            {
                ...context(['CORE', 'PRODUCTION']),
                availablePortals: [portals[0]],
            },
            db as never,
        );
        expect(
            withoutProductionPortal.tasks.every((item) => item.href === null),
        ).toBe(true);
    });
});
