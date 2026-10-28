import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PrismaClient } from '@prisma/client';
import * as audit from '@/lib/tools/audit';
import { tenantContext } from '@/lib/core/prisma';
import { runWithActor } from '@/lib/core/actor-context';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { ProductionExecutionService } from '../execution-service';

const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = url ? returnTestClient(url) : null;
const otherUrl = url ? new URL(url) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;
const actor = 'scrap-void-actor';
const at = new Date('2026-01-01T00:00:00Z');
async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "Location", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: actor, email: 'scrap-void@example.invalid', password: 'synthetic-only', role: 'PRODUCTION' } });
    await client.location.createMany({ data: [
        { id: 'store', name: 'Synthetic scrap', slug: 'synthetic-scrap' },
        { id: 'fg-store', name: 'Synthetic output', slug: 'synthetic-output' },
        { id: 'destination', name: 'Synthetic destination', slug: 'synthetic-destination' },
    ] });
    await client.product.createMany({ data: [
        { id: 'scrap-product', name: 'Synthetic scrap', productType: 'SCRAP' },
        { id: 'fg-product', name: 'Synthetic output', productType: 'FINISHED_GOOD' },
    ] });
    for (const id of ['scrap', 'fg']) await client.productVariant.create({ data: {
        id, productId: `${id}-product`, name: `Synthetic ${id}`, skuCode: `SCRAP-VOID-${id}`, primaryUnit: 'KG',
    } });
    await client.bom.create({ data: { id: 'bom', name: 'Synthetic zero-cost recipe', productVariantId: 'fg', outputQuantity: 1 } });
    for (const [key, scrapQty, outputQty, offset] of [['a', 2, 10, 0], ['b', 3, 8, 60000]] as const) {
        const time = new Date(at.getTime() + offset);
        await client.productionOrder.create({ data: {
            id: `order-${key}`, orderNumber: `SCRAP-VOID-${key}`, bomId: 'bom', locationId: 'fg-store',
            plannedStartDate: time, plannedQuantity: outputQty, actualQuantity: outputQty, status: 'COMPLETED',
        } });
        await client.productionExecution.create({ data: {
            id: `execution-${key}`, productionOrderId: `order-${key}`, startTime: time, endTime: time,
            createdAt: time, quantityProduced: outputQty, scrapQuantity: scrapQty, status: 'COMPLETED',
        } });
        // Zero allocated costs are legitimate when no posted WIP remains.
        await client.stockMovement.createMany({ data: [
            { id: `receipt-${key}`, type: 'IN', productVariantId: 'scrap', toLocationId: 'store', quantity: scrapQty,
                cost: 0, productionOrderId: `order-${key}`, productionExecutionId: `execution-${key}`, companyOwned: true, createdAt: time },
            { id: `output-${key}`, type: 'IN', productVariantId: 'fg', toLocationId: 'fg-store', quantity: outputQty,
                cost: 0, productionOrderId: `order-${key}`, productionExecutionId: `execution-${key}`, companyOwned: true, createdAt: time },
        ] });
        await client.scrapRecord.create({ data: { id: `scrap-${key}`, productionOrderId: `order-${key}`, productionExecutionId: `execution-${key}`,
            productVariantId: 'scrap', locationId: 'store', quantity: scrapQty } });
    }
    await client.inventory.createMany({ data: [
        { id: 'scrap-stock', productVariantId: 'scrap', locationId: 'store', quantity: 5, averageCost: 0 },
        { id: 'fg-stock', productVariantId: 'fg', locationId: 'fg-store', quantity: 18, averageCost: 0 },
    ] });
}
const run = <T>(client: PrismaClient, fn: () => Promise<T>) => tenantContext.run(client, () => runWithActor(actor, fn));
const voidOutput = (key: string) => run(db!, () => ProductionExecutionService.voidExecution(`execution-${key}`, actor));
const qty = async (id: string) => Number((await db!.inventory.findUniqueOrThrow({ where: { id } })).quantity);

describe.skipIf(!db)('zero-cost receipt reversal PostgreSQL contracts', () => {
    beforeEach(async () => { await seed(db!); });
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

    it('voids output B then A without mistaking B reversals for consumption, and rejects a concurrent duplicate', async () => {
        await voidOutput('b');
        expect(await qty('scrap-stock')).toBe(2);
        const results = await Promise.allSettled([voidOutput('a'), voidOutput('a')]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        expect(await qty('scrap-stock')).toBe(0);
        expect(await qty('fg-stock')).toBe(0);
        expect(await db!.productionExecution.count({ where: { status: 'VOIDED' } })).toBe(2);
        expect(await db!.productionOrder.count({ where: { actualQuantity: 0, status: 'DRAFT' } })).toBe(2);
        expect(await db!.stockMovement.count({ where: { reversalOfId: { not: null } } })).toBe(4);
        expect(await db!.scrapRecord.count()).toBe(0);
        expect(await db!.auditLog.count({ where: { action: 'VOID_PRODUCTION_EXECUTION' } })).toBe(2);
        expect(await db!.inventory.count({ where: { averageCost: { not: 0 } } })).toBe(0);
    });

    it.each(['OUT', 'TRANSFER'] as const)('does not hide real %s behind a valid receipt reversal; rolls back earlier output changes', async type => {
        await voidOutput('b');
        await db!.stockMovement.create({ data: { id: 'zz-real-consumption', type, productVariantId: 'scrap',
            fromLocationId: 'store', toLocationId: type === 'TRANSFER' ? 'destination' : null,
            quantity: 1, cost: 0, createdAt: new Date(), reference: 'Synthetic downstream' } });
        // A replenishment leaves enough physical stock; history must still block.
        await db!.stockMovement.create({ data: { type: 'IN', productVariantId: 'scrap', toLocationId: 'store', quantity: 1, cost: 0 } });
        await expect(voidOutput('a')).rejects.toThrow('dipindahkan/digunakan');
        expect(await qty('scrap-stock')).toBe(2);
        expect(await qty('fg-stock')).toBe(10);
        expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: 'execution-a' } })).status).toBe('COMPLETED');
        expect(await db!.stockMovement.count({ where: { reversalOfId: { in: ['receipt-a', 'output-a'] } } })).toBe(0);
        expect(await db!.auditLog.count({ where: { action: 'VOID_PRODUCTION_EXECUTION', entityId: 'execution-a' } })).toBe(0);
    });

    it('does not accept a source-linked reversal whose quantity no longer matches', async () => {
        await voidOutput('b');
        await db!.stockMovement.update({ where: { reversalOfId: 'receipt-b' }, data: { quantity: 1 } });
        await expect(voidOutput('a')).rejects.toThrow('dipindahkan/digunakan');
        expect(await qty('scrap-stock')).toBe(2);
        expect(await qty('fg-stock')).toBe(10);
    });

    it('rolls back the newly allowed void if its atomic audit fails', async () => {
        await voidOutput('b');
        const original = audit.logActivity;
        const failure = vi.spyOn(audit, 'logActivity').mockImplementation(async params => {
            if (params.action === 'VOID_PRODUCTION_EXECUTION' && params.entityId === 'execution-a') throw new Error('Synthetic audit failure');
            return original(params);
        });
        try { await expect(voidOutput('a')).rejects.toThrow('Synthetic audit failure'); }
        finally { failure.mockRestore(); }
        expect(await qty('scrap-stock')).toBe(2);
        expect(await qty('fg-stock')).toBe(10);
        expect(await db!.scrapRecord.count({ where: { productionExecutionId: 'execution-a' } })).toBe(1);
        expect((await db!.productionOrder.findUniqueOrThrow({ where: { id: 'order-a' } })).actualQuantity?.toString()).toBe('10');
        expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: 'execution-a' } })).status).toBe('COMPLETED');
        expect(await db!.stockMovement.count({ where: { reversalOfId: { in: ['receipt-a', 'output-a'] } } })).toBe(0);
    });

    it('keeps another tenant with the same IDs untouched', async () => {
        await seed(other!);
        await voidOutput('b');
        await voidOutput('a');
        expect(Number((await other!.inventory.findUniqueOrThrow({ where: { id: 'scrap-stock' } })).quantity)).toBe(5);
        expect(await other!.productionExecution.count({ where: { status: 'COMPLETED' } })).toBe(2);
        expect(await other!.stockMovement.count({ where: { reversalOfId: { not: null } } })).toBe(0);
    });
});
