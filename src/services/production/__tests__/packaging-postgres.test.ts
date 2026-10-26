import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { randomUUID } from 'node:crypto';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { runWithActor } from '@/lib/core/actor-context';
import { ProductionExecutionService } from '../execution-service';
import { resolveProductionRecipeVariant } from '../packaging-bom-resolver';
import { InventoryCoreService } from '@/services/inventory/core-service';

const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = url ? returnTestClient(url) : null;
const otherUrl = url ? new URL(url) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;
const actor = 'packaging-test-actor';
async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "Customer", "Location", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: actor, email: 'packaging@example.invalid', password: 'synthetic-only', role: 'PRODUCTION' } });
    await client.customer.createMany({ data: [{ id: 'a', name: 'Synthetic A' }, { id: 'b', name: 'Synthetic B' }] });
    await client.location.createMany({ data: [
        { id: 'fg', name: 'Synthetic output', slug: 'finished-goods' },
        { id: 'custody-a', name: 'Synthetic custody A', slug: 'custody-a', locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'a' },
        { id: 'custody-b', name: 'Synthetic custody B', slug: 'custody-b', locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'b' },
    ] });
    await client.product.createMany({ data: [{ id: 'product', name: 'Synthetic output', productType: 'FINISHED_GOOD' }, { id: 'packaging', name: 'Synthetic packaging', productType: 'PACKAGING' }, { id: 'aux', name: 'Synthetic auxiliary', productType: 'AUXILIARY' }] });
    for (const id of ['base', 'brand-a', 'brand-b']) await client.productVariant.create({ data: { id, name: id, skuCode: `PKG-${id}`, productId: 'product', primaryUnit: 'KG' } });
    await client.productVariant.create({ data: { id: 'label', name: 'Synthetic label', skuCode: 'PKG-LABEL', productId: 'packaging', primaryUnit: 'PCS' } });
    await client.productVariant.create({ data: { id: 'film', name: 'Synthetic film', skuCode: 'PKG-FILM', productId: 'aux', primaryUnit: 'KG' } });
    await client.location.create({ data: { id: 'film-stock', name: 'Synthetic internal film', slug: 'synthetic-film' } });
    await client.inventory.create({ data: { productVariantId: 'film', locationId: 'film-stock', quantity: 5, averageCost: 0 } });
    for (const locationId of ['custody-a', 'custody-b']) await client.inventory.create({ data: { productVariantId: 'label', locationId, quantity: 100, averageCost: 0 } });
    await client.productionPackagingOption.createMany({ data: ['brand-a', 'brand-b'].map((id) => ({ baseVariantId: 'base', outputVariantId: id, labelVariantId: 'label' })) });
    await client.bom.create({ data: { id: 'bom', name: 'Synthetic core recipe', productVariantId: 'base', outputQuantity: 1 } });
    await client.productionOrder.create({ data: {
        id: 'order', orderNumber: 'PKG-ORDER', bomId: 'bom', locationId: 'fg', plannedQuantity: 100, plannedStartDate: new Date(),
        status: 'IN_PROGRESS', estimatedConversionCost: 0, actualQuantity: 0,
        customerDestinations: { create: { customerId: 'a' } },
    } });
    await client.productionShift.create({ data: { id: 'shift', productionOrderId: 'order', shiftName: 'Synthetic', startTime: new Date('2026-10-21T00:00:00Z'), endTime: new Date('2026-10-21T08:00:00Z') } });
}
function payload() {
    return {
        productionOrderId: 'order', shiftId: 'shift', quantityProduced: 24.7, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0,
        startTime: new Date(), endTime: new Date(), userId: actor,
        machineId: undefined, operatorId: undefined, cekGram: undefined, notes: '',
        packagedOutput: { clientRequestId: randomUUID(), groups: [{ productVariantId: 'brand-a', quantity: 24.7,
            packaging: [{ productVariantId: 'label', sourceLocationId: 'custody-a', ownerCustomerId: 'a' as string | null, quantity: 10, unit: 'PCS' as 'PCS' | 'KG' }],
        }] },
    };
}
const run = <T>(client: PrismaClient, fn: () => Promise<T>) => tenantContext.run(client, () => runWithActor(actor, fn));
async function kioskShell() {
    await db!.user.create({ data: { id: 'system', email: 'system@example.invalid', password: 'synthetic-only', role: 'ADMIN', isActive: false } });
    await db!.productionOrder.update({ where: { id: 'order' }, data: { actualPackagingEnabled: true } });
    return db!.productionExecution.create({ data: { productionOrderId: 'order', startTime: new Date(), quantityProduced: 0, scrapQuantity: 0 } });
}
function kioskInput(executionId: string, packagedOutput: ReturnType<typeof payload>['packagedOutput'], shiftId?: string) {
    return {
        executionId, quantityProduced: 24.7, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0, notes: '', shiftId,
        packagedOutput, kioskOperator: { employeeId: 'synthetic-operator', code: 'OP-01' },
    };
}
const custodyLabelStock = async () => Number((await db!.inventory.findFirstOrThrow({ where: { locationId: 'custody-a', productVariantId: 'label' } })).quantity);
const orderActualQuantity = async () => Number((await db!.productionOrder.findUniqueOrThrow({ where: { id: 'order' } })).actualQuantity);
async function openCurrentFiscalPeriod() {
    const date = new Date();
    const year = date.getUTCFullYear(); const month = date.getUTCMonth() + 1;
    await db!.fiscalPeriod.upsert({ where: { year_month: { year, month } }, update: { status: 'OPEN' }, create: {
        year, month, name: 'Synthetic current period', status: 'OPEN', startDate: new Date(Date.UTC(year, month - 1, 1)), endDate: new Date(Date.UTC(year, month, 1)),
    } });
}
describe.skipIf(!db)('actual packaging PostgreSQL contracts', () => {
    beforeEach(async () => { await seed(db!); });
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });
    it('posts actual weight and PCS once for concurrent retry, with brand-specific inventory', async () => {
        const input = payload();
        await run(db!, () => Promise.all([ProductionExecutionService.addProductionOutput(input), ProductionExecutionService.addProductionOutput(input)]));
        expect(await db!.productionExecution.count()).toBe(1);
        expect(await db!.productionOutputGroup.count()).toBe(1);
        expect(await resolveProductionRecipeVariant(db!, 'brand-a')).toBe('base');
        expect(await db!.bom.count()).toBe(1);
        expect(Number((await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'custody-a', productVariantId: 'label' } } })).quantity)).toBe(90);
        expect(Number((await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'fg', productVariantId: 'brand-a' } } })).quantity)).toBe(24.7);
        await expect(db!.$transaction((tx) => InventoryCoreService.validateAndLockStock(tx, 'fg', 'brand-b', 1))).rejects.toThrow();
        expect(await db!.auditLog.count({ where: { action: 'RECORD_PACKAGED_OUTPUT' } })).toBe(1);
    });
    it('consumes existing AUXILIARY film in fractional KG without double BOM consumption and snapshots its unit', async () => {
        await db!.bomItem.create({ data: { bomId: 'bom', productVariantId: 'film', quantity: 1 } });
        const input = payload();
        input.packagedOutput.groups[0].packaging.push({ productVariantId: 'film', sourceLocationId: 'film-stock', ownerCustomerId: null, unit: 'KG', quantity: 1.25 });
        await run(db!, () => ProductionExecutionService.addProductionOutput(input));
        expect(Number((await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'film-stock', productVariantId: 'film' } } })).quantity)).toBe(3.75);
        const filmOut = await db!.stockMovement.findMany({ where: { productVariantId: 'film', type: 'OUT' } });
        expect(filmOut).toHaveLength(1);
        expect(Number(filmOut[0].quantity)).toBe(1.25);
        const consumption = await db!.productionPackagingConsumption.findFirstOrThrow({ where: { productVariantId: 'film' } });
        expect(consumption.unit).toBe('KG');
        expect(Number(consumption.quantity)).toBe(1.25);
        expect((await db!.productionPackagingConsumption.findFirstOrThrow({ where: { productVariantId: 'label' } })).unit).toBe('PCS');
    });
    it('enforces whole PCS but allows fractional KG in stored consumption history', async () => {
        await run(db!, () => ProductionExecutionService.addProductionOutput(payload()));
        const row = await db!.productionPackagingConsumption.findFirstOrThrow({ where: { productVariantId: 'label' } });
        await expect(db!.productionPackagingConsumption.update({ where: { id: row.id }, data: { quantity: 0.5 } })).rejects.toThrow();
        const updated = await db!.productionPackagingConsumption.update({ where: { id: row.id }, data: { unit: 'KG', quantity: 0.5 } });
        expect(updated.unit).toBe('KG');
        await expect(db!.productionPackagingConsumption.update({ where: { id: row.id }, data: { unit: 'PCS' } })).rejects.toThrow();
    });
    it('rolls back all output on shortage or wrong owner', async () => {
        const input = payload(); input.packagedOutput.groups[0].packaging[0].quantity = 101;
        await expect(run(db!, () => ProductionExecutionService.addProductionOutput(input))).rejects.toThrow();
        expect(await db!.productionExecution.count()).toBe(0);
        expect(await db!.stockMovement.count()).toBe(0);
        input.packagedOutput.groups[0].packaging[0].quantity = 10;
        input.packagedOutput.groups[0].packaging[0].sourceLocationId = 'custody-b';
        await expect(run(db!, () => ProductionExecutionService.addProductionOutput(input))).rejects.toThrow();
        expect(await db!.productionExecution.count()).toBe(0);
    });
    it('DB guard prevents cross-owner transfer and legacy consumption bypass', async () => {
        await expect(db!.stockMovement.create({ data: {
            type: 'TRANSFER', productVariantId: 'label', fromLocationId: 'custody-a', toLocationId: 'custody-b', quantity: 1,
            companyOwned: false, packagingOwnerCustomerId: 'a', cost: 0,
        } })).rejects.toThrow();
        await expect(db!.stockMovement.create({ data: { type: 'OUT', productVariantId: 'label', fromLocationId: 'custody-a', quantity: 1 } })).rejects.toThrow();
        await expect(db!.location.update({ where: { id: 'custody-a' }, data: { packagingOwnerCustomerId: 'b' } })).rejects.toThrow();
    });
    it('concurrent void restores exact source once and rejects changed retries', async () => {
        const input = payload();
        await run(db!, () => ProductionExecutionService.addProductionOutput(input));
        const execution = await db!.productionExecution.findFirstOrThrow();
        await openCurrentFiscalPeriod();
        const outcomes = await run(db!, () => Promise.allSettled([
            ProductionExecutionService.voidExecution(execution.id, actor), ProductionExecutionService.voidExecution(execution.id, actor),
        ]));
        expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(Number((await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'custody-a', productVariantId: 'label' } } })).quantity)).toBe(100);
        expect(await db!.stockMovement.count({ where: { reversalOfId: { not: null } } })).toBe(2);
        await expect(run(db!, () => ProductionExecutionService.addProductionOutput(input))).rejects.toThrow();
    });
    it('reconciles mixed own/custody packaging cost, FG value and journals across partial outputs', async () => {
        const stockAccount = randomUUID(); const wipAccount = randomUUID(); const equityAccount = randomUUID();
        await db!.account.createMany({ data: [
            { id: stockAccount, code: `PKG-STOCK-${stockAccount}`, name: 'Synthetic stock', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: wipAccount, code: `PKG-WIP-${wipAccount}`, name: 'Synthetic WIP', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: equityAccount, code: `PKG-EQUITY-${equityAccount}`, name: 'Synthetic equity', type: 'EQUITY', category: 'CAPITAL' },
        ] });
        const [year, month] = toBusinessDateString(new Date()).split('-').map(Number);
        await db!.fiscalPeriod.upsert({ where: { year_month: { year, month } }, update: { status: 'OPEN' }, create: {
            year, month, name: 'Synthetic period', startDate: new Date(Date.UTC(year, month - 1, 1)), endDate: new Date(Date.UTC(year, month, 1)),
        } });
        await db!.product.updateMany({ where: { id: { in: ['product', 'packaging'] } }, data: { inventoryAccountId: stockAccount, wipAccountId: wipAccount } });
        await db!.journalEntry.create({ data: { entryNumber: `PKG-OPEN-${randomUUID()}`, entryDate: new Date(), description: 'Synthetic opening', status: 'POSTED', lines: { create: [
            { accountId: stockAccount, debit: 10000, credit: 0 }, { accountId: equityAccount, debit: 0, credit: 10000 },
        ] } } });
        await db!.location.create({ data: { id: 'own', name: 'Synthetic own', slug: 'own-packaging' } });
        await db!.inventory.create({ data: { locationId: 'own', productVariantId: 'label', quantity: 100, averageCost: 10 } });
        const first = payload(); first.quantityProduced = 10; first.packagedOutput.groups[0].quantity = 10;
        const firstRow = first.packagedOutput.groups[0].packaging[0];
        first.packagedOutput.groups[0].packaging = [{ ...firstRow, sourceLocationId: 'own', ownerCustomerId: null, quantity: 10 }, { ...firstRow, quantity: 1 }];
        await run(db!, () => ProductionExecutionService.addProductionOutput(first));
        const second = payload(); second.quantityProduced = 10; second.packagedOutput.groups[0].quantity = 10;
        second.packagedOutput.groups[0].packaging = [{ ...firstRow, sourceLocationId: 'own', ownerCustomerId: null, quantity: 30 }];
        await run(db!, () => ProductionExecutionService.addProductionOutput(second));
        const fg = await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'fg', productVariantId: 'brand-a' } } });
        expect(Number(fg.quantity)).toBe(20); expect(Number(fg.averageCost)).toBe(20);
        const owned = await db!.stockMovement.findMany({ where: { productionOrderId: 'order', companyOwned: true } });
        const movements = await db!.stockMovement.findMany({ where: { productionOrderId: 'order' } });
        const cost = (type: string) => owned.filter((move) => move.type === type).reduce((sum, move) => sum + Number(move.quantity) * Number(move.cost), 0);
        expect(cost('OUT')).toBe(400); expect(cost('IN')).toBe(400);
        const wip = await db!.journalLine.aggregate({ where: { accountId: wipAccount, journalEntry: { referenceId: { in: movements.map((move) => move.id) } } }, _sum: { debit: true, credit: true } });
        expect(Number(wip._sum.debit)).toBe(Number(wip._sum.credit));
    });
    it('kiosk output with packaging posts once on a concurrent retry and stop only closes the shell', async () => {
        const shell = await kioskShell();
        const { packagedOutput } = payload();
        const input = kioskInput(shell.id, packagedOutput);
        await run(db!, () => Promise.all([ProductionExecutionService.logRunningOutput(input), ProductionExecutionService.logRunningOutput(input)]));

        expect(await db!.productionExecution.count({ where: { clientRequestId: packagedOutput.clientRequestId } })).toBe(1);
        const outputGroups = await db!.productionOutputGroup.findMany({ select: { productVariantId: true, quantity: true } });
        expect(outputGroups.map((group) => [group.productVariantId, Number(group.quantity)])).toEqual([['brand-a', 24.7]]);
        expect(await custodyLabelStock()).toBe(90);
        expect(await orderActualQuantity()).toBe(24.7);
        const audit = await db!.auditLog.findFirstOrThrow({ where: { action: 'RECORD_PACKAGED_OUTPUT' } });
        expect(audit.userId).toBe('system');
        expect(audit.details).toContain('OP-01');

        await expect(run(db!, () => ProductionExecutionService.stopExecution({
            executionId: shell.id, quantityProduced: 1, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0, notes: '', completed: false,
        }))).rejects.toThrow('Catat hasil dan affal terakhir lewat Catat Hasil');
        await run(db!, () => ProductionExecutionService.stopExecution({
            executionId: shell.id, quantityProduced: 0, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0, notes: '', completed: false,
        }));
        expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: shell.id } })).endTime).not.toBeNull();
        expect(await orderActualQuantity()).toBe(24.7);
    });
    it('kiosk shortage rolls back everything, and the corrected resubmit with the same request id posts once', async () => {
        const shell = await kioskShell();
        const { packagedOutput } = payload();
        packagedOutput.groups[0].packaging[0].quantity = 101;
        await expect(run(db!, () => ProductionExecutionService.logRunningOutput(kioskInput(shell.id, packagedOutput, 'shift')))).rejects.toThrow();

        expect(await db!.productionExecution.count({ where: { clientRequestId: packagedOutput.clientRequestId } })).toBe(0);
        expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: shell.id } })).shiftId).toBeNull();
        expect(await db!.stockMovement.count()).toBe(0);
        expect(await custodyLabelStock()).toBe(100);
        expect(await orderActualQuantity()).toBe(0);

        packagedOutput.groups[0].packaging[0].quantity = 10;
        const corrected = kioskInput(shell.id, packagedOutput, 'shift');
        await run(db!, () => Promise.all([ProductionExecutionService.logRunningOutput(corrected), ProductionExecutionService.logRunningOutput(corrected)]));
        expect(await db!.productionExecution.count({ where: { clientRequestId: packagedOutput.clientRequestId } })).toBe(1);
        expect(await custodyLabelStock()).toBe(90);
        expect(await orderActualQuantity()).toBe(24.7);
    });
    it('voiding a kiosk output restores packaging stock and the realized quantity', async () => {
        const shell = await kioskShell();
        const { packagedOutput } = payload();
        await run(db!, () => ProductionExecutionService.logRunningOutput(kioskInput(shell.id, packagedOutput)));
        const logged = await db!.productionExecution.findUniqueOrThrow({ where: { clientRequestId: packagedOutput.clientRequestId } });
        await openCurrentFiscalPeriod();

        await run(db!, () => ProductionExecutionService.voidExecution(logged.id, actor));

        expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: logged.id } })).status).toBe('VOIDED');
        expect(await custodyLabelStock()).toBe(100);
        expect(await orderActualQuantity()).toBe(0);
    });

    it('same IDs in a second tenant do not share balances or postings', async () => {
        await seed(other!);
        await run(db!, () => ProductionExecutionService.addProductionOutput(payload()));
        expect(await other!.productionExecution.count()).toBe(0);
        expect(Number((await other!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'custody-a', productVariantId: 'label' } } })).quantity)).toBe(100);
    });
});
