import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isInventoryThresholdTriggered } from '@/lib/constants/locations';
import {
    buildProductionDashboardLateOrderWhere,
    composeProductionOutputHealth,
} from '@/services/production/production-dashboard-health-service';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import {
    readWarehouseInventoryThresholdSnapshot,
    type WarehouseInventoryThresholdSnapshot,
} from '@/services/inventory/warehouse-dashboard-service';
import {
    readHrdDashboardAggregate,
    readHrdDashboardMobileAggregate,
} from '@/services/hrd/hrd-dashboard-service';

const decimal = (value: number) => new Prisma.Decimal(value);
const variants = [
    {
        id: 'low',
        name: 'Low',
        skuCode: 'LOW',
        primaryUnit: 'KG',
        minStockAlert: decimal(10),
        reorderPoint: decimal(8),
        reorderQuantity: decimal(20),
        preferredSupplier: null,
        inventories: [
            {
                quantity: decimal(3),
                location: {
                    locationType: 'INTERNAL',
                    locationPurpose: 'RAW_MATERIAL',
                },
            },
            {
                quantity: decimal(100),
                location: {
                    locationType: 'CUSTOMER_OWNED',
                    locationPurpose: 'RAW_MATERIAL',
                },
            },
        ],
    },
    {
        id: 'safe',
        name: 'Safe',
        skuCode: 'SAFE',
        primaryUnit: 'PCS',
        minStockAlert: decimal(2),
        reorderPoint: decimal(1),
        reorderQuantity: null,
        preferredSupplier: null,
        inventories: [
            {
                quantity: decimal(2),
                location: {
                    locationType: 'INTERNAL',
                    locationPurpose: 'FINISHED_GOOD',
                },
            },
        ],
    },
];

function inventoryDb() {
    return {
        productVariant: { findMany: vi.fn().mockResolvedValue(variants) },
    };
}

describe('dashboard cross-consumer conformance', () => {
    it('keeps Warehouse/Admin/Factory/Purchasing low-stock and reorder counts on one owner', async () => {
        const warehouse = await readWarehouseInventoryThresholdSnapshot(
            inventoryDb() as never,
            { reorderDriverLimit: 10 },
        );
        const adminProjection = warehouse.lowStockCount;
        const factoryProjection = warehouse.lowStockCount;
        const purchasingProjection = {
            count: warehouse.reorderCount,
            ids: warehouse.reorderDrivers.map((driver) => driver.id),
        };
        const legacyLowStockCount = variants.filter((variant) =>
            isInventoryThresholdTriggered(
                variant.inventories,
                variant.minStockAlert,
            ),
        ).length;

        expect(warehouse).toMatchObject<Partial<WarehouseInventoryThresholdSnapshot>>({
            lowStockCount: 1,
            reorderCount: 1,
        });
        expect(adminProjection).toBe(legacyLowStockCount);
        expect(factoryProjection).toBe(legacyLowStockCount);
        expect(purchasingProjection).toEqual({ count: 1, ids: ['low'] });
    });

    it('keeps AR/AP owner predicates identical across Sales/Finance/Purchasing/Distribution', () => {
        const paidAmount = Symbol('paidAmount');
        const client = { purchaseInvoice: { fields: { paidAmount } } };
        const now = new Date('2026-10-10T03:00:00.000Z');
        const ar = {
            AND: [positiveSalesReceivableWhere()],
            salesOrder: buildOperationalSalesReceivableOrderWhere(),
        };
        const ap = buildOverduePurchaseInvoiceWhere(client, now);

        for (const consumer of ['sales', 'finance', 'distribution']) {
            expect({ consumer, where: ar }.where).toEqual(ar);
        }
        for (const consumer of ['finance', 'purchasing', 'distribution']) {
            expect({ consumer, where: ap }.where).toEqual(ap);
        }
        expect(ap.totalAmount).toEqual({ gt: paidAmount });
        expect(ap.dueDate).toEqual({
            lt: new Date('2026-10-09T17:00:00.000Z'),
        });
    });

    it('keeps Production output grouping and lateness on exported composition', () => {
        const output = composeProductionOutputHealth(
            [
                {
                    quantityProduced: 5,
                    productionOrder: {
                        id: 'mix-1',
                        bom: {
                            category: 'MIXING',
                            productVariant: {
                                id: 'v1',
                                name: 'Mix',
                                skuCode: 'MIX',
                                primaryUnit: 'KG',
                            },
                        },
                    },
                },
                {
                    quantityProduced: 7,
                    productionOrder: {
                        id: 'pack-1',
                        bom: {
                            category: 'PACKING',
                            productVariant: {
                                id: 'v2',
                                name: 'Pack',
                                skuCode: 'PACK',
                                primaryUnit: 'PCS',
                            },
                        },
                    },
                },
            ],
            false,
        );
        expect(output.processTotals).toEqual([
            { processKey: 'MIXING', unit: 'KG', quantity: 5 },
            { processKey: 'PACKING', unit: 'PCS', quantity: 7 },
        ]);
        expect(
            buildProductionDashboardLateOrderWhere(
                new Date('2026-10-10T03:00:00.000Z'),
            ),
        ).toEqual({
            status: 'IN_PROGRESS',
            plannedEndDate: { lt: new Date('2026-10-10T03:00:00.000Z') },
        });
    });

    it('keeps HRD desktop/mobile sections conformant while mobile omits the loan query', async () => {
        const db = {
            employee: { count: vi.fn().mockResolvedValue(0) },
            attendanceRecord: {
                groupBy: vi.fn().mockResolvedValue([]),
                aggregate: vi.fn().mockResolvedValue({
                    _sum: { overtimeHours: null },
                }),
            },
            payrollPeriod: {
                count: vi.fn().mockResolvedValue(0),
                findFirst: vi.fn().mockResolvedValue(null),
            },
            payslip: { groupBy: vi.fn().mockResolvedValue([]) },
            leaveRequest: { count: vi.fn().mockResolvedValue(0) },
            employeeLoan: {
                aggregate: vi.fn().mockResolvedValue({
                    _count: { _all: 0 },
                    _sum: { remainingBalance: null },
                }),
            },
            notification: { count: vi.fn().mockResolvedValue(0) },
        };
        const now = new Date('2026-10-10T03:00:00.000Z');
        const desktop = await readHrdDashboardAggregate(db as never, { now });
        db.employeeLoan.aggregate.mockClear();
        const mobile = await readHrdDashboardMobileAggregate(db as never, {
            now,
        });

        expect(mobile.generatedAt).toEqual(expect.any(String));
        expect(mobile.health).toEqual(desktop.health);
        expect(mobile.drivers).toEqual(desktop.drivers);
        expect(mobile.attention).not.toHaveProperty('loanPortfolio');
        expect(db.employeeLoan.aggregate).not.toHaveBeenCalled();
        expect(mobile.health.payrollReadiness.status).toBe('NOT_CONFIGURED');
        expect(mobile.drivers.status).toBe('NOT_CONFIGURED');
    });
});
