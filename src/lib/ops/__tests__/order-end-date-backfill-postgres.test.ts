import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';
import {
    applyOrderEndDates,
    previewOrderEndDates,
    type EndDateBackfillRequest,
} from '../order-end-date-backfill';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;

const start = new Date('2026-09-20T01:00:00.000Z');
const hoursAfter = (hours: number) =>
    new Date(start.getTime() + hours * 3_600_000);
const dated = new Date('2026-09-01T00:00:00.000Z');
const request: EndDateBackfillRequest = {
    tenant: 'synthetic',
    database: 'polyflow_return_credit_scope_test',
    actorId: 'end-date-actor',
    reason: 'Synthetic end-date backfill',
};

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    // Dedicated disposable CI database only, verified by identity + marker.
    await client.$executeRaw`TRUNCATE "Product", "Location", "Machine", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'end-date-actor', email: 'end-date@example.invalid', password: 'synthetic-only', role: 'ADMIN' } });
    await client.product.create({ data: { id: 'p', name: 'Synthetic Product', productType: 'FINISHED_GOOD' } });
    await client.productVariant.create({ data: { id: 'v', productId: 'p', name: 'Synthetic Variant', skuCode: 'END-DATE-TEST', primaryUnit: 'KG' } });
    await client.bom.create({ data: { id: 'bom', productVariantId: 'v', name: 'Synthetic recipe' } });
    await client.location.create({ data: { id: 'loc', name: 'Synthetic WIP', slug: 'synthetic-wip' } });
    const order = (id: string, status: 'COMPLETED' | 'CANCELLED' | 'IN_PROGRESS', actualEndDate: Date | null = null) =>
        client.productionOrder.create({
            data: { id, orderNumber: id, bomId: 'bom', plannedQuantity: 10, plannedStartDate: start, locationId: 'loc', status, actualEndDate },
        });
    await order('WO-OUT', 'COMPLETED');
    await order('WO-NONE', 'COMPLETED');
    await order('WO-DATED', 'COMPLETED', dated);
    await order('WO-CANCEL', 'CANCELLED');
    await order('WO-RUN', 'IN_PROGRESS');
    await client.productionExecution.createMany({
        data: [
            { productionOrderId: 'WO-OUT', startTime: hoursAfter(5), endTime: hoursAfter(5), quantityProduced: 5 },
            // Neither a voided output nor a zero-quantity shell counts as the end.
            { productionOrderId: 'WO-OUT', startTime: hoursAfter(9), endTime: hoursAfter(9), quantityProduced: 5, status: 'VOIDED' },
            { productionOrderId: 'WO-OUT', startTime: start, endTime: hoursAfter(20), quantityProduced: 0 },
            { productionOrderId: 'WO-CANCEL', startTime: start, endTime: hoursAfter(2), quantityProduced: 5 },
        ],
    });
}

const snapshot = async () =>
    Object.fromEntries(
        (await db!.productionOrder.findMany({ select: { id: true, actualEndDate: true, updatedAt: true } }))
            .map((order) => [order.id, { end: order.actualEndDate?.toISOString() ?? null, updatedAt: order.updatedAt.toISOString() }]),
    );

describe.skipIf(!db)('order end-date backfill PostgreSQL contracts', () => {
    beforeEach(async () => {
        await seed(db!);
    });
    afterAll(async () => {
        await db?.$disconnect();
    });

    it('dry-runs read-only with the last real output, else updatedAt', async () => {
        const before = await snapshot();

        const plan = await previewOrderEndDates(db!, request);

        expect(plan.orders.map((order) => [order.orderNumber, order.actualEndDate, order.source])).toEqual([
            ['WO-NONE', before['WO-NONE'].updatedAt, 'FALLBACK'],
            ['WO-OUT', hoursAfter(5).toISOString(), 'OUTPUT'],
        ]);
        expect(await snapshot()).toEqual(before);
    });

    it('fills only still-empty COMPLETED SPKs once, keeps updatedAt and audits atomically', async () => {
        const before = await snapshot();
        const journalsBefore = await db!.journalEntry.count();
        const plan = await previewOrderEndDates(db!, request);
        const input = { ...request, fingerprint: plan.fingerprint };

        const applied = await applyOrderEndDates(db!, input, async () => 'synthetic-evidence');

        const after = await snapshot();
        expect(applied).toMatchObject({ orders: 2, fallback: 1 });
        expect(after['WO-OUT']).toEqual({ end: hoursAfter(5).toISOString(), updatedAt: before['WO-OUT'].updatedAt });
        expect(after['WO-NONE']).toEqual({ end: before['WO-NONE'].updatedAt, updatedAt: before['WO-NONE'].updatedAt });
        expect(after['WO-DATED']).toEqual({ ...before['WO-DATED'], end: dated.toISOString() });
        expect(after['WO-CANCEL']).toEqual(before['WO-CANCEL']);
        expect(after['WO-RUN']).toEqual(before['WO-RUN']);
        expect(await db!.auditLog.count({ where: { action: 'BACKFILL_ORDER_END_DATES', dedupeKey: `BACKFILL_ORDER_END_DATES:${plan.fingerprint}` } })).toBe(1);
        expect(await db!.journalEntry.count()).toBe(journalsBefore);

        await expect(applyOrderEndDates(db!, input, async () => 'again')).rejects.toThrow('dry-run');
        const remaining = await previewOrderEndDates(db!, request);
        expect(remaining.orders).toEqual([]);
        await expect(
            applyOrderEndDates(db!, { ...request, fingerprint: remaining.fingerprint }, async () => 'again'),
        ).rejects.toThrow('missing an end date');
        expect(await db!.auditLog.count({ where: { action: 'BACKFILL_ORDER_END_DATES' } })).toBe(1);
    });

    it('refuses a plan that changed after review and writes nothing', async () => {
        const plan = await previewOrderEndDates(db!, request);
        await db!.productionOrder.update({ where: { id: 'WO-NONE' }, data: { notes: 'touched after review' } });
        const before = await snapshot();

        await expect(
            applyOrderEndDates(db!, { ...request, fingerprint: plan.fingerprint }, async () => 'evidence'),
        ).rejects.toThrow('dry-run');

        expect(await snapshot()).toEqual(before);
        expect(await db!.auditLog.count()).toBe(0);
    });
});
