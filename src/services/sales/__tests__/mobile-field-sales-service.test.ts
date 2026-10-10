import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({
    hasAnyRole: vi.fn(),
    transaction: vi.fn(),
    route: vi.fn(),
    orderCount: vi.fn(),
    orders: vi.fn(),
    orderGroup: vi.fn(),
    routeItemCount: vi.fn(),
    visitCount: vi.fn(),
    customers: vi.fn(),
    invoiceCount: vi.fn(),
    invoiceAggregate: vi.fn(),
    invoices: vi.fn(),
}));

const tx = {
    salesRoutePlan: { findUnique: m.route },
    salesOrder: {
        count: m.orderCount,
        findMany: m.orders,
        groupBy: m.orderGroup,
    },
    salesRoutePlanItem: { count: m.routeItemCount },
    salesVisit: { count: m.visitCount },
    customer: { findMany: m.customers },
    invoice: {
        count: m.invoiceCount,
        aggregate: m.invoiceAggregate,
        findMany: m.invoices,
    },
};

vi.mock('@/lib/auth/roles', () => ({ hasAnyRole: m.hasAnyRole }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: vi.fn() }));

import {
    createFieldSalesMobileReader,
    readFieldSalesMobileOverview,
    type FieldSalesMobileReader,
} from '../mobile-field-sales-service';

const actor = {
    user: { id: 'sales-1', role: 'SALES', roles: ['SALES'] },
};
const now = new Date('2026-10-10T17:00:00.000Z');

function sectionReader(): FieldSalesMobileReader {
    return {
        readRoute: vi.fn().mockResolvedValue(null),
        readFollowUps: vi
            .fn()
            .mockResolvedValue({ total: 0, returned: 0, items: [] }),
        readCompliance: vi.fn().mockResolvedValue({
            assigned: 0,
            completed: 0,
            extraCalls: 0,
            compliance: 0,
        }),
        readPipeline: vi.fn().mockResolvedValue({
            total: 0,
            returned: 0,
            items: [],
            activeCount: 0,
            openQuotationCount: 0,
            nominal: { status: 'HIDDEN', data: null },
        }),
        readActiveCustomers: vi.fn().mockResolvedValue([]),
        readReceivables: vi.fn().mockResolvedValue({
            total: 0,
            overdueCount: 0,
            href: null,
            nominal: { status: 'HIDDEN', data: null },
        }),
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    m.hasAnyRole.mockReturnValue(false);
    m.transaction.mockImplementation(
        async (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    m.route.mockResolvedValue(null);
    m.orderCount.mockResolvedValue(0);
    m.orders.mockResolvedValue([]);
    m.orderGroup.mockResolvedValue([]);
    m.routeItemCount.mockResolvedValue(0);
    m.visitCount.mockResolvedValue(0);
    m.customers.mockResolvedValue([]);
    m.invoiceCount.mockResolvedValue(0);
    m.invoiceAggregate.mockResolvedValue({
        _sum: { remainingAmount: new Prisma.Decimal(0) },
    });
    m.invoices.mockResolvedValue([]);
});

describe('Field Sales mobile composer', () => {
    it('uses one instant for WIB date, UTC route key, greeting, and every reader', async () => {
        const reader = sectionReader();
        const result = await readFieldSalesMobileOverview({
            actor,
            canViewPrices: false,
            now,
            reader,
        });

        expect(result).toMatchObject({
            generatedAt: '2026-10-10T17:00:00.000Z',
            businessDate: '2026-10-11',
            greeting: 'Selamat pagi',
        });
        const temporal = vi.mocked(reader.readRoute).mock.calls[0][1];
        expect(temporal.routeStorageDate.toISOString()).toBe(
            '2026-10-11T00:00:00.000Z',
        );
        expect(temporal.startOfDay.toISOString()).toBe(
            '2026-10-10T17:00:00.000Z',
        );
        expect(temporal.endOfDay.toISOString()).toBe(
            '2026-10-11T16:59:59.999Z',
        );
        expect(vi.mocked(reader.readFollowUps).mock.calls[0][1]).toBe(temporal);
        expect(vi.mocked(reader.readCompliance).mock.calls[0][1]).toBe(
            temporal,
        );
    });

    it('isolates one failed section while valid empty sections remain AVAILABLE', async () => {
        const reader = sectionReader();
        vi.mocked(reader.readCompliance).mockRejectedValue(
            new Error('synthetic SQL failure'),
        );

        const result = await readFieldSalesMobileOverview({
            actor,
            canViewPrices: false,
            now,
            reader,
        });

        expect(result.sections.compliance.status).toBe('UNAVAILABLE');
        expect(result.sections.route).toEqual({
            status: 'AVAILABLE',
            data: null,
        });
        expect(result.sections.followUps).toEqual({
            status: 'AVAILABLE',
            data: { total: 0, returned: 0, items: [] },
        });
        expect(result.sections.pipeline.status).toBe('AVAILABLE');
        expect(result.sections.activeCustomers.status).toBe('AVAILABLE');
        expect(result.sections.receivables.status).toBe('AVAILABLE');
    });
});

describe('Field Sales database reader', () => {
    it('omits every amount query/select/property without price capability', async () => {
        m.orderGroup.mockResolvedValue([
            { status: 'DRAFT', _count: { status: 1 } },
        ]);
        m.orders.mockResolvedValue([
            {
                id: 'order-1',
                orderNumber: 'SO-1',
                status: 'DRAFT',
                orderDate: now,
                customer: { name: 'Customer' },
            },
        ]);
        const reader = createFieldSalesMobileReader({
            $transaction: m.transaction,
        } as never);
        const result = await reader.readPipeline(
            { actorUserId: 'sales-1', isGlobalViewer: false },
            false,
        );

        expect(result.nominal.status).toBe('HIDDEN');
        expect(JSON.stringify(result)).not.toContain('totalAmount');
        expect(m.orderGroup.mock.calls[0][0]).not.toHaveProperty('_sum');
        expect(m.orders.mock.calls[0][0].select).not.toHaveProperty(
            'totalAmount',
        );
        expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
    });

    it('keeps canonical operational ownership in SQL before AR count/sample and hides href', async () => {
        const reader = createFieldSalesMobileReader({
            $transaction: m.transaction,
        } as never);
        const temporal = {
            now,
            businessDate: '2026-10-11',
            routeStorageDate: new Date('2026-10-11T00:00:00.000Z'),
            startOfDay: new Date('2026-10-10T17:00:00.000Z'),
            endOfDay: new Date('2026-10-11T16:59:59.999Z'),
        };
        const result = await reader.readReceivables(
            { actorUserId: 'sales-1', isGlobalViewer: false },
            temporal,
            false,
        );

        expect(result).toMatchObject({
            total: 0,
            href: null,
            nominal: { status: 'HIDDEN' },
        });
        const where = m.invoiceCount.mock.calls[0][0].where;
        expect(where.AND[0]).toEqual({
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            remainingAmount: { gt: 0 },
        });
        expect(where.AND[1].salesOrder.AND[0].OR).toEqual([
            { createdById: 'sales-1' },
            {
                customer: {
                    salesAssignments: {
                        some: {
                            userId: 'sales-1',
                            unassignedAt: null,
                        },
                    },
                },
            },
        ]);
        expect(where.AND[1].salesOrder.AND[1]).toMatchObject({
            customerId: { not: null },
            AND: expect.any(Array),
        });
        expect(m.invoiceAggregate).not.toHaveBeenCalled();
        expect(m.invoices).not.toHaveBeenCalled();
    });

    it('uses DB remainingAmount and deterministic due-date/id order with capability', async () => {
        m.invoiceCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        m.invoiceAggregate.mockResolvedValue({
            _sum: { remainingAmount: new Prisma.Decimal(750) },
        });
        m.invoices.mockResolvedValue([
            {
                id: 'invoice-1',
                invoiceNumber: 'INV-1',
                status: 'OVERDUE',
                dueDate: null,
                remainingAmount: new Prisma.Decimal(750),
                salesOrder: {
                    orderNumber: 'SO-1',
                    customer: { name: 'Customer' },
                },
            },
        ]);
        const reader = createFieldSalesMobileReader({
            $transaction: m.transaction,
        } as never);
        const result = await reader.readReceivables(
            { actorUserId: 'sales-1', isGlobalViewer: false },
            {
                now,
                businessDate: '2026-10-11',
                routeStorageDate: new Date('2026-10-11T00:00:00.000Z'),
                startOfDay: new Date('2026-10-10T17:00:00.000Z'),
                endOfDay: new Date('2026-10-11T16:59:59.999Z'),
            },
            true,
        );

        expect(result.nominal).toMatchObject({
            status: 'AVAILABLE',
            data: {
                total: 1,
                returned: 1,
                totalOutstanding: 750,
                items: [{ remainingAmount: 750 }],
            },
        });
        expect(m.invoiceAggregate.mock.calls[0][0]._sum).toEqual({
            remainingAmount: true,
        });
        expect(m.invoices.mock.calls[0][0].orderBy).toEqual([
            { dueDate: { sort: 'asc', nulls: 'last' } },
            { id: 'asc' },
        ]);
    });
});
