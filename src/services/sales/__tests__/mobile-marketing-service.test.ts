import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({ tenantDbContext: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: m.tenantDbContext,
}));

import {
    MARKETING_MOBILE_SAMPLE_LIMIT,
    compareMarketingTasks,
    readMarketingMobileOverview,
    type MarketingTaskDto,
} from '../mobile-marketing-service';

const now = new Date('2026-10-07T03:00:00.000Z');

function makeTx() {
    return {
        user: {
            findMany: vi.fn().mockResolvedValue([
                { id: 'sales-a', name: 'Ani' },
                { id: 'sales-b', name: 'Budi' },
            ]),
        },
        salesTarget: {
            findMany: vi.fn().mockResolvedValue([
                {
                    userId: 'sales-a',
                    orderTarget: 4,
                    visitTarget: 8,
                    revenueTarget: new Prisma.Decimal(1000),
                },
            ]),
        },
        salesOrder: {
            groupBy: vi.fn().mockResolvedValue([
                { salesRepId: 'sales-a', _count: { id: 2 } },
            ]),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
        },
        salesVisit: {
            groupBy: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
        },
        salesRoutePlan: { findMany: vi.fn().mockResolvedValue([]) },
        customer: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
        },
        invoice: {
            count: vi.fn().mockResolvedValue(3),
            aggregate: vi.fn().mockResolvedValue({
                _sum: { remainingAmount: new Prisma.Decimal(750) },
            }),
        },
        salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    m.transaction.mockImplementation(
        async (fn: (client: ReturnType<typeof makeTx>) => unknown) =>
            fn(makeTx()),
    );
    m.tenantDbContext.mockReturnValue({ $transaction: m.transaction });
});

describe('marketing mobile read service', () => {
    it('uses independent RepeatableRead transactions and returns available empty sections', async () => {
        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect(result.generatedAt).toBe(now.toISOString());
        expect(result.sections.team.status).toBe('AVAILABLE');
        expect(result.sections.compliance.status).toBe('AVAILABLE');
        expect(result.sections.pipelineExceptions.status).toBe('AVAILABLE');
        expect(result.sections.reviews.status).toBe('AVAILABLE');
        expect(result.sections.customersWithoutFollowUp.status).toBe(
            'AVAILABLE',
        );
        expect(result.sections.tasks).toEqual({
            status: 'AVAILABLE',
            data: { total: 0, returned: 0, items: [] },
        });
        expect(result.sections.receivables).toMatchObject({
            status: 'AVAILABLE',
            data: { overdueCount: 3 },
        });
        expect(m.transaction).toHaveBeenCalledTimes(7);
        for (const call of m.transaction.mock.calls) {
            expect(call[1]).toEqual({
                isolationLevel:
                    Prisma.TransactionIsolationLevel.RepeatableRead,
            });
        }
    });

    it('isolates one failed SQL section without erasing available peers', async () => {
        let transactionIndex = 0;
        m.transaction.mockImplementation(
            async (fn: (client: ReturnType<typeof makeTx>) => unknown) => {
                transactionIndex += 1;
                if (transactionIndex === 3) {
                    throw new Error('synthetic pipeline statement failure');
                }
                return fn(makeTx());
            },
        );

        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });
        expect(result.sections.pipelineExceptions.status).toBe('UNAVAILABLE');
        expect(result.sections.team.status).toBe('AVAILABLE');
        expect(result.sections.reviews.status).toBe('AVAILABLE');
        expect(result.sections.tasks.status).toBe('AVAILABLE');
    });

    it('omits nominal selects and queries without price permission', async () => {
        const clients: ReturnType<typeof makeTx>[] = [];
        m.transaction.mockImplementation(
            async (fn: (client: ReturnType<typeof makeTx>) => unknown) => {
                const client = makeTx();
                clients.push(client);
                return fn(client);
            },
        );
        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect(JSON.stringify(result)).not.toContain('overdueAmount');
        expect(JSON.stringify(result)).not.toContain('revenue');
        const teamClient = clients[0];
        expect(
            teamClient.salesTarget.findMany.mock.calls[0][0].select,
        ).not.toHaveProperty('revenueTarget');
        expect(teamClient.salesReturn.findMany).not.toHaveBeenCalled();
        const pipelineClient = clients[2];
        expect(
            pipelineClient.salesOrder.findMany.mock.calls[0][0].select,
        ).not.toHaveProperty('totalAmount');
        const arClient = clients[6];
        expect(arClient.invoice.aggregate).not.toHaveBeenCalled();
    });

    it('fails before queries when tenant context is unavailable', async () => {
        m.tenantDbContext.mockReturnValue(undefined);
        await expect(
            readMarketingMobileOverview({ canViewPrices: false, now }),
        ).rejects.toThrow(
            'Konteks tenant untuk ringkasan marketing tidak tersedia.',
        );
        expect(m.transaction).not.toHaveBeenCalled();
    });

    it('orders tasks by URGENT, HIGH, NORMAL then occurredAt, kind, id', () => {
        const tasks: MarketingTaskDto[] = [
            {
                id: 'normal',
                kind: 'NO_FOLLOW_UP',
                title: '',
                subtitle: '',
                priority: 'NORMAL',
                occurredAt: '2026-01-01T00:00:00.000Z',
            },
            {
                id: 'high-b',
                kind: 'VISIT_REVIEW',
                title: '',
                subtitle: '',
                priority: 'HIGH',
                occurredAt: '2026-01-02T00:00:00.000Z',
            },
            {
                id: 'urgent',
                kind: 'PIPELINE',
                title: '',
                subtitle: '',
                priority: 'URGENT',
                occurredAt: '2026-12-01T00:00:00.000Z',
            },
            {
                id: 'high-a',
                kind: 'PROSPECT_REVIEW',
                title: '',
                subtitle: '',
                priority: 'HIGH',
                occurredAt: '2026-01-02T00:00:00.000Z',
            },
        ];
        expect(tasks.sort(compareMarketingTasks).map((task) => task.id)).toEqual(
            ['urgent', 'high-a', 'high-b', 'normal'],
        );
    });

    it('keeps an urgent task ahead of more than ten lower-priority candidates', async () => {
        const clients: ReturnType<typeof makeTx>[] = [];
        m.transaction.mockImplementation(
            async (fn: (client: ReturnType<typeof makeTx>) => unknown) => {
                const client = makeTx();
                clients.push(client);
                if (clients.length === 6) {
                    client.salesOrder.count
                        .mockResolvedValueOnce(0)
                        .mockResolvedValueOnce(1)
                        .mockResolvedValueOnce(11);
                    client.salesOrder.findMany
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([
                            {
                                id: 'urgent-1',
                                orderNumber: 'Q-URGENT',
                                commercialReviewStatus: 'NOT_REQUIRED',
                                nextFollowUpDate: new Date(
                                    '2026-10-01T00:00:00.000Z',
                                ),
                                validUntil: null,
                                customer: { name: 'Urgent Customer' },
                                salesRep: { name: 'Ani' },
                            },
                        ])
                        .mockResolvedValueOnce(
                            Array.from(
                                { length: MARKETING_MOBILE_SAMPLE_LIMIT },
                                (_, index) => ({
                                    id: `commercial-${index}`,
                                    orderNumber: `Q-HIGH-${index}`,
                                    commercialReviewStatus: 'PENDING',
                                    nextFollowUpDate: new Date(
                                        `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
                                    ),
                                    validUntil: null,
                                    customer: { name: 'High Customer' },
                                    salesRep: { name: 'Ani' },
                                }),
                            ),
                        )
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([]);
                }
                return fn(client);
            },
        );

        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });
        expect(result.sections.tasks).toMatchObject({
            status: 'AVAILABLE',
            data: {
                total: 12,
                returned: MARKETING_MOBILE_SAMPLE_LIMIT,
            },
        });
        if (result.sections.tasks.status !== 'AVAILABLE') return;
        expect(result.sections.tasks.data.items[0]).toMatchObject({
            id: 'urgent-1',
            priority: 'URGENT',
        });
        expect(
            result.sections.tasks.data.items.slice(1).every(
                (task) => task.priority === 'HIGH',
            ),
        ).toBe(true);
        const taskClient = clients[5];
        expect(taskClient.salesOrder.findMany).toHaveBeenCalledTimes(5);
        expect(
            taskClient.salesOrder.findMany.mock.calls[0][0].where.AND[0],
        ).toMatchObject({ commercialReviewStatus: { not: 'PENDING' } });
        expect(
            taskClient.salesOrder.findMany.mock.calls[1][0].where.AND[0],
        ).toMatchObject({ commercialReviewStatus: { not: 'PENDING' } });
        expect(
            taskClient.salesOrder.findMany.mock.calls[2][0].where,
        ).toMatchObject({
            commercialReviewStatus: 'PENDING',
            nextFollowUpDate: { not: null },
        });
    });
});
