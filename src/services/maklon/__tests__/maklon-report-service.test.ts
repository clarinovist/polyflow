import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaklonReportService } from '../maklon-report-service';
import { prisma } from '@/lib/core/prisma';

// Mock Prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findMany: vi.fn(),
        },
        customer: {
            findMany: vi.fn(),
        },
    },
}));

describe('MaklonReportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getReport', () => {
        it('should generate an empty report when no orders exist', async () => {
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

            const report = await MaklonReportService.getReport();

            expect(report.totalOrders).toBe(0);
            expect(report.totalServiceRevenue).toBe(0);
            expect(report.totalInternalCost).toBe(0);
            expect(report.byCustomer).toHaveLength(0);
        });

        it('should correctly calculate profitability for orders with costs and revenue', async () => {
            const mockOrders = [
                {
                    id: 'po-1',
                    orderNumber: 'MAK-001',
                    status: 'COMPLETED',
                    maklonCustomerId: 'cust-1',
                    maklonCustomer: { name: 'Customer A' },
                    maklonCostItems: [
                        { costType: 'LABOR', amount: 100000 },
                        { costType: 'MACHINE', amount: 50000 },
                    ],
                    salesOrderId: 'so-1',
                    salesOrder: {
                        orderNumber: 'SO-001',
                        status: 'COMPLETED',
                        totalAmount: 500000,
                        invoices: [{ invoiceNumber: 'INV-001', status: 'PAID' }],
                    },
                    plannedStartDate: new Date('2026-04-01'),
                    actualEndDate: new Date('2026-04-05'),
                },
            ];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue(mockOrders as any);

            const report = await MaklonReportService.getReport();

            expect(report.totalOrders).toBe(1);
            expect(report.totalServiceRevenue).toBe(500000);
            expect(report.totalInternalCost).toBe(150000);
            expect(report.totalGrossMargin).toBe(350000);
            expect(report.avgMarginPct).toBe(70);

            // Check breakdown
            expect(report.totalCostBreakdown.LABOR).toBe(100000);
            expect(report.totalCostBreakdown.MACHINE).toBe(50000);
            expect(report.totalCostBreakdown.ELECTRICITY).toBe(0);

            // Check customer grouping
            expect(report.byCustomer).toHaveLength(1);
            expect(report.byCustomer[0].customerName).toBe('Customer A');
            expect(report.byCustomer[0].totalGrossMargin).toBe(350000);
        });

        it('should apply date filters correctly', async () => {
            const startDate = new Date('2026-01-01');
            const endDate = new Date('2026-01-31');

            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

            await MaklonReportService.getReport({ startDate, endDate });

            expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        plannedStartDate: {
                            gte: startDate,
                            lte: endDate,
                        },
                    }),
                })
            );
        });

        it('should filter by customerId correctly', async () => {
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

            await MaklonReportService.getReport({ customerId: 'cust-123' });

            expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        maklonCustomerId: 'cust-123',
                    }),
                })
            );
        });

        it('should handle orders without sales orders (0 revenue)', async () => {
            const mockOrders = [
                {
                    id: 'po-2',
                    orderNumber: 'MAK-002',
                    status: 'IN_PROGRESS',
                    maklonCustomerId: 'cust-2',
                    maklonCustomer: { name: 'Customer B' },
                    maklonCostItems: [{ costType: 'OVERHEAD', amount: 50000 }],
                    salesOrderId: null,
                    salesOrder: null,
                    plannedStartDate: new Date('2026-04-10'),
                },
            ];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue(mockOrders as any);

            const report = await MaklonReportService.getReport();

            expect(report.totalServiceRevenue).toBe(0);
            expect(report.totalInternalCost).toBe(50000);
            expect(report.totalGrossMargin).toBe(-50000);
            expect(report.avgMarginPct).toBe(0);
        });
    });

    describe('getCustomers', () => {
        it('should fetch customers with maklon orders', async () => {
            const mockCustomers = [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.customer.findMany).mockResolvedValue(mockCustomers as any);

            const result = await MaklonReportService.getCustomers();

            expect(result).toEqual(mockCustomers);
            expect(prisma.customer.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        maklonOrders: { some: {} },
                    },
                })
            );
        });
    });
});
