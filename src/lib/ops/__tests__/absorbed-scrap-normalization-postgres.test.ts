import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { returnTestClient, verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { recordInventoryMovement } from '@/services/accounting/inventory-link-service';
import { ProductionCostService } from '@/services/production/cost-service';
import { voidProductionExecutionInTransaction } from '@/services/production/execution-void-helper';
import { recordFinishedGoodsOutput } from '@/services/production/execution-output-posting';
import type { ProductionExecutionOrder } from '@/services/production/execution-types';
import { normalizeAbsorbedScrap, scanAbsorbedScrap } from '../absorbed-scrap-normalization';
import { applyProductionCostRecovery, inspectProductionCostRecovery } from '@/services/production/cost-recovery-service';
import { previewForwardCostPeriod, startForwardCostPeriod } from '@/services/production/forward-cost-period-service';
import { availableProductionWip } from '@/services/accounting/production-wip-provenance';
import { readCostPeriod, COST_PERIOD_ACTION } from '@/services/accounting/production-cost-period';

// Synthetic only: real PostgreSQL proves the normalized legacy rows are what the
// WIP allocator, COGM and generic void already accept for post-fix automatic scrap.
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const database = connection ? decodeURIComponent(new URL(connection).pathname.slice(1)) : '';
const at = new Date('2026-01-15T03:00:00Z');
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const accounts = { raw: randomUUID(), wip: randomUUID(), output: randomUUID() };
const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    tenantContext.run(db!, () => db!.$transaction(fn, { timeout: 20000 }));

async function seed() {
    await verifyReturnTestDatabase(db!);
    await db!.$executeRaw`TRUNCATE "Product", "Location", "User", "Account", "JournalEntry", "FiscalPeriod", "SystemSequence", "AuditLog" CASCADE`;
    await db!.user.create({ data: { id: 'actor', email: 'scrap@example.invalid', password: 'synthetic-only', role: 'FINANCE' } });
    await db!.account.createMany({ data: [
        { id: accounts.raw, code: '11310', name: 'Raw', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: accounts.wip, code: '11320', name: 'WIP', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: accounts.output, code: '11325', name: 'Intermediate', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'equity', code: '32000', name: 'Equity', type: 'EQUITY', category: 'CAPITAL' },
    ] });
    await db!.location.createMany({ data: [{ id: 'loc', name: 'Synthetic', slug: 'synthetic' },
        { id: 'scrap-loc', name: 'Synthetic scrap', slug: 'scrap_warehouse', locationPurpose: 'SCRAP' }] });
    await db!.product.createMany({ data: [
        { id: 'raw', name: 'Synthetic raw', productType: 'RAW_MATERIAL', inventoryAccountId: accounts.raw, wipAccountId: accounts.wip },
        { id: 'output', name: 'Synthetic output', productType: 'INTERMEDIATE' },
        { id: 'scrap', name: 'Synthetic scrap', productType: 'SCRAP' },
    ] });
    for (const [id, productId] of [['raw', 'raw'], ['output', 'output'], ['leaf', 'scrap'], ['lump', 'scrap']]) {
        await db!.productVariant.create({ data: { id, productId, name: id, skuCode: id, primaryUnit: 'KG', standardCost: 10, price: 7000 } });
    }
    // Shared scrap stock with unknown (NULL) valuation, as observed in the legacy data.
    for (const id of ['leaf', 'lump']) await db!.inventory.create({ data: { locationId: 'scrap-loc', productVariantId: id, quantity: 30, averageCost: null } });
    // Physical stock behind the synthetic issue/output so the generic void can reverse them.
    await db!.inventory.createMany({ data: [{ locationId: 'loc', productVariantId: 'raw', quantity: 100, averageCost: 10 },
        { locationId: 'loc', productVariantId: 'output', quantity: 10, averageCost: 14 }] });
    await db!.bom.create({ data: { id: 'bom', name: 'Synthetic', productVariantId: 'output', category: 'MIXING' } });
    await db!.productionOrder.create({ data: { id: 'wo', orderNumber: 'wo', bomId: 'bom', locationId: 'loc', plannedQuantity: 100,
        actualQuantity: 0, plannedStartDate: at, status: 'IN_PROGRESS' } });
    const now = new Date();
    for (const [year, month] of [[2026, 1], [now.getUTCFullYear(), now.getUTCMonth() + 1]]) {
        if (await db!.fiscalPeriod.count({ where: { year, month } })) continue;
        await db!.fiscalPeriod.create({ data: { name: `Synthetic ${year}-${month}`, year, month, status: 'OPEN',
            startDate: new Date(Date.UTC(year, month - 1, 1)), endDate: new Date(Date.UTC(year, month, 1)) } });
    }
    await db!.journalEntry.create({ data: { entryNumber: 'OPENING', entryDate: at, status: 'POSTED', description: 'Synthetic opening', isAutoGenerated: true,
        lines: { create: [{ accountId: accounts.raw, debit: 10000 }, { accountId: 'equity', credit: 10000 }] } } });
}
async function issue(tx: Prisma.TransactionClient, value: number, createdAt = at) {
    const movement = await tx.stockMovement.create({ data: { type: 'OUT', productVariantId: 'raw', productionOrderId: 'wo', fromLocationId: 'loc',
        quantity: value / 10, cost: 10, createdAt, reference: 'Synthetic issue' } });
    await recordInventoryMovement(movement, tx);
}
async function output(tx: Prisma.TransactionClient, value: number, createdAt = at) {
    const movement = await tx.stockMovement.create({ data: { type: 'IN', productVariantId: 'output', productionOrderId: 'wo', toLocationId: 'loc',
        quantity: 10, cost: value / 10, createdAt, reference: 'Synthetic output' } });
    await recordInventoryMovement(movement, tx, { productionOutput: true });
}
/** Pre-fix shape: one fully absorbed output plus two NULL-cost, unjournaled automatic scraps. */
async function legacyOrder({ affalOnly = false, scrapOnlyBatch = false } = {}) {
    await run(async tx => {
        await issue(tx, 140); await output(tx, 140);
        await tx.productionOrder.update({ where: { id: 'wo' }, data: { actualQuantity: 10 } });
        await tx.productionExecution.create({ data: { id: 'legacy-execution', productionOrderId: 'wo', quantityProduced: 10,
            scrapProngkolQty: 2, scrapDaunQty: 2, startTime: at, endTime: at, createdAt: at } });
        if (affalOnly || scrapOnlyBatch) await tx.productionExecution.create({ data: { id: 'affal-only', productionOrderId: 'wo', quantityProduced: 0,
            scrapDaunQty: 0.5, startTime: at, endTime: at, createdAt: new Date(at.getTime() + 60000) } });
        if (scrapOnlyBatch) {
            // Its 0.5 kg material (Rp5) went entirely to scrap and stays in WIP.
            await issue(tx, 5, new Date(at.getTime() + 60100));
            await tx.stockMovement.create({ data: { id: 'legacy-affal', type: 'IN', productVariantId: 'leaf', productionOrderId: 'wo',
                quantity: 0.5, cost: null, toLocationId: 'scrap-loc', createdAt: new Date(at.getTime() + 60200), reference: 'Production Scrap: wo' } });
            await tx.scrapRecord.create({ data: { productionOrderId: 'wo', productionExecutionId: 'affal-only',
                productVariantId: 'leaf', quantity: 0.5, locationId: 'scrap-loc', recordedAt: new Date(at.getTime() + 60200) } });
        }
        for (const id of ['leaf', 'lump']) {
            await tx.stockMovement.create({ data: { id: `legacy-${id}`, type: 'IN', productVariantId: id, productionOrderId: 'wo',
                quantity: 2, cost: null, toLocationId: 'scrap-loc', createdAt: at, reference: 'Production Scrap: wo' } });
            await tx.scrapRecord.create({ data: { productionOrderId: 'wo', productionExecutionId: 'legacy-execution',
                productVariantId: id, quantity: 2, locationId: 'scrap-loc', recordedAt: at } });
        }
    });
    return { database, orderId: 'wo', orderNumber: 'wo', actorId: 'actor', reason: 'Verified synthetic full-absorption scrap', backupReference: 'synthetic-verified-backup' };
}
async function balance(accountId: string) {
    const s = await db!.journalLine.aggregate({ where: { accountId, journalEntry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } });
    return d(s._sum.debit ?? 0).minus(s._sum.credit ?? 0).toNumber();
}
const snapshot = async () => ({
    journals: await db!.journalEntry.count(), lines: await db!.journalLine.count(), movements: await db!.stockMovement.count(),
    inventories: (await db!.inventory.findMany({ orderBy: { id: 'asc' } })).map(i => [i.productVariantId, i.quantity.toString(), i.averageCost?.toString() ?? null]),
});

describe.skipIf(!db)('absorbed legacy scrap normalization PostgreSQL contract', () => {
    beforeEach(seed);
    afterAll(async () => { await db?.$disconnect(); });
    it('unblocks the next output by recording explicit zero cost, without journals, quantities or WAC changes', async () => {
        const request = await legacyOrder();
        await expect(run(async tx => { await issue(tx, 50); await output(tx, 50); })).rejects.toMatchObject({ code: 'PRODUCTION_WIP_UNRESOLVED' });
        const before = await snapshot();
        const cogm = await run(tx => ProductionCostService.calculateBatchCOGM('wo', tx));
        const [scan] = await scanAbsorbedScrap(db!, { database });
        expect(scan).toMatchObject({ orderId: 'wo', eligible: true, absorbedValue: '140', executionId: 'legacy-execution' });
        const preview = await normalizeAbsorbedScrap(db!, request);
        expect(preview.fingerprint).toBe((scan as { fingerprint: string }).fingerprint);
        expect(await snapshot()).toEqual(before); expect(await db!.auditLog.count()).toBe(0);
        const applied = await normalizeAbsorbedScrap(db!, { ...request, expectedFingerprint: preview.fingerprint }, true);
        expect(applied).toMatchObject({ changed: true });
        expect(await snapshot()).toEqual(before);
        for (const id of ['legacy-leaf', 'legacy-lump']) {
            expect(await db!.stockMovement.findUniqueOrThrow({ where: { id } })).toMatchObject({ cost: d(0), companyOwned: true, productionExecutionId: 'legacy-execution' });
        }
        expect(await run(tx => ProductionCostService.calculateBatchCOGM('wo', tx))).toBe(cogm);
        const audit = await db!.auditLog.findFirstOrThrow({ where: { action: 'NORMALIZE_ABSORBED_PRODUCTION_SCRAP' } });
        expect((audit.changes as Prisma.JsonObject).originalMovements).toHaveLength(2);
        expect(await normalizeAbsorbedScrap(db!, { ...request, expectedFingerprint: preview.fingerprint }, true)).toMatchObject({ alreadyApplied: true });
        expect(await db!.auditLog.count()).toBe(1);
        await run(async tx => { await issue(tx, 50, new Date(at.getTime() + 600000)); await output(tx, 50, new Date(at.getTime() + 600000)); });
        expect(await balance(accounts.wip)).toBe(0);
    });
    it('leaves normalized rows reversible through the generic execution void', async () => {
        const request = await legacyOrder();
        const preview = await normalizeAbsorbedScrap(db!, request);
        await normalizeAbsorbedScrap(db!, { ...request, expectedFingerprint: preview.fingerprint }, true);
        await run(tx => voidProductionExecutionInTransaction(tx, 'legacy-execution', { userId: 'actor' }));
        for (const id of ['leaf', 'lump']) {
            const stock = await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'scrap-loc', productVariantId: id } } });
            expect(stock.quantity.toNumber()).toBe(28);
        }
        expect(await db!.stockMovement.count({ where: { reversalOfId: { in: ['legacy-leaf', 'legacy-lump'] } } })).toBe(2);
        expect(await balance(accounts.wip)).toBe(0);
        expect(await balance(accounts.output)).toBe(0);
    });
    it('rolls back on audit failure and rejects a stale dry-run', async () => {
        const request = await legacyOrder();
        const preview = await normalizeAbsorbedScrap(db!, request);
        await db!.$executeRawUnsafe(`CREATE FUNCTION scrap_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
        await db!.$executeRawUnsafe('CREATE TRIGGER scrap_test_audit_guard BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION scrap_test_reject_audit()');
        try {
            await expect(normalizeAbsorbedScrap(db!, { ...request, expectedFingerprint: preview.fingerprint }, true)).rejects.toThrow('synthetic audit failure');
        } finally {
            await db!.$executeRawUnsafe('DROP TRIGGER scrap_test_audit_guard ON "AuditLog"');
            await db!.$executeRawUnsafe('DROP FUNCTION scrap_test_reject_audit()');
        }
        expect((await db!.stockMovement.findUniqueOrThrow({ where: { id: 'legacy-leaf' } })).cost).toBeNull();
        await db!.inventory.updateMany({ where: { productVariantId: 'leaf' }, data: { quantity: 31 } });
        await expect(normalizeAbsorbedScrap(db!, { ...request, expectedFingerprint: preview.fingerprint }, true)).rejects.toThrow('Data berubah');
        expect(await db!.stockMovement.count({ where: { cost: d(0) } })).toBe(0);
    });
    it('keeps a scrap-only residual in WIP so the next output absorbs it and the pool ends at zero', async () => {
        const request = await legacyOrder({ scrapOnlyBatch: true });
        await expect(normalizeAbsorbedScrap(db!, request)).rejects.toMatchObject({ code: 'AFFAL_ONLY_DEFERRED' });
        const retained = { ...request, retainScrapOnlyResidual: true };
        const preview = await normalizeAbsorbedScrap(db!, retained);
        expect(preview).toMatchObject({ mode: 'RETAIN_SCRAP_ONLY_RESIDUAL', residualValue: '5', scrapOnlyExecutionId: 'affal-only' });
        const before = await snapshot();
        await normalizeAbsorbedScrap(db!, { ...retained, expectedFingerprint: preview.fingerprint }, true);
        expect(await snapshot()).toEqual(before);
        expect(await db!.stockMovement.findUniqueOrThrow({ where: { id: 'legacy-affal' } })).toMatchObject({ cost: d(0), productionExecutionId: 'affal-only' });
        expect(await balance(accounts.wip)).toBe(5);
        // Next batch through the real output path: remaining posted WIP (5 + 50) relieves fully.
        await run(async tx => {
            await issue(tx, 50, new Date(at.getTime() + 600000));
            const order = await tx.productionOrder.update({ where: { id: 'wo' }, data: { actualQuantity: { increment: 10 } }, include: { bom: true } });
            await recordFinishedGoodsOutput({ tx, productionOrderId: 'wo', order: order as unknown as ProductionExecutionOrder, quantityProduced: 10, reference: 'Synthetic next output' });
        });
        expect(await balance(accounts.wip)).toBe(0);
        const next = await db!.stockMovement.findFirstOrThrow({ where: { reference: 'Synthetic next output' } });
        const journal = await db!.journalEntry.findFirstOrThrow({ where: { referenceId: next.id }, include: { lines: true } });
        expect(journal.lines.reduce((sum, line) => sum + Number(line.debit), 0)).toBe(55);
    });
    it('reports affal-only and other target databases instead of normalizing', async () => {
        await legacyOrder({ affalOnly: true });
        expect(await scanAbsorbedScrap(db!, { database })).toEqual([expect.objectContaining({ orderId: 'wo', eligible: false, code: 'AFFAL_ONLY_DEFERRED' })]);
        await expect(scanAbsorbedScrap(db!, { database: 'another_tenant' })).rejects.toThrow('Database');
        expect(await db!.stockMovement.count({ where: { cost: null } })).toBe(2);
    });
});

// Same CI-included PG contract, stricter web eligibility than legacy operator CLI.
describe.skipIf(!db)('web production cost recovery PostgreSQL contract', () => {
    beforeEach(seed);
    afterAll(async () => { await db?.$disconnect(); });
    const backup = { ready: () => true, save: async () => 'synthetic-readback-verified' };
    async function candidate() {
        await legacyOrder();
        await db!.inventory.updateMany({ where: { productVariantId: { in: ['leaf', 'lump'] } }, data: { quantity: 2, averageCost: 0 } });
        const inspected = await inspectProductionCostRecovery(db!, 'wo', true);
        expect(inspected.status).toBe('eligible');
        return { orderId: 'wo', fingerprint: inspected.proposal!.fingerprint, actorId: 'actor', reason: 'Synthetic verified metadata recovery' };
    }
    it('persists only metadata, verifies all financial/physical invariants and deduplicates retries', async () => {
        const input = await candidate(), before = await snapshot();
        const applied = await applyProductionCostRecovery(db!, input, backup);
        expect(applied.alreadyApplied).toBe(false); expect(await snapshot()).toEqual(before);
        expect((await run(tx => ProductionCostService.calculateRemainingOutputValuation('wo', 10, tx))).journalTotal).toBe(0);
        expect(await applyProductionCostRecovery(db!, input, backup)).toEqual({ ...applied, alreadyApplied: true });
        const audit = await db!.auditLog.findUniqueOrThrow({ where: { id: applied.auditId } });
        expect(audit.changes).toMatchObject({ webFingerprint: input.fingerprint, postconditionsVerified: true });
        expect((await inspectProductionCostRecovery(db!, 'wo', true)).status).toBe('already_applied');
    });
    it('rejects historical use/reset despite current zero WAC, and multi-output history', async () => {
        await candidate();
        await db!.stockMovement.create({ data: { type: 'OUT', productVariantId: 'leaf', fromLocationId: 'scrap-loc', quantity: 1, cost: 25, createdAt: new Date(at.getTime() - 60000) } });
        expect((await inspectProductionCostRecovery(db!, 'wo', true)).status).toBe('needs_review');
        await db!.productionExecution.create({ data: { productionOrderId: 'wo', quantityProduced: 5, startTime: at, endTime: at } });
        expect((await inspectProductionCostRecovery(db!, 'wo', true)).status).toBe('unsupported');
        expect(await db!.auditLog.count()).toBe(0);
    });
    it('rolls back metadata when atomic audit or verification fails', async () => {
        const input = await candidate();
        await db!.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_web_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'NORMALIZE_ABSORBED_PRODUCTION_SCRAP' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END $$`);
        await db!.$executeRawUnsafe(`CREATE TRIGGER reject_web_recovery_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_web_recovery_audit()`);
        try {
            await expect(applyProductionCostRecovery(db!, input, backup)).rejects.toThrow();
            expect(await db!.stockMovement.count({ where: { id: { in: ['legacy-leaf', 'legacy-lump'] }, cost: null } })).toBe(2);
            expect(await db!.auditLog.count()).toBe(0);
        } finally {
            await db!.$executeRawUnsafe('DROP TRIGGER reject_web_recovery_audit ON "AuditLog"');
            await db!.$executeRawUnsafe('DROP FUNCTION reject_web_recovery_audit()');
        }
        await db!.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_web_recovery_poststate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = 'legacy-leaf' THEN NEW.quantity = OLD.quantity + 1; END IF; RETURN NEW; END $$`);
        await db!.$executeRawUnsafe(`CREATE TRIGGER reject_web_recovery_poststate BEFORE UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION reject_web_recovery_poststate()`);
        try {
            await expect(applyProductionCostRecovery(db!, input, backup)).rejects.toThrow('Verifikasi');
            expect((await db!.stockMovement.findUniqueOrThrow({ where: { id: 'legacy-leaf' } })).quantity.toNumber()).toBe(2);
            expect(await db!.auditLog.count()).toBe(0);
        } finally {
            await db!.$executeRawUnsafe('DROP TRIGGER reject_web_recovery_poststate ON "StockMovement"');
            await db!.$executeRawUnsafe('DROP FUNCTION reject_web_recovery_poststate()');
        }
    });
    it('serializes competing apply requests; failed contender retries only the exact receipt', async () => {
        const input = await candidate();
        const results = await Promise.allSettled([applyProductionCostRecovery(db!, input, backup), applyProductionCostRecovery(db!, input, backup)]);
        expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
        expect(await db!.auditLog.count({ where: { action: 'NORMALIZE_ABSORBED_PRODUCTION_SCRAP' } })).toBe(1);
        expect((await applyProductionCostRecovery(db!, input, backup)).alreadyApplied).toBe(true);
    });
    it.each(['output', 'void', 'inventory', 'journal'] as const)('serializes or rejects concurrent %s without hiding its changes', async kind => {
        const input = await candidate();
        let signalEntered!: () => void, releaseBackup!: () => void;
        const entered = new Promise<void>(resolve => { signalEntered = resolve; });
        const released = new Promise<void>(resolve => { releaseBackup = resolve; });
        const applying = applyProductionCostRecovery(db!, input, { ready: () => true, save: async () => { signalEntered(); await released; return 'synthetic-race-backup'; } });
        await entered;
        const competing = run(async tx => {
            if (kind === 'output' || kind === 'void') await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id='wo' FOR UPDATE`;
            if (kind === 'output') {
                await issue(tx, 50, new Date(at.getTime() + 600000));
                await output(tx, 50, new Date(at.getTime() + 600000));
            } else if (kind === 'void') {
                await voidProductionExecutionInTransaction(tx, 'legacy-execution', { userId: 'actor' });
            } else if (kind === 'inventory') {
                await tx.inventory.updateMany({ where: { productVariantId: 'leaf' }, data: { averageCost: 25 } });
            } else {
                const journal = await tx.journalEntry.findFirstOrThrow({ where: { referenceId: { not: null } } });
                await tx.journalEntry.update({ where: { id: journal.id }, data: { description: 'Synthetic concurrent source review' } });
            }
        });
        releaseBackup();
        const [recovery, other] = await Promise.allSettled([applying, competing]);
        expect(recovery.status).toBe('fulfilled');
        expect(['fulfilled', 'rejected']).toContain(other.status); // PG may serialize or abort the contender.
        if (other.status === 'rejected') {
            const error = other.reason as { code?: string; meta?: { code?: string } };
            expect(error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code ?? ''))).toBe(true);
        }
        expect(await db!.auditLog.count({ where: { action: 'NORMALIZE_ABSORBED_PRODUCTION_SCRAP' } })).toBe(1);
        if (other.status === 'fulfilled' && kind === 'output') expect(await balance(accounts.wip)).toBe(0);
        if (other.status === 'fulfilled' && kind === 'void') {
            expect((await db!.productionExecution.findUniqueOrThrow({ where: { id: 'legacy-execution' } })).status).toBe('VOIDED');
            expect(await balance(accounts.wip)).toBe(0);
        }
        if (other.status === 'fulfilled' && kind === 'inventory') {
            expect((await db!.inventory.findUniqueOrThrow({ where: { locationId_productVariantId: { locationId: 'scrap-loc', productVariantId: 'leaf' } } })).averageCost?.toNumber()).toBe(25);
        }
    });
    it('blocks stale source, failed backup and wrong actor without writes', async () => {
        const input = await candidate();
        await expect(applyProductionCostRecovery(db!, input, { ready: () => false, save: backup.save })).rejects.toThrow('Cadangan');
        await expect(applyProductionCostRecovery(db!, input, { ready: () => true, save: async () => { throw new Error('synthetic storage failure'); } })).rejects.toThrow('storage failure');
        await db!.user.create({ data: { id: 'warehouse', email: 'warehouse@example.invalid', password: 'synthetic', role: 'WAREHOUSE' } });
        await expect(applyProductionCostRecovery(db!, { ...input, actorId: 'warehouse' }, backup)).rejects.toThrow('Aktor');
        await db!.productionOrder.update({ where: { id: 'wo' }, data: { plannedQuantity: 101 } });
        await expect(applyProductionCostRecovery(db!, input, backup)).rejects.toThrow('Data berubah');
        expect(await db!.auditLog.count()).toBe(0);
        expect(await db!.stockMovement.count({ where: { id: { in: ['legacy-leaf', 'legacy-lump'] }, cost: null } })).toBe(2);
    });
});

describe.skipIf(!db)('forward-only cost period PostgreSQL contract', () => {
    beforeEach(seed);
    afterAll(async () => { await db?.$disconnect(); });
    const backup = { ready: () => true, save: async () => 'verified-synthetic-period' };
    async function legacy() {
        await legacyOrder();
        // Older result underabsorbed Rp40. Preserve this original state, do not fix it.
        const out = await db!.stockMovement.findFirstOrThrow({ where: { productionOrderId: 'wo', productVariantId: 'output', type: 'IN' } });
        await db!.stockMovement.update({ where: { id: out.id }, data: { cost: 10 } });
        const j = await db!.journalEntry.findFirstOrThrow({ where: { referenceId: out.id } });
        await db!.journalLine.updateMany({ where: { journalEntryId: j.id, debit: { gt: 0 } }, data: { debit: 100 } });
        await db!.journalLine.updateMany({ where: { journalEntryId: j.id, credit: { gt: 0 } }, data: { credit: 100 } });
        const preview = await previewForwardCostPeriod(db!, 'wo');
        return { orderId: 'wo', fingerprint: preview.fingerprint, actorId: 'actor', reason: 'Preserve synthetic history; future-only cost' };
    }
    it('activates with audit only, funds next output from new material and keeps historical Rp40', async () => {
        const input = await legacy(), before = await snapshot();
        const originals = await db!.stockMovement.findMany({ orderBy: { id: 'asc' } });
        expect((await previewForwardCostPeriod(db!, 'wo')).historicalBalances).toEqual([{ accountId: accounts.wip, amount: '40.00' }]);
        await startForwardCostPeriod(db!, input, backup);
        expect(await snapshot()).toEqual(before);
        expect(await db!.stockMovement.findMany({ orderBy: { id: 'asc' } })).toEqual(originals);
        expect((await run(tx => availableProductionWip(tx, 'wo', { lock: false }))).toString()).toBe('0');
        await run(async tx => { await issue(tx, 50, new Date(at.getTime() + 600000)); await output(tx, 50, new Date(at.getTime() + 600000)); });
        expect(await balance(accounts.wip)).toBe(40);
        expect((await run(tx => availableProductionWip(tx, 'wo', { lock: false }))).toString()).toBe('0');
        expect((await startForwardCostPeriod(db!, input, backup)).alreadyApplied).toBe(true);
        await expect(run(tx => voidProductionExecutionInTransaction(tx, 'legacy-execution', { userId: 'actor' }))).rejects.toThrow('hasil sebelum batas');
        expect((await run(tx => readCostPeriod(tx, 'wo')))?.historicalBalances[0].amount).toBe('40.00');
    });
    it('voids a post-boundary result without touching frozen history', async () => {
        const input = await legacy(); await startForwardCostPeriod(db!, input, backup);
        const later = new Date(at.getTime() + 600000);
        await run(async tx => {
            await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id='wo' FOR UPDATE`;
            await tx.productionExecution.create({data:{id:'later-execution',productionOrderId:'wo',quantityProduced:10,startTime:later,endTime:later,createdAt:later}});
            await tx.productionOrder.update({where:{id:'wo'},data:{actualQuantity:20}});
            await issue(tx,50,later); await output(tx,50,later);
        });
        await run(tx => voidProductionExecutionInTransaction(tx,'later-execution',{userId:'actor'}));
        expect(await balance(accounts.wip)).toBe(40);
        expect((await run(tx => availableProductionWip(tx,'wo',{lock:false}))).toString()).toBe('0');
        expect((await db!.productionExecution.findUniqueOrThrow({where:{id:'legacy-execution'}})).status).toBe('COMPLETED');
        expect((await db!.stockMovement.findUniqueOrThrow({where:{id:'legacy-leaf'}})).cost).toBeNull();
    });
    it('serializes activation against a new output writer under the WO lock', async () => {
        const input = await legacy();
        let enter!:()=>void,release!:()=>void;
        const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
        const activating=startForwardCostPeriod(db!,input,{ready:()=>true,save:async()=>{enter();await released;return 'verified-concurrent-backup';}});
        await entered;
        const outputAttempt=run(async tx=>{
            await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id='wo' FOR UPDATE`;
            await issue(tx,50,new Date(at.getTime()+600000));await output(tx,50,new Date(at.getTime()+600000));
        });
        release();
        const [boundary,outputResult]=await Promise.allSettled([activating,outputAttempt]);
        expect(boundary.status).toBe('fulfilled');
        if(outputResult.status==='rejected'){
            const error=outputResult.reason as {code?:string;meta?:{code?:string}};
            expect(error.code==='P2034'||(error.code==='P2010'&&['40001','40P01'].includes(error.meta?.code??''))).toBe(true);
        }
        expect(await db!.auditLog.count({where:{action:COST_PERIOD_ACTION}})).toBe(1);
        expect(await balance(accounts.wip)).toBe(40);
    });
    it('rejects changed historical sources and new unfunded result', async () => {
        const input = await legacy(); await startForwardCostPeriod(db!, input, backup);
        await expect(run(tx => output(tx, 1, new Date(at.getTime() + 600000)))).rejects.toThrow('tidak cukup');
        await db!.stockMovement.update({ where: { id: 'legacy-leaf' }, data: { quantity: 3 } });
        await expect(run(tx => availableProductionWip(tx, 'wo', { lock: false }))).rejects.toThrow('historis berubah');
    });
    it('does not activate on stale preview, failed backup or audit rollback', async () => {
        const input = await legacy();
        await expect(startForwardCostPeriod(db!, { ...input, fingerprint: 'b'.repeat(64) }, backup)).rejects.toThrow('preview');
        await expect(startForwardCostPeriod(db!, input, { ready: () => false, save: backup.save })).rejects.toThrow('cadangan');
        await db!.$executeRawUnsafe(`CREATE FUNCTION period_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='START_PRODUCTION_COST_PERIOD' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
        await db!.$executeRawUnsafe('CREATE TRIGGER period_reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION period_reject_audit()');
        try { await expect(startForwardCostPeriod(db!, input, backup)).rejects.toThrow(); }
        finally { await db!.$executeRawUnsafe('DROP TRIGGER period_reject_audit ON "AuditLog"'); await db!.$executeRawUnsafe('DROP FUNCTION period_reject_audit()'); }
        expect(await db!.auditLog.count({ where: { action: COST_PERIOD_ACTION } })).toBe(0);
        expect((await db!.stockMovement.findUniqueOrThrow({ where: { id: 'legacy-leaf' } })).cost).toBeNull();
    });
    it('does not create two boundaries from concurrent activation', async () => {
        const input = await legacy();
        const results = await Promise.allSettled([startForwardCostPeriod(db!, input, backup), startForwardCostPeriod(db!, input, backup)]);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
        expect(await db!.auditLog.count({ where: { action: COST_PERIOD_ACTION } })).toBe(1);
        expect((await startForwardCostPeriod(db!, input, backup)).alreadyApplied).toBe(true);
    });
    it('rejects staged/manual material and running historical execution', async () => {
        const input = await legacy();
        const m = await db!.stockMovement.findFirstOrThrow({ where: { productionOrderId: 'wo', type: 'OUT' } });
        await db!.stockMovement.update({ where: { id: m.id }, data: { reference: 'PROD-ISSUE-synthetic' } });
        await expect(startForwardCostPeriod(db!, input, backup)).rejects.toThrow('manual');
        await db!.stockMovement.update({ where: { id: m.id }, data: { reference: 'Synthetic issue' } });
        await db!.productionExecution.update({ where: { id: 'legacy-execution' }, data: { endTime: null } });
        await expect(previewForwardCostPeriod(db!, 'wo')).rejects.toThrow('selesai');
    });
});
