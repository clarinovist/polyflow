import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { returnTestClient, verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { tenantContext } from '@/lib/core/prisma';
import { runWithActor } from '@/lib/core/actor-context';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { recordInventoryMovement } from '@/services/accounting/inventory-link-service';
import { skuInventoryBasis } from '@/services/inventory/internal-usage-accounting';
import { attributeOperationalOpening } from '../operational-opening-attribution';

// Synthetic only: proves the per-SKU restatement is balance-neutral and is the
// basis the real usage / stock-count guards then accept.
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const database = connection ? decodeURIComponent(new URL(connection).pathname.slice(1)) : '';
const actor = 'attr-actor';
const request = { database, actorId: actor, reason: 'Synthetic Finance-approved opening attribution', targetAccountCode: '1-134', clearingAccountCode: '1-199' };
const balance = async (accountId: string) => {
    const s = await db!.journalLine.aggregate({ where: { accountId, journalEntry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } });
    return new Prisma.Decimal(s._sum.debit ?? 0).minus(s._sum.credit ?? 0).toNumber();
};
async function seed() {
    await verifyReturnTestDatabase(db!);
    await db!.$executeRaw`TRUNCATE "Product", "Location", "User", "Account", "JournalEntry", "FiscalPeriod", "SystemSequence", "AuditLog" CASCADE`;
    await db!.user.create({ data: { id: actor, name: 'Synthetic finance', email: 'attr@example.invalid', password: 'synthetic-only', role: 'FINANCE' } });
    await db!.account.createMany({ data: [
        { id: 'attr-office', code: '1-134', name: 'Synthetic office stock', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'attr-suspense', code: '1-199', name: 'Synthetic suspense', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'attr-generic', code: '11300', name: 'Synthetic generic stock', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'attr-loss', code: '91100', name: 'Synthetic adjustment loss', type: 'EXPENSE', category: 'OPERATING_EXPENSE' },
        { id: 'attr-equity', code: '32000', name: 'Synthetic equity', type: 'EQUITY', category: 'CAPITAL' },
    ] });
    await db!.location.create({ data: { id: 'attr-loc', name: 'Synthetic office', slug: 'attr-office' } });
    await db!.product.create({ data: { id: 'attr-product', name: 'Synthetic office item', productType: 'OPERATIONAL' } });
    await db!.productVariant.create({ data: { id: 'attr-note', productId: 'attr-product', name: 'Synthetic note', skuCode: 'ATTR-NOTE', primaryUnit: 'PCS' } });
    await db!.inventory.create({ data: { locationId: 'attr-loc', productVariantId: 'attr-note', quantity: 5, averageCost: 7050 } });
    // The stock sync created the opening quantity without any journal ...
    await db!.stockMovement.create({ data: { id: 'attr-opening', type: 'IN', productVariantId: 'attr-note', toLocationId: 'attr-loc',
        quantity: 5, cost: 7050, reference: 'Opening Balance - Sinkronisasi Inventory' } });
    // ... while Finance booked the value as one lump on the office stock account.
    await db!.journalEntry.create({ data: { entryNumber: 'ATTR-LUMP', entryDate: new Date(), description: 'Synthetic opening lump', status: 'POSTED',
        lines: { create: [{ accountId: 'attr-office', debit: 100000, credit: 0 }, { accountId: 'attr-equity', debit: 0, credit: 100000 }] } } });
    const [year, month] = toBusinessDateString(new Date()).split('-').map(Number);
    const bounds = getWibMonthBounds(year, month);
    await db!.fiscalPeriod.create({ data: { name: 'Synthetic current', year, month, startDate: bounds.start, endDate: bounds.end, status: 'OPEN' } });
    await db!.systemSequence.create({ data: { key: `JOURNAL_ENTRY_${year}`, value: 100 } });
}
const loss = (id: string) => tenantContext.run(db!, () => runWithActor(actor, () => db!.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({ data: { id, type: 'ADJUSTMENT', productVariantId: 'attr-note', fromLocationId: 'attr-loc', toLocationId: null, quantity: 1, reference: 'OPN-SYNTHETIC' } });
    await tx.inventory.updateMany({ where: { productVariantId: 'attr-note' }, data: { quantity: { decrement: 1 } } });
    await recordInventoryMovement(movement, tx);
})));

describe.skipIf(!db)('operational opening attribution PostgreSQL contract', () => {
    beforeEach(seed);
    afterAll(async () => { await db?.$disconnect(); });
    it('restates the lump per SKU without changing balances, then funds a stock-count loss from it', async () => {
        await expect(loss('attr-blocked')).rejects.toMatchObject({ code: 'OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS' });
        const preview = await attributeOperationalOpening(db!, request);
        expect(preview.eligible.map(r => [r.skuCode, r.amount])).toEqual([['ATTR-NOTE', '35250']]);
        expect(await db!.journalEntry.count()).toBe(1);
        const applied = await attributeOperationalOpening(db!, { ...request, expectedFingerprint: preview.fingerprint, backupReference: 'synthetic-backup' }, true);
        expect(applied.changed).toBe(true);
        expect(await balance('attr-office')).toBe(100000);
        expect(await balance('attr-suspense')).toBe(0);
        expect(Object.fromEntries([...(await db!.$transaction(tx => skuInventoryBasis(tx, 'attr-note')))].map(([k, v]) => [k, v.toNumber()]))).toEqual({ 'attr-office': 35250 });
        expect(await db!.auditLog.count({ where: { action: 'ATTRIBUTE_OPERATIONAL_OPENING_BASIS' } })).toBe(1);
        await loss('attr-count');
        const journal = await db!.journalEntry.findFirstOrThrow({ where: { referenceId: 'attr-count' }, include: { lines: true } });
        expect(journal.lines.map(l => [l.accountId, Number(l.debit), Number(l.credit)])).toEqual(expect.arrayContaining([['attr-loss', 7050, 0], ['attr-office', 0, 7050]]));
        const again = await attributeOperationalOpening(db!, request);
        expect(again.eligible).toEqual([]);
    });
    it('rolls back every journal when the audit insert fails and rejects a stale dry-run', async () => {
        const preview = await attributeOperationalOpening(db!, request);
        await db!.$executeRawUnsafe(`CREATE FUNCTION attr_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
        await db!.$executeRawUnsafe('CREATE TRIGGER attr_test_audit_guard BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION attr_test_reject_audit()');
        try {
            await expect(attributeOperationalOpening(db!, { ...request, expectedFingerprint: preview.fingerprint, backupReference: 'b' }, true)).rejects.toThrow('synthetic audit failure');
        } finally {
            await db!.$executeRawUnsafe('DROP TRIGGER attr_test_audit_guard ON "AuditLog"');
            await db!.$executeRawUnsafe('DROP FUNCTION attr_test_reject_audit()');
        }
        expect(await db!.journalEntry.count()).toBe(1);
        await db!.inventory.updateMany({ data: { quantity: 4 } });
        await expect(attributeOperationalOpening(db!, { ...request, expectedFingerprint: preview.fingerprint, backupReference: 'b' }, true)).rejects.toThrow('Data berubah');
    });
});
