import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, ProductionStatus, PurchaseInvoiceStatus, SalesOrderStatus } from '@prisma/client';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';

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
        mockPrisma.productVariant.aggregate.mockResolvedValue({ _count: { id: 12 } });
        mockPrisma.invoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: new FakeDecimal(1000), paidAmount: new FakeDecimal(250), creditedAmount: new FakeDecimal(100) }
        });
        mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: new FakeDecimal(600), paidAmount: new FakeDecimal(100) }
        });
        // lowStockVariants - var-1 has 3 < 10 threshold => low, var-2 50 >= 5 => not low
        mockPrisma.productVariant.findMany.mockResolvedValue([
            {
                id: 'var-1',
                minStockAlert: new FakeDecimal(10),
                inventories: [
                    { quantity: new FakeDecimal(2), location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                    { quantity: new FakeDecimal(1), location: { locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' } },
                ],
            },
            {
                id: 'var-2',
                minStockAlert: new FakeDecimal(5),
                inventories: [
                    { quantity: new FakeDecimal(50), location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                ],
            },
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
                AND: [{ status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, remainingAmount: { gt: 0 } }],
                status: {
                    in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
                },
            },
        });
        // Invoices Due This Week must use the same explicit outstanding-status allowlist as
        // Overdue Receivables (UNPAID/PARTIAL/OVERDUE) — NOT `status: { not: PAID }`, which
        // would also count DRAFT and CANCELLED invoices as "due this week".
        expect(mockPrisma.invoice.count).toHaveBeenNthCalledWith(2, {
            where: {
                AND: [{ status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, remainingAmount: { gt: 0 } }],
                dueDate: { gte: expect.any(Date), lte: expect.any(Date) },
                status: {
                    in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
                },
            },
        });
        expect(mockPrisma.purchaseInvoice.aggregate).toHaveBeenCalledWith({
            where: {
                OR: [
                    { status: 'OVERDUE' as PurchaseInvoiceStatus },
                    {
                        status: { in: ['UNPAID', 'PARTIAL'] as PurchaseInvoiceStatus[] },
                        dueDate: { lt: expect.any(Date) },
                    },
                ],
            },
            _sum: { totalAmount: true, paidAmount: true }
        });
        // Overdue Receivables must exclude historical/opening-balance AR (SO-OPEN-/OB-AR-),
        // same helper already used by sales-dashboard.ts and finance/invoices.ts.
        expect(mockPrisma.invoice.aggregate).toHaveBeenCalledWith({
            where: {
                OR: [
                    { status: 'OVERDUE' as InvoiceStatus },
                    {
                        status: { in: ['UNPAID', 'PARTIAL'] as InvoiceStatus[] },
                        dueDate: { lt: expect.any(Date) },
                    },
                ],
                salesOrder: buildOperationalSalesReceivableOrderWhere(),
                AND: [{ status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, remainingAmount: { gt: 0 } }],
            },
            _sum: { totalAmount: true, paidAmount: true, creditedAmount: true, priceAdjustmentAmount: true },
        });
        // lowStock uses minStockAlert per variant aggregated across RAW_MATERIAL+FINISHING warehouses
        expect(mockPrisma.productVariant.aggregate).toHaveBeenCalledWith({
            where: { archivedAt: null },
            _count: { id: true },
        });
        expect(mockPrisma.productVariant.findMany).toHaveBeenCalledWith({
            where: { minStockAlert: { not: null }, archivedAt: null },
            select: {
                id: true,
                minStockAlert: true,
                inventories: {
                    select: {
                        quantity: true,
                        location: {
                            select: {
                                locationType: true,
                                locationPurpose: true,
                            },
                        },
                    },
                },
            },
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
                totalValue: null,
                valuationStatus: 'NOT_CONFIGURED',
                lowStockCount: 1,
                totalItems: 12,
                trend: 0,
            },
            cashflow: {
                overdueReceivables: 650,
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

    it('characterizes legacy C2: mixed-unit aggregates are collapsed into one yield ratio', async () => {
        mockPrisma.productionExecution.aggregate.mockReset();
        mockPrisma.productionExecution.aggregate
            .mockResolvedValueOnce({ _sum: { scrapQuantity: new FakeDecimal(0) } })
            .mockResolvedValueOnce({ _sum: { quantityProduced: new FakeDecimal(80) } });
        mockPrisma.materialIssue.aggregate.mockResolvedValue({
            _sum: { quantity: new FakeDecimal(100) },
        });

        const stats = await ExecutiveStatsService.getExecutiveStats();

        // R0 baseline only: aggregate sources carry no unit/process dimension,
        // yet the legacy dashboard presents their quotient as a global yield.
        expect(stats.production.yieldRate).toBe(80);
        expect(mockPrisma.productionExecution.aggregate).toHaveBeenCalledWith(
            expect.objectContaining({ _sum: { quantityProduced: true } }),
        );
        expect(mockPrisma.materialIssue.aggregate).toHaveBeenCalledWith(
            expect.objectContaining({ _sum: { quantity: true } }),
        );
    });

    it('keeps inventory valuation NOT_CONFIGURED until the cost-basis gate is signed off', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(stats.inventory).toMatchObject({
            totalValue: null,
            valuationStatus: 'NOT_CONFIGURED',
        });
        expect(mockPrisma.inventory.findMany).not.toHaveBeenCalled();
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
        mockPrisma.productVariant.aggregate.mockResolvedValue({ _count: { id: 0 } });
        mockPrisma.productVariant.findMany.mockReset();
        mockPrisma.productVariant.findMany.mockResolvedValue([]);
        mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } });
        mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: { totalAmount: null, paidAmount: null } });

        const stats = await ExecutiveStatsService.getExecutiveStats();
        expect(stats.sales.mtdRevenue).toBe(900);
        expect(stats.inventory.lowStockCount).toBe(0);
    });

    it('returns undefined revenue/spending trend when there is no prior-month data (not 0%)', async () => {
        mockPrisma.journalLine.aggregate.mockReset();
        mockPrisma.journalLine.aggregate
            .mockResolvedValueOnce({ _sum: { credit: new FakeDecimal(1000), debit: new FakeDecimal(100) } }) // revenue MTD
            .mockResolvedValueOnce({ _sum: { credit: new FakeDecimal(0), debit: new FakeDecimal(0) } }) // revenue prev month = 0
            .mockResolvedValueOnce({ _sum: { debit: new FakeDecimal(300), credit: new FakeDecimal(50) } }) // spending MTD
            .mockResolvedValueOnce({ _sum: { debit: new FakeDecimal(0), credit: new FakeDecimal(0) } }); // spending prev month = 0

        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(stats.sales.trend).toBeUndefined();
        expect(stats.purchasing.trend).toBeUndefined();
    });

    it('calculates lowStockCount with minStockAlert logic scoped to raw+finishing warehouses', async () => {
        mockPrisma.productVariant.findMany.mockReset();
        mockPrisma.productVariant.findMany.mockResolvedValue([
            {
                id: 'v1',
                minStockAlert: new FakeDecimal(5),
                inventories: [
                    { quantity: new FakeDecimal(1), location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                    { quantity: new FakeDecimal(1), location: { locationType: 'INTERNAL', locationPurpose: 'MIXING' } },
                ],
            },
            {
                id: 'v2',
                minStockAlert: new FakeDecimal(10),
                inventories: [
                    { quantity: new FakeDecimal(20), location: { locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' } },
                ],
            },
            {
                id: 'v3',
                minStockAlert: new FakeDecimal(1),
                inventories: [
                    { quantity: 0, location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                ],
            },
            {
                id: 'v4',
                minStockAlert: new FakeDecimal(10),
                inventories: [
                    { quantity: new FakeDecimal(2), location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
                    { quantity: new FakeDecimal(100), location: { locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' } },
                    { quantity: new FakeDecimal(100), location: { locationType: 'INTERNAL', locationPurpose: 'WIP' } },
                ],
            },
        ] as never);

        const stats = await ExecutiveStatsService.getExecutiveStats();
        expect(stats.inventory.lowStockCount).toBe(3);
    });
});
