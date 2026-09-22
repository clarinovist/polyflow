import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { updateOrderCustomers, updateOrderCustomersInTransaction } from '../order-customer-service';
import { ProductionOrderService } from '../order-service';
import { QualityStandardService } from '../quality-standard-service';
import { tenantContext } from '@/lib/core/prisma';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const otherUrl = connection ? new URL(connection) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    // Dedicated disposable CI databases only, verified by identity + marker.
    await client.$executeRaw`TRUNCATE "Product", "Customer", "Location", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'spk-actor', email: 'spk@example.invalid', password: 'synthetic-only', role: 'PLANNING' } });
    await client.customer.createMany({ data: [{ id: 'a', name: 'Synthetic A' }, { id: 'b', name: 'Synthetic B' }] });
    await client.product.create({ data: { id: 'p', name: 'Synthetic Product', productType: 'FINISHED_GOOD' } });
    await client.productVariant.create({ data: { id: 'v', productId: 'p', name: 'Synthetic Variant', skuCode: 'SPK-TEST', primaryUnit: 'KG' } });
    await client.bom.create({ data: { id: 'bom', productVariantId: 'v', name: 'Synthetic recipe' } });
    await client.location.create({ data: { id: 'loc', name: 'Synthetic FG', slug: 'finished-goods', locationPurpose: 'FINISHED_GOOD' } });
    await client.productionOrder.create({ data: { id: 'wo', orderNumber: 'WO-SYNTHETIC', bomId: 'bom', plannedQuantity: 10, plannedStartDate: new Date(), locationId: 'loc', status: 'IN_PROGRESS' } });
}
const save = (ids: string[]) => db!.$transaction((tx) => updateOrderCustomersInTransaction(tx, { orderId: 'wo', customerIds: ids }, 'spk-actor'));

describe.skipIf(!db)('SPK context PostgreSQL contracts', () => {
    beforeEach(async () => { await seed(db!); });
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

    it('creates multi-customer links atomically through the actual create-order service', async () => {
        const order = await db!.$transaction((tx) => ProductionOrderService.createOrder({
            orderNumber: 'WO-CREATE', notes: '', bomId: 'bom', plannedQuantity: 2, plannedStartDate: new Date(), locationId: 'loc',
            isMaklon: false, estimatedConversionCost: 0, items: [], customerIds: ['a', 'b', 'a'],
        }, tx));
        expect(await db!.productionOrderCustomer.count({ where: { productionOrderId: order.id } })).toBe(2);
        await expect(db!.$transaction((tx) => ProductionOrderService.createOrder({
            orderNumber: 'WO-INVALID', notes: '', bomId: 'bom', plannedQuantity: 2, plannedStartDate: new Date(), locationId: 'loc',
            isMaklon: false, estimatedConversionCost: 0, items: [], customerIds: ['foreign'],
        }, tx))).rejects.toThrow('tenant');
        expect(await db!.productionOrder.count({ where: { orderNumber: 'WO-INVALID' } })).toBe(0);
    });
    it('replaces and clears links with atomic audit and rejects foreign ids', async () => {
        await save(['a', 'b', 'a']);
        expect(await db!.productionOrderCustomer.count()).toBe(2);
        expect(await db!.auditLog.count({ where: { action: 'UPDATE_ORDER_CUSTOMERS' } })).toBe(1);
        await expect(save(['foreign'])).rejects.toThrow('tenant');
        expect(await db!.productionOrderCustomer.count()).toBe(2);
        await expect(db!.$transaction(async (tx) => {
            await updateOrderCustomersInTransaction(tx, { orderId: 'wo', customerIds: ['a'] }, 'spk-actor');
            throw new Error('rollback');
        })).rejects.toThrow('rollback');
        expect(await db!.productionOrderCustomer.count()).toBe(2);
        expect(await db!.auditLog.count()).toBe(1);
        await save([]);
        expect(await db!.productionOrderCustomer.count()).toBe(0);
        expect(await db!.stockMovement.count()).toBe(0);
    });
    it('serializes concurrent edits and rejects terminal orders', async () => {
        await Promise.all([save(['a']), save(['b'])]);
        expect(await db!.productionOrderCustomer.count()).toBe(1);
        await db!.productionOrder.update({ where: { id: 'wo' }, data: { status: 'COMPLETED' } });
        await expect(save([])).rejects.toThrow('tidak bisa');
        expect(await db!.productionOrderCustomer.count()).toBe(1);
    });
    it('enforces uniqueness and FKs, retaining customer and cascading only order links', async () => {
        await save(['a']);
        await expect(db!.productionOrderCustomer.create({ data: { productionOrderId: 'wo', customerId: 'a' } })).rejects.toMatchObject({ code: 'P2002' });
        await expect(db!.customer.delete({ where: { id: 'a' } })).rejects.toMatchObject({ code: 'P2003' });
        await db!.productionOrder.delete({ where: { id: 'wo' } });
        expect(await db!.productionOrderCustomer.count()).toBe(0);
        expect(await db!.customer.count()).toBe(2);
    });
    it('isolates standards per tenant and keeps existing kiosk requirements', async () => {
        await seed(other!);
        const required = await db!.qualityCheckParameter.create({ data: { productVariantId: 'v', name: 'Length', unit: 'cm', minValue: 1, maxValue: 2 } });
        expect(required.requireMeasurement).toBe(true);
        await db!.qualityCheckParameter.create({ data: { productVariantId: 'v', name: 'Weight', unit: 'g/m', minValue: 11.5, maxValue: 12, requireMeasurement: false } });
        const run = <T>(client: PrismaClient, fn: () => Promise<T>) => tenantContext.run(client, fn);
        const [all, kiosk, foreign] = await Promise.all([
            run(db!, () => QualityStandardService.listByVariant('v')),
            run(db!, () => QualityStandardService.listByVariant('v', true)),
            run(other!, () => QualityStandardService.listByVariant('v')),
        ]);
        expect(all).toHaveLength(2);
        expect(kiosk.map((p) => p.id)).toEqual([required.id]);
        expect(foreign).toEqual([]);
        await tenantContext.run(db!, () => updateOrderCustomers({ orderId: 'wo', customerIds: ['a'] }, 'spk-actor'));
        expect(await db!.productionOrderCustomer.count()).toBe(1);
        expect(await other!.productionOrderCustomer.count()).toBe(0);
    });
    it('serializes partial quality-range edits against fresh bounds', async () => {
        const parameter = await db!.qualityCheckParameter.create({ data: { productVariantId: 'v', name: 'Weight', unit: 'g/m', minValue: 0, maxValue: 10 } });
        const outcomes = await tenantContext.run(db!, () => Promise.allSettled([
            QualityStandardService.update({ id: parameter.id, minValue: 8 }),
            QualityStandardService.update({ id: parameter.id, maxValue: 5 }),
        ]));
        const reasons = outcomes.filter((r) => r.status === 'rejected').map((r) => r.reason instanceof Error ? r.reason.message : String(r.reason));
        expect(outcomes.filter((r) => r.status === 'fulfilled'), reasons.join('\n')).toHaveLength(1);
        const stored = await db!.qualityCheckParameter.findUniqueOrThrow({ where: { id: parameter.id } });
        expect(Number(stored.minValue)).toBeLessThanOrEqual(Number(stored.maxValue));
    });
    it.each([false, true])('replays full additive SQL on populated=%s pre-feature tables', async (populated) => {
        const schema = `spk_migration_${randomUUID().replaceAll('-', '')}`;
        const migration = readFileSync('prisma/migrations/20260922_spk_customers_quality/migration.sql', 'utf8');
        await db!.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe('CREATE TABLE "QualityCheckParameter" ("id" text PRIMARY KEY)');
            await tx.$executeRawUnsafe('CREATE TABLE "ProductionOrder" ("id" text PRIMARY KEY)');
            await tx.$executeRawUnsafe('CREATE TABLE "Customer" ("id" text PRIMARY KEY)');
            if (populated) await tx.$executeRawUnsafe('INSERT INTO "QualityCheckParameter" ("id") VALUES (\'legacy\')');
            for (const statement of migration.split(';').filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
            const rows = await tx.$queryRawUnsafe<{ requireMeasurement: boolean }[]>('SELECT "requireMeasurement" FROM "QualityCheckParameter"');
            expect(rows).toEqual(populated ? [{ requireMeasurement: true }] : []);
            await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        });
    });
});
