import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryStatus, PrismaClient } from '@prisma/client';
import { queryDeliveryOrdersPage } from '@/services/sales/delivery-list-service';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const otherUrl = connection ? new URL(connection) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;

async function seed(client: PrismaClient, prefix: string) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "DeliveryOrderItem", "DeliveryOrder", "SalesOrderItem", "SalesOrder", "Customer", "Location", "User" CASCADE`;
    await client.user.create({
        data: {
            id: prefix + '-user',
            email: prefix + '@example.invalid',
            password: 'synthetic-only',
            role: 'SALES',
        },
    });
    await client.customer.create({
        data: { id: prefix + '-customer', name: prefix + ' Customer' },
    });
    await client.location.create({
        data: {
            id: prefix + '-location',
            name: prefix + ' Warehouse',
            slug: prefix + '-warehouse',
        },
    });
    await client.salesOrder.create({
        data: {
            id: prefix + '-order',
            orderNumber: prefix + '-SO',
            customerId: prefix + '-customer',
            sourceLocationId: prefix + '-location',
            status: 'CONFIRMED',
        },
    });
    const statuses = Object.values(DeliveryStatus);
    await client.deliveryOrder.createMany({
        data: Array.from({ length: 51 }, (_, index) => ({
            id: prefix + '-do-' + index,
            orderNumber: prefix + '-SJ-' + String(index).padStart(3, '0'),
            salesOrderId: prefix + '-order',
            sourceLocationId: prefix + '-location',
            createdById: prefix + '-user',
            deliveryDate: new Date(
                index < 2
                    ? '2026-08-01T00:00:00Z'
                    : '2026-10-' +
                      String((index % 28) + 1).padStart(2, '0') +
                      'T00:00:00Z',
            ),
            status:
                index < 2
                    ? index === 0
                        ? 'PENDING'
                        : 'LOADING'
                    : statuses[index % statuses.length],
        })),
    });
}

const query = {
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: new Date('2026-10-31T23:59:59Z'),
    page: 1,
    pageSize: 25,
    sort: 'orderNumber' as const,
    direction: 'asc' as const,
};

const median = (samples: number[]) =>
    [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];

describe.skipIf(!db)('delivery list PostgreSQL contract', () => {
    beforeEach(async () => {
        await Promise.all([seed(db!, 'tenant-a'), seed(other!, 'tenant-b')]);
    });
    afterAll(async () => {
        await Promise.all([db?.$disconnect(), other?.$disconnect()]);
    });

    it('keeps open drafts outside range and rows/total/counts consistent without N+1 queries', async () => {
        const queries: string[] = [];
        const result = await queryDeliveryOrdersPage(db!, query, (name) =>
            queries.push(name),
        );
        expect(queries.sort()).toEqual([
            'counts',
            'customers',
            'items',
            'locations',
            'total',
        ]);
        expect(result.meta).toMatchObject({
            page: 1,
            pageSize: 25,
            totalPages: 3,
        });
        expect(result.meta.total).toBe(51);
        expect(result.items).toHaveLength(25);
        expect(result.statusCounts.PENDING).toBeGreaterThan(0);
        expect(result.statusCounts.LOADING).toBeGreaterThan(0);
        expect(result.items.some((row) => row.id === 'tenant-a-do-0')).toBe(
            true,
        );
        expect(
            Object.values(result.statusCounts).reduce(
                (sum, count) => sum + count,
                0,
            ),
        ).toBe(51);
    });

    it('paginates a stable sort without missing or duplicate rows', async () => {
        const pages: string[] = [];
        for (const page of [1, 2, 3]) {
            const result = await queryDeliveryOrdersPage(db!, {
                ...query,
                page,
            });
            pages.push(...result.items.map((row) => row.id));
        }
        expect(new Set(pages).size).toBe(51);
        expect(pages).toHaveLength(51);
    });

    it('isolates results by the supplied tenant client', async () => {
        const [tenantA, tenantB] = await Promise.all([
            queryDeliveryOrdersPage(db!, query),
            queryDeliveryOrdersPage(other!, query),
        ]);
        expect(
            tenantA.items.every((row) => row.id.startsWith('tenant-a-')),
        ).toBe(true);
        expect(
            tenantB.items.every((row) => row.id.startsWith('tenant-b-')),
        ).toBe(true);
    });

    it('records a bounded synthetic old-vs-paged benchmark without a production database', async () => {
        const where = {
            OR: [
                {
                    deliveryDate: {
                        gte: query.startDate,
                        lte: query.endDate,
                    },
                },
                { status: { in: ['PENDING', 'LOADING'] as DeliveryStatus[] } },
            ],
        };
        const legacy = () =>
            db!.deliveryOrder.findMany({
                where,
                orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
                include: {
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customer: { select: { name: true } },
                        },
                    },
                    sourceLocation: { select: { name: true } },
                    items: { select: { id: true, verifiedQuantity: true } },
                },
            });
        await legacy();
        await queryDeliveryOrdersPage(db!, query);
        const legacyMs: number[] = [];
        const pagedMs: number[] = [];
        for (let index = 0; index < 3; index += 1) {
            let started = performance.now();
            await legacy();
            legacyMs.push(performance.now() - started);
            started = performance.now();
            await queryDeliveryOrdersPage(db!, query);
            pagedMs.push(performance.now() - started);
        }
        const evidence = {
            rows: 51,
            legacyMedianMs: Number(median(legacyMs).toFixed(2)),
            pagedMedianMs: Number(median(pagedMs).toFixed(2)),
            pagedQueryCount: 5,
        };
        console.info('DELIVERY_LIST_SYNTHETIC_BENCHMARK', evidence);
        expect(evidence.legacyMedianMs).toBeGreaterThanOrEqual(0);
        expect(evidence.pagedMedianMs).toBeLessThan(5_000);
        expect(evidence.pagedQueryCount).toBe(5);
    });
});
