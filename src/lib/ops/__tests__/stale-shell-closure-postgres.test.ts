import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';
import {
    applyStaleShellClosure,
    previewStaleShellClosure,
    type StaleShellRequest,
} from '../stale-shell-closure';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;

const start = new Date('2026-10-06T08:00:00.000Z');
const hoursAfter = (hours: number) =>
    new Date(start.getTime() + hours * 3_600_000);
const request: StaleShellRequest = {
    tenant: 'synthetic',
    database: 'polyflow_return_credit_scope_test',
    actorId: 'stale-actor',
    reason: 'Synthetic stale shell closure',
    atLastOutput: true,
    zeroHourOrderNumbers: ['WO-ZERO'],
};

async function order(
    client: PrismaClient,
    id: string,
    status: 'COMPLETED' | 'IN_PROGRESS',
    outputAfterHours: number,
) {
    await client.productionOrder.create({
        data: {
            id,
            orderNumber: id,
            bomId: 'bom',
            plannedQuantity: 10,
            plannedStartDate: start,
            locationId: 'loc',
            status,
        },
    });
    await client.productionExecution.createMany({
        data: [
            { id: `${id}-shell`, productionOrderId: id, machineId: 'machine', startTime: start, quantityProduced: 0 },
            {
                id: `${id}-output`,
                productionOrderId: id,
                machineId: 'machine',
                startTime: hoursAfter(outputAfterHours),
                endTime: hoursAfter(outputAfterHours),
                quantityProduced: 5,
            },
        ],
    });
}

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    // Dedicated disposable CI database only, verified by identity + marker.
    await client.$executeRaw`TRUNCATE "Product", "Location", "Machine", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'stale-actor', email: 'stale@example.invalid', password: 'synthetic-only', role: 'ADMIN' } });
    await client.product.create({ data: { id: 'p', name: 'Synthetic Product', productType: 'FINISHED_GOOD' } });
    await client.productVariant.create({ data: { id: 'v', productId: 'p', name: 'Synthetic Variant', skuCode: 'STALE-TEST', primaryUnit: 'KG' } });
    await client.bom.create({ data: { id: 'bom', productVariantId: 'v', name: 'Synthetic recipe' } });
    await client.location.create({ data: { id: 'loc', name: 'Synthetic WIP', slug: 'synthetic-wip' } });
    await client.machine.create({ data: { id: 'machine', name: 'Synthetic machine', code: 'SYN-01', type: 'EXTRUDER', locationId: 'loc' } });
    await order(client, 'WO-LAST', 'COMPLETED', 5);
    await order(client, 'WO-ZERO', 'COMPLETED', 3);
    await order(client, 'WO-RUN', 'IN_PROGRESS', 2);
}

const shellEnds = async () =>
    Object.fromEntries(
        (await db!.productionExecution.findMany({ where: { id: { endsWith: '-shell' } }, select: { id: true, endTime: true } }))
            .map((shell) => [shell.id, shell.endTime?.toISOString() ?? null]),
    );

describe.skipIf(!db)('stale shell closure PostgreSQL contracts', () => {
    beforeEach(async () => {
        await seed(db!);
    });
    afterAll(async () => {
        await db?.$disconnect();
    });

    it('dry-runs read-only and plans last output except for the zero-hour SPK', async () => {
        const plan = await previewStaleShellClosure(db!, request);

        expect(plan.shells.map((shell) => [shell.orderNumber, shell.plannedEndTime])).toEqual([
            ['WO-LAST', hoursAfter(5).toISOString()],
            ['WO-ZERO', start.toISOString()],
        ]);
        expect(plan.totals).toEqual({ orders: 2, shells: 2, withHours: 1, hours: 5 });
        expect(await shellEnds()).toEqual({ 'WO-LAST-shell': null, 'WO-ZERO-shell': null, 'WO-RUN-shell': null });
    });

    it('applies the reviewed plan once with one audit row and leaves running SPKs alone', async () => {
        const plan = await previewStaleShellClosure(db!, request);
        const input = { ...request, fingerprint: plan.fingerprint };

        const applied = await applyStaleShellClosure(db!, input, async () => 'synthetic-evidence');

        expect(applied.totals.shells).toBe(2);
        expect(await shellEnds()).toEqual({
            'WO-LAST-shell': hoursAfter(5).toISOString(),
            'WO-ZERO-shell': start.toISOString(),
            'WO-RUN-shell': null,
        });
        expect(await db!.auditLog.count({ where: { action: 'CLOSE_STALE_SHELLS', dedupeKey: `CLOSE_STALE_SHELLS:${plan.fingerprint}` } })).toBe(1);
        expect(await db!.stockMovement.count()).toBe(0);
        expect(await db!.journalEntry.count()).toBe(0);
        await expect(applyStaleShellClosure(db!, input, async () => 'again')).rejects.toThrow('dry-run');
        expect((await previewStaleShellClosure(db!, request)).shells).toEqual([]);
    });

    it('refuses a plan that changed after review and writes nothing', async () => {
        const plan = await previewStaleShellClosure(db!, request);
        await db!.productionExecution.update({ where: { id: 'WO-LAST-shell' }, data: { notes: 'touched after review' } });

        await expect(
            applyStaleShellClosure(db!, { ...request, fingerprint: plan.fingerprint }, async () => 'evidence'),
        ).rejects.toThrow('dry-run');

        expect(await shellEnds()).toEqual({ 'WO-LAST-shell': null, 'WO-ZERO-shell': null, 'WO-RUN-shell': null });
        expect(await db!.auditLog.count()).toBe(0);
    });
});
