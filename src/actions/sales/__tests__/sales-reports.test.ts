import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        customerSalesAssignment: {
            groupBy: vi.fn().mockResolvedValue([]),
        },
        salesVisit: {
            groupBy: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'SALES', roles: null },
    }),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true, data };
        } catch (e) {
            return { success: false, error: (e as Error).message };
        }
    },
}));

import { prisma } from '@/lib/core/prisma';
import { getSalesPerformanceReport } from '../sales-reports';

const mockFindMany = vi.mocked(prisma.salesOrder.findMany);
const mockPortfolioGroupBy = vi.mocked(
    prisma.customerSalesAssignment.groupBy,
);
const mockVisitGroupBy = vi.mocked(prisma.salesVisit.groupBy);

function makeOrder(overrides: {
    id?: string;
    totalAmount?: number;
    salesRepId?: string | null;
    salesRep?: { id: string; name: string } | null;
    orderNumber?: string;
    customerId?: string;
    customerName?: string;
} = {}) {
    return {
        id: overrides.id || 'so-1',
        orderNumber: overrides.orderNumber || 'SO-001',
        orderDate: new Date('2026-08-01'),
        status: 'CONFIRMED',
        totalAmount: overrides.totalAmount ?? 1000000,
        customerId: overrides.customerId || 'cus-1',
        salesRepId:
            'salesRepId' in overrides
                ? overrides.salesRepId
                : 'user-sales-1',
        salesRep:
            'salesRep' in overrides
                ? overrides.salesRep
                : { id: 'user-sales-1', name: 'Budi Sales' },
        customer: { name: overrides.customerName || 'Customer A' },
        createdBy: { name: 'Admin Input' },
        items: [
            {
                id: 'item-1',
                quantity: 10,
                unitPrice: 100000,
                subtotal: 1000000,
                productVariant: {
                    name: 'Variant A',
                    product: { name: 'Product A' },
                },
            },
        ],
        invoices: [],
    } as never;
}

describe('getSalesPerformanceReport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty summary when no orders', async () => {
        mockFindMany.mockResolvedValue([]);
        const result = await getSalesPerformanceReport();
        expect(result).toBeDefined();
        if (result && 'success' in result) {
            expect(result.success).toBe(true);
            if (result.success && result.data) {
                const data = result.data as {
                    rows: unknown[];
                    summary: {
                        bySalesperson: unknown[];
                    };
                };
                expect(data.summary.bySalesperson).toEqual([]);
            }
        }
    });

    it('groups orders by salesRepId and aggregates revenue, orders, avgOrderValue', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
            makeOrder({
                id: 'so-2',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 2000000,
            }),
            makeOrder({
                id: 'so-3',
                salesRepId: 'user-sales-2',
                salesRep: { id: 'user-sales-2', name: 'Andi Marketing' },
                totalAmount: 1500000,
            }),
        ]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        name: string;
                        revenue: number;
                        orders: number;
                        avgOrderValue: number;
                    }[];
                };
            };
            expect(data.summary.bySalesperson).toHaveLength(2);

            // Budi: 1M + 2M = 3M, 2 orders, avg 1.5M
            const budi = data.summary.bySalesperson.find(
                (sp) => sp.userId === 'user-sales-1',
            );
            expect(budi).toBeDefined();
            expect(budi!.name).toBe('Budi Sales');
            expect(budi!.revenue).toBe(3000000);
            expect(budi!.orders).toBe(2);
            expect(budi!.avgOrderValue).toBe(1500000);

            // Andi: 1.5M, 1 order, avg 1.5M
            const andi = data.summary.bySalesperson.find(
                (sp) => sp.userId === 'user-sales-2',
            );
            expect(andi).toBeDefined();
            expect(andi!.revenue).toBe(1500000);
            expect(andi!.orders).toBe(1);
            expect(andi!.avgOrderValue).toBe(1500000);
        }
    });

    it('puts SO with null salesRepId in "Belum ada atribusi" group', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: null,
                salesRep: null,
                totalAmount: 500000,
            }),
            makeOrder({
                id: 'so-2',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
        ]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        name: string;
                        revenue: number;
                        orders: number;
                    }[];
                };
            };
            const unattributed = data.summary.bySalesperson.find(
                (sp) => sp.userId === '__unattributed__',
            );
            expect(unattributed).toBeDefined();
            expect(unattributed!.name).toBe('Belum ada atribusi');
            expect(unattributed!.revenue).toBe(500000);
            expect(unattributed!.orders).toBe(1);
        }
    });

    it('includes portfolio size from CustomerSalesAssignment', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
        ]);
        mockPortfolioGroupBy.mockResolvedValue([
            {
                userId: 'user-sales-1',
                _count: { id: 5 },
            },
        ] as never);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        portfolioSize: number;
                    }[];
                };
            };
            expect(data.summary.bySalesperson[0].portfolioSize).toBe(5);
        }
    });

    it('defaults portfolio size to 0 when no assignments', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
        ]);
        mockPortfolioGroupBy.mockResolvedValue([]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        portfolioSize: number;
                    }[];
                };
            };
            expect(data.summary.bySalesperson[0].portfolioSize).toBe(0);
        }
    });

    it('includes visit count from SalesVisit within filter period', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
        ]);
        mockVisitGroupBy.mockResolvedValue([
            {
                userId: 'user-sales-1',
                _count: { id: 12 },
            },
        ] as never);

        const result = await getSalesPerformanceReport({
            startDate: new Date('2026-08-01'),
            endDate: new Date('2026-08-31'),
        });
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        visitCount: number;
                    }[];
                };
            };
            expect(data.summary.bySalesperson[0].visitCount).toBe(12);
        }
    });

    it('defaults visit count to 0 when no visits', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
        ]);
        mockVisitGroupBy.mockResolvedValue([]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        visitCount: number;
                    }[];
                };
            };
            expect(data.summary.bySalesperson[0].visitCount).toBe(0);
        }
    });

    it('sets portfolio and visit to 0 for unattributed group', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: null,
                salesRep: null,
                totalAmount: 500000,
            }),
        ]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: {
                        userId: string;
                        portfolioSize: number;
                        visitCount: number;
                    }[];
                };
            };
            const unattributed = data.summary.bySalesperson.find(
                (sp) => sp.userId === '__unattributed__',
            );
            expect(unattributed).toBeDefined();
            expect(unattributed!.portfolioSize).toBe(0);
            expect(unattributed!.visitCount).toBe(0);
        }
    });

    it('sorts bySalesperson by revenue descending', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                totalAmount: 1000000,
            }),
            makeOrder({
                id: 'so-2',
                salesRepId: 'user-sales-2',
                salesRep: { id: 'user-sales-2', name: 'Andi Marketing' },
                totalAmount: 3000000,
            }),
            makeOrder({
                id: 'so-3',
                salesRepId: 'user-sales-3',
                salesRep: { id: 'user-sales-3', name: 'Citra Sales' },
                totalAmount: 2000000,
            }),
        ]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                summary: {
                    bySalesperson: { userId: string; revenue: number }[];
                };
            };
            expect(data.summary.bySalesperson[0].userId).toBe(
                'user-sales-2',
            );
            expect(data.summary.bySalesperson[1].userId).toBe(
                'user-sales-3',
            );
            expect(data.summary.bySalesperson[2].userId).toBe(
                'user-sales-1',
            );
        }
    });

    it('uses salesRep.name for salesPerson field, not createdBy.name', async () => {
        mockFindMany.mockResolvedValue([
            makeOrder({
                id: 'so-1',
                salesRepId: 'user-sales-1',
                salesRep: { id: 'user-sales-1', name: 'Budi Sales' },
                customerName: 'Customer A',
            }),
        ]);

        const result = await getSalesPerformanceReport();
        if (result && 'success' in result && result.success && result.data) {
            const data = result.data as {
                rows: { salesPerson: string }[];
            };
            expect(data.rows[0].salesPerson).toBe('Budi Sales');
            // Should NOT be the createdBy name
            expect(data.rows[0].salesPerson).not.toBe('Admin Input');
        }
    });
});
