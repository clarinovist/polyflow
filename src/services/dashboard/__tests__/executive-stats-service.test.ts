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
        mockPrisma.productionOrder.count.mockResolvedValue(5);
        mockPrisma.productionOrder.findMany
            .mockResolvedValueOnce([
                { status: ProductionStatus.COMPLETED },
                { status: ProductionStatus.IN_PROGRESS },
            ])
            .mockResolvedValueOnce([
                { machineId: 'machine-1' },
                { machineId: 'machine-2' },
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
        mockPrisma.inventory.findMany.mockResolvedValue([
            { quantity: new FakeDecimal(10), productVariant: { price: new FakeDecimal(20) } },
            { quantity: new FakeDecimal(3), productVariant: { price: new FakeDecimal(15) } },
        ]);
        mockPrisma.inventory.count.mockResolvedValue(1);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('orchestrates dashboard queries and calculates executive metrics', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockPrisma.journalLine.aggregate).toHaveBeenCalledTimes(4);
        expect(mockPrisma.invoice.count).toHaveBeenNthCalledWith(1, {
            where: { status: InvoiceStatus.UNPAID }
        });
        expect(mockPrisma.purchaseInvoice.aggregate).toHaveBeenCalledWith({
            where: { status: 'OVERDUE' as PurchaseInvoiceStatus },
            _sum: { totalAmount: true, paidAmount: true }
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
                delayedJobs: 0,
                completionRate: 50,
                yieldRate: 80,
                totalScrapKg: 3,
                downtimeHours: 1.5,
                runningMachines: 2,
                totalMachines: 6,
                trend: 0,
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
            }
        });
    });
});
