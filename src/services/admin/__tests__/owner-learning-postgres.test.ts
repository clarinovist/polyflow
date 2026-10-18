import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DAY_MS, jakartaDayStart } from '@/lib/learning/contracts';
import { ownerSnapshotSchema } from '@/lib/learning/owner-contracts';
const connection = process.env.ASSISTANT_TEST_MAIN_DATABASE_URL;
let main: PrismaClient;
const clients = new Map<string, PrismaClient>();
if (connection) {
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.port !== '55440' || url.pathname !== '/polyflow_assistant_main_test' || url.search) throw new Error('Only disposable assistant CI PostgreSQL allowed');
    main = new PrismaClient({ datasources: { db: { url: connection } } });
    for (const suffix of ['a', 'b']) {
        const target = new URL(connection); target.pathname = `/polyflow_assistant_tenant_${suffix}_test`;
        clients.set(target.toString(), new PrismaClient({ datasources: { db: { url: target.toString() } } }));
    }
}
vi.mock('@/lib/core/prisma', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    return { getMainPrisma: () => main, getTenantDb: (url: string) => { const db = clients.get(url); if (!db) throw new Error('Unallowlisted test DB'); return db; }, tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() };
});
import { runOwnerLearning } from '../owner-learning.service';
const suffix = randomUUID();
const owner = `owner-${suffix}`;
const user = `account-${suffix}`;
const customer = `customer-${suffix}`;
const variant = `variant-${suffix}`;
const product = `product-${suffix}`;
const location = `location-${suffix}`;
const order = `order-${suffix}`;
const tenantIds = [`tenant-a-${suffix}`, `tenant-b-${suffix}`];
const now = new Date();
const today = jakartaDayStart(now);
const start = new Date(today.getTime() - DAY_MS);
const eventTime = new Date(start.getTime() + 1000);
const policyVersion = `policy-${suffix}`;

describe.skipIf(!connection)('owner insight PostgreSQL and isolation', () => {
    beforeAll(async () => {
        for (const [key, value] of Object.entries({ OWNER_LEARNING_ENABLED: 'true', OWNER_LEARNING_USER_ID: owner, OWNER_LEARNING_TENANT_IDS: tenantIds.join(','), OWNER_LEARNING_POLICY_VERSION: policyVersion, OWNER_LEARNING_ACTIVE_FROM: start.toISOString(), OWNER_LEARNING_SCOPE: 'private-owner-usage-commerce' })) vi.stubEnv(key, value);
        await main.user.create({ data: { id: owner, name: 'Synthetic owner', email: `${owner}@example.invalid`, password: 'not-a-login', isSuperAdmin: true } });
        let index = 0;
        for (const [url, db] of clients) {
            const tenantId = tenantIds[index];
            await main.tenant.create({ data: { id: tenantId, name: 'Synthetic tenant', subdomain: `owner-${index}-${suffix}`, dbUrl: url, modules: { create: { moduleKey: 'SALES' } } } });
            await db.user.create({ data: { id: user, name: `Account ${index}`, email: `${user}@example.invalid`, password: 'not-a-login', role: 'SALES' } });
            await db.customer.create({ data: { id: customer, name: 'Same customer name', province: 'Province', city: `City ${index}`, phone: 'PRIVATE-POISON', notes: 'PRIVATE-NOTES' } });
            await db.product.create({ data: { id: product, name: 'Synthetic product', productType: 'FINISHED_GOOD' } });
            await db.productVariant.create({ data: { id: variant, productId: product, name: 'Synthetic variant', skuCode: variant, primaryUnit: 'KG', salesUnit: 'ROLL', conversionFactor: 10 } });
            await db.location.create({ data: { id: location, name: 'Synthetic warehouse', slug: location, locationType: 'INTERNAL' } });
            await db.salesOrder.create({ data: { id: order, orderNumber: order, customerId: customer, orderDate: eventTime, createdAt: eventTime, status: 'READY_TO_SHIP', totalAmount: index === 0 ? 100 : 200, orderType: 'MAKE_TO_STOCK', priceStatus: 'FINAL', items: { create: [
                { productVariantId: variant, quantity: 20, unitPrice: 5, subtotal: 100, enteredQuantity: 2, enteredUnit: 'ROLL', enteredUnitPrice: 50, conversionFactorSnapshot: 10, ppnMode: 'INCLUDE', taxPercent: 11 },
                { productVariantId: variant, quantity: 2, unitPrice: 0, subtotal: 0, isFreeItem: true },
            ] } } });
            for (const status of ['DRAFT', 'QUOTATION', 'CANCELLED'] as const) await db.salesOrder.create({ data: { id: `${order}-${status}`, orderNumber: `${order}-${status}`, customerId: customer, orderDate: eventTime, createdAt: eventTime, status, totalAmount: 999 } });
            await db.deliveryOrder.create({ data: { id: `do-${order}`, orderNumber: `do-${order}`, salesOrderId: order, sourceLocationId: location, status: 'SHIPPED', stockCommittedAt: eventTime, createdAt: eventTime, items: { create: { productVariantId: variant, quantity: index === 0 ? 3 : 7 } } } });
            await db.stockMovement.create({ data: { id: `source-${order}`, productVariantId: variant, type: 'OUT', quantity: 3, fromLocationId: location } });
            await db.salesReturn.create({ data: { id: `return-${order}`, returnNumber: `return-${order}`, salesOrderId: order, customerId: customer, returnLocationId: location, status: 'RECEIVED', items: { create: { id: `return-item-${order}`, productVariantId: variant, returnedQty: 1, unitPrice: 5, condition: 'DAMAGED', receipt: { create: { sourceMovementId: `source-${order}`, quantity: 1, restockValue: 0, receivedAt: eventTime, createdById: user } } } } } });
            await main.usageEvent.createMany({ data: Array.from({ length: index === 0 ? 2 : 5 }, () => ({ userId: user, tenantId, featureKey: 'sales.orders.list', moduleKey: 'sales', eventType: 'FEATURE_VIEW', sessionId: 'synthetic', occurredAt: eventTime, createdAt: eventTime, metadata: { private: 'PRIVATE-POISON' } })) });
            index++;
        }
    });
    afterAll(async () => {
        if (!main) return;
        await main.ownerLearningRun.deleteMany({ where: { ownerId: owner } });
        await main.usageEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await main.tenantModule.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await main.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        for (const db of clients.values()) {
            await db.salesReturnReceiptLine.deleteMany({ where: { returnItemId: `return-item-${order}` } });
            await db.salesReturnItem.deleteMany({ where: { salesReturnId: `return-${order}` } });
            await db.salesReturn.deleteMany({ where: { id: `return-${order}` } });
            await db.stockMovement.deleteMany({ where: { id: `source-${order}` } });
            await db.deliveryOrderItem.deleteMany({ where: { deliveryOrderId: `do-${order}` } });
            await db.deliveryOrder.deleteMany({ where: { id: `do-${order}` } });
            await db.salesOrderItem.deleteMany({ where: { salesOrderId: order } });
            await db.salesOrder.deleteMany({ where: { id: { startsWith: order } } });
            await db.productVariant.deleteMany({ where: { id: variant } }); await db.product.deleteMany({ where: { id: product } });
            await db.customer.deleteMany({ where: { id: customer } }); await db.location.deleteMany({ where: { id: location } }); await db.user.deleteMany({ where: { id: user } });
            await db.$disconnect();
        }
        await main.user.deleteMany({ where: { id: owner } }); await main.$disconnect(); vi.unstubAllEnvs();
    });
    it('keeps same IDs/names in different tenants separate and uses exact commercial bases', async () => {
        const result = await runOwnerLearning(now);
        expect(result).toEqual({ state: 'COMPLETE', processed: 2 });
        const runs = await main.ownerLearningRun.findMany({ where: { ownerId: owner }, orderBy: { tenantId: 'asc' } });
        expect(runs).toHaveLength(2);
        const [a, b] = runs.map(run => ownerSnapshotSchema.parse(run.summary));
        expect(a.usage[0].views).toBe(2); expect(b.usage[0].views).toBe(5);
        expect(a.customers).toHaveLength(1); expect(a.customers[0]).toMatchObject({ orderCount: 1, status: 'READY_TO_SHIP', orderValue: '100.00' });
        expect(b.customers[0].orderValue).toBe('200.00');
        expect(a.prices[0]).toMatchObject({ quantity: '2.0000', minPrice: '50.00', unit: 'ROLL', basis: 'ENTERED_SNAPSHOT', ppnMode: 'INCLUDE' });
        expect(a.movements.find(row => row.kind === 'DISPATCH')?.quantity).toBe('3.0000'); expect(b.movements.find(row => row.kind === 'DISPATCH')?.quantity).toBe('7.0000');
        expect(a.movements.find(row => row.kind === 'RETURN_RECEIVED')).toMatchObject({ quantity: '1.0000', state: 'DAMAGED' });
        expect(JSON.stringify(runs)).not.toContain('PRIVATE-'); expect(JSON.stringify(runs)).not.toContain('Same customer name');
        expect(a.regions[0].city).toBe('City 0'); expect(b.regions[0].city).toBe('City 1');
        for (const db of clients.values()) expect(await db.ownerLearningRun.count()).toBe(0);
    });
    it('reapplies the missing-history PPN migration without overwriting existing modes', async () => {
        const { readFileSync } = await import('node:fs');
        const { default: pg } = await import('pg');
        const sql = readFileSync('prisma/migrations/20261018_ppn_mode_history/migration.sql', 'utf8');
        for (const [url, db] of clients) {
            const before = await db.salesOrderItem.findMany({ where: { salesOrderId: order }, select: { id: true, ppnMode: true }, orderBy: { id: 'asc' } });
            const client = new pg.Client({ connectionString: url }); await client.connect();
            try { await client.query(sql); } finally { await client.end(); }
            expect(await db.salesOrderItem.findMany({ where: { salesOrderId: order }, select: { id: true, ppnMode: true }, orderBy: { id: 'asc' } })).toEqual(before);
        }
    });
    it('freezes completed snapshots and excludes a removed tenant from subsequent reads/jobs', async () => {
        const before = await main.ownerLearningRun.findMany({ where: { ownerId: owner }, orderBy: { tenantId: 'asc' } });
        await Promise.all([runOwnerLearning(now), runOwnerLearning(now)]);
        expect(await main.ownerLearningRun.findMany({ where: { ownerId: owner }, orderBy: { tenantId: 'asc' } })).toEqual(before);
        vi.stubEnv('OWNER_LEARNING_TENANT_IDS', tenantIds[0]);
        expect((await runOwnerLearning(now)).processed).toBe(1);
        expect(await main.ownerLearningRun.count({ where: { ownerId: owner, tenantId: tenantIds[1] } })).toBe(1);
        vi.stubEnv('OWNER_LEARNING_TENANT_IDS', tenantIds.join(','));
    });
    it('recovers expired claims and keeps raw transactions unchanged', async () => {
        const run = await main.ownerLearningRun.findFirstOrThrow({ where: { ownerId: owner } });
        await main.ownerLearningRun.update({ where: { id: run.id }, data: { state: 'RUNNING', leaseToken: 'old', leaseUntil: new Date(now.getTime() - 1000), summary: undefined } });
        await runOwnerLearning(now);
        expect((await main.ownerLearningRun.findUniqueOrThrow({ where: { id: run.id } })).state).toBe('COMPLETE');
        for (const db of clients.values()) expect((await db.salesOrder.findUniqueOrThrow({ where: { id: order } })).status).toBe('READY_TO_SHIP');
    });
});
