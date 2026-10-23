import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { MaterialOrderService } from '../material-order-service';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const otherUrl = connection ? new URL(connection) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;
const run = <T>(fn: () => Promise<T>) => tenantContext.run(db!, fn);
const input = () => ({ orderType: 'HD', clientRequestId: randomUUID(), items: [{ productVariantId: 'mo-material', quantity: 10 }] });

async function seed(client: NonNullable<typeof db>) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "User", "AuditLog" CASCADE`;
    await client.user.createMany({ data: [{ id: 'mo-author', email: 'author@example.invalid', password: 'synthetic-only', role: 'PRODUCTION' }, { id: 'mo-manager', email: 'manager@example.invalid', password: 'synthetic-only', role: 'FACTORY_MANAGER' }] });
    await client.product.create({ data: { id: 'mo-product', name: 'Synthetic material', productType: 'RAW_MATERIAL' } });
    await client.productVariant.create({ data: { id: 'mo-material', productId: 'mo-product', name: 'Synthetic variant', skuCode: 'MO-TEST', primaryUnit: 'KG' } });
}

describe.skipIf(!db)('material order snapshot and mobile lifecycle PostgreSQL contract', () => {
    beforeEach(async () => { await seed(db!); });
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

    it('captures server base unit once and retains legacy unknown units', async () => {
        const request = input();
        const created = await run(() => MaterialOrderService.create(request, 'mo-author'));
        let item = await db!.materialOrderItem.findFirstOrThrow({ where: { materialOrderId: created.id } });
        expect(item.quantityUnit).toBe('KG');
        expect(Number(item.quantity)).toBe(10);
        await db!.productVariant.update({ where: { id: 'mo-material' }, data: { primaryUnit: 'PCS' } });
        const retry = await run(() => MaterialOrderService.create(request, 'mo-author'));
        expect(retry.id).toBe(created.id);
        item = await db!.materialOrderItem.findFirstOrThrow({ where: { materialOrderId: created.id } });
        expect(item.quantityUnit).toBe('KG');
        await db!.materialOrderItem.update({ where: { id: item.id }, data: { quantityUnit: null } });
        const legacy = await run(() => MaterialOrderService.getById(created.id));
        expect(legacy.items[0].quantityUnit).toBeNull();
    });
    it('requires creator submit and retries without duplicating transition/audit', async () => {
        const created = await run(() => MaterialOrderService.create(input(), 'mo-author'));
        await expect(run(() => MaterialOrderService.submit(created.id, 'mo-manager'))).rejects.toThrow('pembuat');
        expect((await run(() => MaterialOrderService.submit(created.id, 'mo-author'))).idempotent).toBe(false);
        expect((await run(() => MaterialOrderService.submit(created.id, 'mo-author'))).idempotent).toBe(true);
        expect(await db!.auditLog.count({ where: { entityId: created.id, action: 'SUBMIT_MATERIAL_ORDER' } })).toBe(1);
    });
    it('allows only one competing review and writes one atomic review audit', async () => {
        const created = await run(() => MaterialOrderService.create(input(), 'mo-author'));
        await run(() => MaterialOrderService.submit(created.id, 'mo-author'));
        const results = await Promise.allSettled([
            run(() => MaterialOrderService.approve(created.id, 'mo-manager')),
            run(() => MaterialOrderService.reject(created.id, 'mo-manager', 'Bahan tidak sesuai')),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(await db!.auditLog.count({ where: { entityId: created.id, action: { in: ['APPROVE_MATERIAL_ORDER', 'REJECT_MATERIAL_ORDER'] } } })).toBe(1);
        expect(await db!.stockMovement.count()).toBe(0);
    });
    it('rolls back review when its actor FK fails', async () => {
        const created = await run(() => MaterialOrderService.create(input(), 'mo-author'));
        await run(() => MaterialOrderService.submit(created.id, 'mo-author'));
        await expect(run(() => MaterialOrderService.approve(created.id, 'missing-actor'))).rejects.toThrow();
        expect((await db!.materialOrder.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('PENDING');
        expect(await db!.auditLog.count({ where: { entityId: created.id, action: 'APPROVE_MATERIAL_ORDER' } })).toBe(0);
    });
    it('rejects foreign materials and isolates identical ids between tenants', async () => {
        await seed(other!);
        const created = await run(() => MaterialOrderService.create(input(), 'mo-author'));
        await expect(tenantContext.run(other!, () => MaterialOrderService.getById(created.id))).rejects.toThrow();
        await expect(run(() => MaterialOrderService.create({ ...input(), items: [{ productVariantId: 'foreign', quantity: 1 }] }, 'mo-author'))).rejects.toThrow('Bahan');
        expect(await db!.materialOrder.count()).toBe(1);
        expect(await other!.materialOrder.count()).toBe(0);
    });
    it.each([false, true])('applies exact nullable migration on populated=%s without backfill', async (populated) => {
        const schema = 'mo_migration_' + randomUUID().replaceAll('-', '');
        const migration = readFileSync('prisma/migrations/20261023_material_order_unit_snapshot/migration.sql', 'utf8');
        await db!.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe('CREATE TYPE "Unit" AS ENUM (\'KG\', \'PCS\')');
            await tx.$executeRawUnsafe('CREATE TABLE "MaterialOrderItem" ("id" text PRIMARY KEY, "quantity" numeric NOT NULL)');
            if (populated) await tx.$executeRawUnsafe('INSERT INTO "MaterialOrderItem" VALUES (\'legacy\', 12)');
            await tx.$executeRawUnsafe(migration);
            const rows = await tx.$queryRawUnsafe<{ quantityUnit: string | null }[]>('SELECT "quantityUnit" FROM "MaterialOrderItem"');
            expect(rows).toEqual(populated ? [{ quantityUnit: null }] : []);
            await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        });
    });
});
