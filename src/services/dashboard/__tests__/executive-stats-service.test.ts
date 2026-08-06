import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, ProductionStatus, PurchaseInvoiceStatus, SalesOrderStatus } from '@prisma/client';

class FakeDecimal {
    constructor(private readonly value: number) { }

    toNumber() {
        return this.value;
    }

    valueOf() {
        return this.value;
    }
}

const { mockPrisma } = vi.hoisted(() => {
    const prisma = {
        $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
        $queryRaw: vi.fn().mockResolvedValue([
            { month: '2026-01', revenue: 50000 },
            { month: '2026-02', revenue: 75000 },
            { month: '2026-03', revenue: 60000 },
            { month: '2026-04', revenue: 90000 },
            { month: '2026-05', revenue: 85000 },
        ]),
        journalLine: {
            aggregate: vi.fn(),
        },
        salesOrder: {
            findMany: vi.fn(),
        },
        invoice: {
            count: vi.fn(),
            aggregate: vi.fn(),
        },
        purchaseOrder: {
            count: vi.fn(),
        },
        productionOrder: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
        machine: {
            count: vi.fn(),
        },
        machineDowntime: {
            findMany: vi.fn(),
        },
        scrapRecord: {
            aggregate: vi.fn(),
        },
        productionExecution: {
            aggregate: vi.fn(),
        },
        materialIssue: {
            aggregate: vi.fn(),
        },
        productVariant: {
            aggregate: vi.fn(),
            findMany: vi.fn(),
        },
        purchaseInvoice: {
            aggregate: vi.fn(),
        },
        inventory: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    };

    return { mockPrisma: prisma };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

import { ExecutiveStatsService } from '../executive-stats-service';

describe('ExecutiveStatsService.getExecutiveStats', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
        vi.clearAllMocks();

        mockPrisma.$queryRaw.mockResolvedValue([
            { month: '2026-01', revenue: 50000 },
            { month: '2026-02', revenue: 75000 },
            { month: '2026-03', revenue: 60000 },
            { month: '2026-04', revenue: 90000 },
            { month: '2026-05', revenue: 85000 },
        ]);

        mockPrisma.journalLine.aggregate
            .mockResolvedValueOnce({ _sum: { credit: new FakeDecimal(1000), debit: new FakeDecimal(100) } })
            .mockResolvedValueOnce({ _sum: { credit: new FakeDecimal(500), debit: new FakeDecimal(0) } })
            .mockResolvedValueOnce({ _sum: { debit: new FakeDecimal(300), credit: new FakeDecimal(50) } })
            .mockResolvedValueOnce({ _sum: { debit: new FakeDecimal(200), credit: new FakeDecimal(0) } });
        mockPrisma.salesOrder.findMany.mockResolvedValue([
            { status: SalesOrderStatus.CONFIRMED },
            { status: SalesOrderStatus.DELIVERED },
        ]);
        mockPrisma.invoice.count
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(2);
        mockPrisma.purchaseOrder.count.mockResolvedValue(3);
        mockPrisma.productionOrder.count
            .mockResolvedValueOnce(5)  // active production count
            .mockResolvedValueOnce(2); // delayed jobs count
        mockPrisma.productionOrder.findMany
            .mockResolvedValueOnce([
                { status: ProductionStatus.COMPLETED },
                { status: ProductionStatus.IN_PROGRESS },
            ])
            .mockResolvedValueOnce([
                { machineId: 'machine-1' },
                { machineId: 'machine-2' },
            ])
            .mockResolvedValueOnce([ // previous month orders for trend
                { status: ProductionStatus.COMPLETED },
                { status: ProductionStatus.COMPLETED },
            ]);
        mockPrisma.machine.count.mockResolvedValue(6);
        mockPrisma.machineDowntime.findMany.mockResolvedValue([
            {
                startTime: new Date('2026-05-31T10:00:00.000Z'),
                endTime: new Date('2026-05-31T11:30:00.000Z'),
            }
        ]);
        mockPrisma.scrapRecord.aggregate.mockResolvedValue({ _sum: { quantity: new FakeDecimal(2) } });
        mockPrisma.productionExecution.aggregate
            .mockResolvedValueOnce({ _sum: { scrapQuantity: new FakeDecimal(1) } })
            .mockResolvedValueOnce({ _sum: { quantityProduced: new FakeDecimal(80) } });
        mockPrisma.materialIssue.aggregate.mockResolvedValue({ _sum: { quantity: new FakeDecimal(100) } });
        mockPrisma.productVariant.aggregate.mockResolvedValue({ _sum: { price: new FakeDecimal(0) }, _count: { id: 12 } });
        mockPrisma.invoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: new FakeDecimal(1000), paidAmount: new FakeDecimal(250) }
        });
        mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: new FakeDecimal(600), paidAmount: new FakeDecimal(100) }
        });
        // inventory.findMany called twice: stockItems (value calc) + inventoryForAlert (low stock)
        mockPrisma.inventory.findMany
            .mockResolvedValueOnce([
                { quantity: new FakeDecimal(10), averageCost: new FakeDecimal(20), productVariant: { standardCost: null, price: new FakeDecimal(20) } },
                { quantity: new FakeDecimal(3), averageCost: null, productVariant: { standardCost: new FakeDecimal(15), price: new FakeDecimal(15) } },
            ])
            .mockResolvedValueOnce([
                { quantity: new FakeDecimal(2), productVariantId: 'var-1', location: { slug: 'rm_warehouse' } },
                { quantity: new FakeDecimal(1), productVariantId: 'var-1', location: { slug: 'fg_warehouse' } },
                { quantity: new FakeDecimal(50), productVariantId: 'var-2', location: { slug: 'rm_warehouse' } },
            ]);
        // lowStockVariants - var-1 has 3 < 10 threshold => low, var-2 50 >= 5 => not low
        mockPrisma.productVariant.findMany.mockResolvedValue([
            { id: 'var-1', minStockAlert: new FakeDecimal(10) },
            { id: 'var-2', minStockAlert: new FakeDecimal(5) },
        ] as never);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('orchestrates dashboard queries and calculates executive metrics', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockPrisma.journalLine.aggregate).toHaveBeenCalledTimes(4);
        expect(mockPrisma.invoice.count).toHaveBeenNthCalledWith(1, {
            where: {
                status: {
                    in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
                },
            },
        });
        expect(mockPrisma.purchaseInvoice.aggregate).toHaveBeenCalledWith({
            where: { status: 'OVERDUE' as PurchaseInvoiceStatus },
            _sum: { totalAmount: true, paidAmount: true }
        });
        // lowStock uses minStockAlert per variant aggregated across RAW_MATERIAL+FINISHING warehouses
        expect(mockPrisma.productVariant.findMany).toHaveBeenCalledWith({
            where: { minStockAlert: { not: null } },
            select: { id: true, minStockAlert: true },
        });
        expect(stats).toEqual({
            sales: {
                mtdRevenue: 900,
                activeOrders: 1,
                pendingInvoices: 4,
                trend: 80,
            },
            purchasing: {
                mtdSpending: 250,
                pendingPOs: 3,
                trend: 25,
            },
            production: {
                activeJobs: 5,
                delayedJobs: 2,
                completionRate: 50,
                yieldRate: 80,
                totalScrapKg: 3,
                downtimeHours: 1.5,
                runningMachines: 2,
                totalMachines: 6,
                trend: -50,
            },
            inventory: {
                totalValue: 245,
                lowStockCount: 1,
                totalItems: 12,
                trend: 0,
            },
            cashflow: {
                overdueReceivables: 750,
                overduePayables: 500,
                invoicesDueThisWeek: 2,
            },
            revenueTrendChart: [
                { month: '2026-01', revenue: 50000 },
                { month: '2026-02', revenue: 75000 },
                { month: '2026-03', revenue: 60000 },
                { month: '2026-04', revenue: 90000 },
                { month: '2026-05', revenue: 85000 },
            ],
        });
    });

    it('handles numeric and string values in decimalToNumber helper', async () => {
        mockPrisma.journalLine.aggregate.mockReset();
        mockPrisma.journalLine.aggregate
            .mockResolvedValueOnce({ _sum: { credit: 1000, debit: '100' } })
            .mockResolvedValueOnce({ _sum: { credit: '500', debit: 0 } })
            .mockResolvedValueOnce({ _sum: { debit: 300, credit: 50 } })
            .mockResolvedValueOnce({ _sum: { debit: 200, credit: 0 } });
        mockPrisma.salesOrder.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockReset();
        mockPrisma.invoice.count.mockResolvedValue(0);
        mockPrisma.purchaseOrder.count.mockResolvedValue(0);
        mockPrisma.productionOrder.count.mockResolvedValue(0);
        mockPrisma.productionOrder.findMany.mockReset();
        mockPrisma.productionOrder.findMany.mockResolvedValue([]);
        mockPrisma.machine.count.mockResolvedValue(0);
        mockPrisma.machineDowntime.findMany.mockResolvedValue([]);
        mockPrisma.scrapRecord.aggregate.mockResolvedValue({ _sum: { quantity: null } });
        mockPrisma.productionExecution.aggregate.mockReset();
        mockPrisma.productionExecution.aggregate.mockResolvedValue({ _sum: { scrapQuantity: null, quantityProduced: null } });
        mockPrisma.materialIssue.aggregate.mockResolvedValue({ _sum: { quantity: null } });
        mockPrisma.productVariant.aggregate.mockResolvedValue({ _sum: { price: null }, _count: { id: 0 } });
        mockPrisma.productVariant.findMany.mockReset();
        mockPrisma.productVariant.findMany.mockResolvedValue([]);
        mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } });
        mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } });
        mockPrisma.inventory.findMany.mockReset();
        mockPrisma.inventory.findMany.mockResolvedValue([]);

        const stats = await ExecutiveStatsService.getExecutiveStats();
        expect(stats.sales.mtdRevenue).toBe(900);
        expect(stats.inventory.lowStockCount).toBe(0);
    });

    it('calculates lowStockCount with minStockAlert logic scoped to raw+finishing warehouses', async () => {
        // Override inventory for alert and variants to test aggregation
        mockPrisma.inventory.findMany.mockReset();
        mockPrisma.inventory.findMany
            .mockResolvedValueOnce([]) // stockItems for value
            .mockResolvedValueOnce([
                { quantity: new FakeDecimal(1), productVariantId: 'v1', location: { slug: 'rm_warehouse' } },
                { quantity: new FakeDecimal(1), productVariantId: 'v1', location: { slug: 'mixing_area' } }, // should be ignored
                { quantity: new FakeDecimal(20), productVariantId: 'v2', location: { slug: 'fg_warehouse' } },
                { quantity: 0, productVariantId: 'v3', location: { slug: 'rm_warehouse' } },
            ]);
        mockPrisma.productVariant.findMany.mockReset();
        mockPrisma.productVariant.findMany.mockResolvedValue([
            { id: 'v1', minStockAlert: new FakeDecimal(5) }, // 1 (only rm) < 5 => low
            { id: 'v2', minStockAlert: new FakeDecimal(10) }, // 20 >=10 => not low
            { id: 'v3', minStockAlert: new FakeDecimal(1) }, // 0 <1 => low
        ] as never);

        const stats = await ExecutiveStatsService.getExecutiveStats();
        expect(stats.inventory.lowStockCount).toBe(2);
    });
});
