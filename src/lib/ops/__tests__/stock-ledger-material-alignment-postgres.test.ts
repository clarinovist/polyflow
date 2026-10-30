import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementType, Prisma, type PrismaClient } from '@prisma/client';
import { returnTestClient, verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { clearAccountCache } from '@/services/accounting/account-resolver';
import {
    LEDGER_MATERIAL_ALIGN_ACTION, LEDGER_MATERIAL_ALIGN_REFERENCE,
    applyMaterialAlignment, previewMaterialAlignment, type MaterialAlignmentRequest,
} from '../stock-ledger-material-alignment';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const request: MaterialAlignmentRequest = {
    tenant: 'synthetic', database: connection ? decodeURIComponent(new URL(connection).pathname.slice(1)) : 'polyflow_return_credit_scope_test',
    offset: 'standard', expectedPairs: 2,
};

async function ledgerQuantity(client: PrismaClient, productVariantId: string, locationId: string) {
    const [inbound, outbound] = await Promise.all([
        client.stockMovement.aggregate({ where: { productVariantId, toLocationId: locationId }, _sum: { quantity: true } }),
        client.stockMovement.aggregate({ where: { productVariantId, fromLocationId: locationId }, _sum: { quantity: true } }),
    ]);
    return (inbound._sum.quantity ?? new Prisma.Decimal(0)).minus(outbound._sum.quantity ?? 0);
}

async function snapshot(client: PrismaClient) {
    return {
        inventory: await client.inventory.findMany({ orderBy: { id: 'asc' } }),
        movements: await client.stockMovement.findMany({ orderBy: { id: 'asc' } }),
        journals: await client.journalEntry.findMany({ orderBy: { id: 'asc' }, include: { lines: { orderBy: { id: 'asc' } } } }),
        audits: await client.auditLog.findMany({ orderBy: { id: 'asc' } }),
        sequences: await client.systemSequence.findMany({ orderBy: { key: 'asc' } }),
    };
}

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    clearAccountCache();
    await client.$executeRaw`TRUNCATE "Product", "Location", "User", "Account", "JournalEntry", "FiscalPeriod", "SystemSequence", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'system', email: 'material-align@example.invalid', password: 'synthetic-only', role: 'ADMIN' } });
    await client.account.createMany({ data: [
        { id: 'inventory', code: '1-130', name: 'Synthetic Inventory', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'gain', code: '7-103', name: 'Synthetic Gain', type: 'REVENUE', category: 'OTHER_REVENUE' },
        { id: 'loss', code: '8-203', name: 'Synthetic Loss', type: 'EXPENSE', category: 'OTHER_EXPENSE' },
        { id: 'equity', code: '3-200', name: 'Synthetic Equity', type: 'EQUITY', category: 'CAPITAL' },
        { id: 'custom-inventory', code: '1-139', name: 'Synthetic Custom Inventory', type: 'ASSET', category: 'CURRENT_ASSET' },
    ] });
    await client.location.createMany({ data: [
        { id: 'loc-a', name: 'Synthetic Warehouse A', slug: 'material-test-a' },
        { id: 'loc-b', name: 'Synthetic Warehouse B', slug: 'material-test-b' },
    ] });
    await client.product.createMany({ data: [
        { id: 'product', name: 'Synthetic Material', productType: 'RAW_MATERIAL' },
        { id: 'custom-product', name: 'Synthetic Override Material', productType: 'RAW_MATERIAL', inventoryAccountId: 'custom-inventory' },
    ] });
    await client.productVariant.createMany({ data: [
        { id: 'var-in', productId: 'product', name: 'Synthetic In', skuCode: 'SYN-IN', primaryUnit: 'KG' },
        { id: 'var-out', productId: 'custom-product', name: 'Synthetic Out', skuCode: 'SYN-OUT', primaryUnit: 'KG' },
        { id: 'var-round', productId: 'product', name: 'Synthetic Rounding', skuCode: 'SYN-ROUND', primaryUnit: 'KG' },
    ] });
    await client.inventory.createMany({ data: [
        { id: 'inv-in', productVariantId: 'var-in', locationId: 'loc-a', quantity: '12.3456', averageCost: '3.3350' },
        { id: 'inv-out', productVariantId: 'var-out', locationId: 'loc-b', quantity: '4', averageCost: '2.6750' },
        { id: 'inv-round', productVariantId: 'var-round', locationId: 'loc-a', quantity: '20.0099', averageCost: null },
    ] });
    await client.stockMovement.createMany({ data: [
        { id: 'seed-in', type: MovementType.PURCHASE, productVariantId: 'var-in', toLocationId: 'loc-a', quantity: '10', cost: '3.3350', reference: 'SYN-OPENING' },
        { id: 'seed-out', type: MovementType.PURCHASE, productVariantId: 'var-out', toLocationId: 'loc-b', quantity: '5', cost: '2.6750', reference: 'SYN-OPENING' },
        { id: 'seed-round', type: MovementType.PURCHASE, productVariantId: 'var-round', toLocationId: 'loc-a', quantity: '20', cost: null, reference: 'SYN-OPENING' },
    ] });
    await client.journalEntry.create({ data: {
        id: 'opening', entryNumber: 'SYN-OPENING', entryDate: new Date(), description: 'Synthetic opening journal', status: 'POSTED',
        lines: { create: [
            { accountId: 'inventory', debit: 100, credit: 0 },
            { accountId: 'custom-inventory', debit: 100, credit: 0 },
            { accountId: 'equity', debit: 0, credit: 200 },
        ] },
    } });
    const [year, month] = toBusinessDateString(new Date()).split('-').map(Number);
    const bounds = getWibMonthBounds(year, month);
    await client.fiscalPeriod.create({ data: { name: 'Synthetic Current', year, month, startDate: bounds.start, endDate: bounds.end, status: 'OPEN' } });
    await client.systemSequence.create({ data: { key: `JOURNAL_ENTRY_${year}`, value: 100 } });
}

describe.skipIf(!db)('stock ledger material alignment PostgreSQL contracts', () => {
    beforeEach(async () => { await seed(db!); });
    afterAll(async () => { clearAccountCache(); await db?.$disconnect(); });

    it.each(['standard', 'reduce-loss'] as const)('dry-run is read-only; %s aligns only material pairs, posts correct journals, preserves Inventory, dedupes and reruns without writes', async offset => {
        const input = { ...request, offset };
        const before = await snapshot(db!);
        const preview = await previewMaterialAlignment(db!, input);
        expect(await snapshot(db!)).toEqual(before);
        expect(preview).toMatchObject({ offset, roundingCount: 1, totalIncrease: '7.82', totalDecrease: '2.68', totalNet: '5.14' });
        expect(preview.candidates.map(c => [c.skuCode, c.diff, c.amount, c.debitAccount.code, c.creditAccount.code])).toEqual([
            ['SYN-IN', '2.3456', '7.82', '1-130', offset === 'standard' ? '7-103' : '8-203'],
            ['SYN-OUT', '-1', '2.68', '8-203', '1-139'],
        ]);
        const backup = vi.fn(async () => {
            // A separate connection sees no changes before the host backup succeeds.
            expect(await snapshot(db!)).toEqual(before);
            return 'synthetic-host-backup#sha256=verified';
        });
        const applied = await applyMaterialAlignment(db!, { ...input, fingerprint: preview.fingerprint }, backup);
        expect(backup).toHaveBeenCalledExactlyOnceWith(preview, preview.fingerprint);
        expect(applied.movementIds).toHaveLength(2);
        expect(applied.journalIds).toHaveLength(2);
        const after = await snapshot(db!);
        expect(after.inventory).toEqual(before.inventory);
        expect(after.movements.filter(m => m.reference !== LEDGER_MATERIAL_ALIGN_REFERENCE)).toEqual(before.movements);
        const movements = after.movements.filter(m => m.reference === LEDGER_MATERIAL_ALIGN_REFERENCE)
            .sort((a, b) => a.productVariantId.localeCompare(b.productVariantId));
        expect(movements.map(m => [m.type, m.productVariantId, m.fromLocationId, m.toLocationId, m.quantity.toFixed(4), m.cost?.toFixed(4), m.createdById])).toEqual([
            ['ADJUSTMENT', 'var-in', null, 'loc-a', '2.3456', '3.3350', 'system'],
            ['ADJUSTMENT', 'var-out', 'loc-b', null, '1.0000', '2.6750', 'system'],
        ]);
        const journals = after.journals.filter(j => applied.journalIds.includes(j.id));
        expect(journals).toHaveLength(2);
        for (const journal of journals) {
            const movement = movements.find(m => m.id === journal.referenceId)!;
            const candidate = preview.candidates.find(c => c.productVariantId === movement.productVariantId)!;
            expect(journal).toMatchObject({ referenceType: 'STOCK_ADJUSTMENT', reference: LEDGER_MATERIAL_ALIGN_REFERENCE,
                status: 'POSTED', isAutoGenerated: true, createdById: 'system', entryDate: movement.createdAt });
            expect(journal.lines).toHaveLength(2);
            expect(journal.lines.find(l => l.accountId === candidate.debitAccount.id)).toMatchObject({ debit: new Prisma.Decimal(candidate.amount), credit: new Prisma.Decimal(0) });
            expect(journal.lines.find(l => l.accountId === candidate.creditAccount.id)).toMatchObject({ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(candidate.amount) });
            expect(journal.lines.reduce((sum, l) => sum.plus(l.debit).minus(l.credit), new Prisma.Decimal(0)).isZero()).toBe(true);
        }
        expect((await ledgerQuantity(db!, 'var-in', 'loc-a')).toFixed(4)).toBe('12.3456');
        expect((await ledgerQuantity(db!, 'var-out', 'loc-b')).toFixed(4)).toBe('4.0000');
        expect((await ledgerQuantity(db!, 'var-round', 'loc-a')).toFixed(4)).toBe('20.0000');
        expect(after.audits).toHaveLength(1);
        expect(after.audits[0]).toMatchObject({ action: LEDGER_MATERIAL_ALIGN_ACTION,
            dedupeKey: `${LEDGER_MATERIAL_ALIGN_ACTION}:${preview.fingerprint}`, userId: 'system',
            changes: expect.objectContaining({ offset, backupReference: 'synthetic-host-backup#sha256=verified',
                movementIds: applied.movementIds, journalIds: applied.journalIds, candidates: preview.candidates }),
        });
        const unused = vi.fn();
        await expect(applyMaterialAlignment(db!, { ...input, fingerprint: preview.fingerprint }, unused)).rejects.toThrow('Expected 2');
        const cleanInput = { ...input, expectedPairs: 0 };
        const clean = await previewMaterialAlignment(db!, cleanInput);
        expect(clean.candidates).toEqual([]);
        expect(clean.roundingCount).toBe(1);
        expect((await applyMaterialAlignment(db!, { ...cleanInput, fingerprint: clean.fingerprint }, unused)).alreadyClean).toBe(true);
        expect(unused).not.toHaveBeenCalled();
        expect(await snapshot(db!)).toEqual(after);
    });

    it('rejects stale costs, quantities, account mappings or offset without writing', async () => {
        const preview = await previewMaterialAlignment(db!, request);
        const backup = vi.fn();
        await db!.inventory.update({ where: { id: 'inv-in' }, data: { averageCost: '3.336' } });
        const afterExternalChange = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('Fingerprint');
        expect(await snapshot(db!)).toEqual(afterExternalChange);
        await db!.inventory.update({ where: { id: 'inv-in' }, data: { averageCost: '3.335', quantity: '12.3457' } });
        const afterQuantity = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('Fingerprint');
        expect(await snapshot(db!)).toEqual(afterQuantity);
        await db!.inventory.update({ where: { id: 'inv-in' }, data: { quantity: '12.3456' } });
        await db!.product.update({ where: { id: 'product' }, data: { inventoryAccountId: 'custom-inventory' } });
        const afterMapping = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('Fingerprint');
        expect(await snapshot(db!)).toEqual(afterMapping);
        await db!.product.update({ where: { id: 'product' }, data: { inventoryAccountId: null } });
        const beforeOffset = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, offset: 'reduce-loss', fingerprint: preview.fingerprint }, backup)).rejects.toThrow('Fingerprint');
        expect(await snapshot(db!)).toEqual(beforeOffset);
        expect(backup).not.toHaveBeenCalled();
    });

    it.each([null, '0'])('rejects a material pair without positive location WAC (%s), leaving no writes', async averageCost => {
        await db!.inventory.update({ where: { id: 'inv-in' }, data: { averageCost } });
        const before = await snapshot(db!);
        await expect(previewMaterialAlignment(db!, request)).rejects.toThrow('averageCost must be positive');
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: 'a'.repeat(64) }, vi.fn())).rejects.toThrow('averageCost must be positive');
        expect(await snapshot(db!)).toEqual(before);
    });

    it('rejects a ledger-only pair with no Inventory cost basis instead of silently excluding it', async () => {
        await db!.inventory.delete({ where: { id: 'inv-in' } });
        const before = await snapshot(db!);
        await expect(previewMaterialAlignment(db!, request)).rejects.toThrow('averageCost must be positive');
        expect(await snapshot(db!)).toEqual(before);
    });

    it('rejects missing/closed fiscal period before backup or writes', async () => {
        const preview = await previewMaterialAlignment(db!, request);
        await db!.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        const before = await snapshot(db!);
        const backup = vi.fn();
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('periode fiskal');
        expect(await snapshot(db!)).toEqual(before);
        await db!.fiscalPeriod.deleteMany();
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('periode fiskal');
        expect(backup).not.toHaveBeenCalled();
        expect(await snapshot(db!)).toEqual(before);
    });

    it('backup failure prevents any database writes', async () => {
        const preview = await previewMaterialAlignment(db!, request);
        const before = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, async () => {
            throw new Error('Synthetic host backup failure');
        })).rejects.toThrow('host backup failure');
        expect(await snapshot(db!)).toEqual(before);
    });

    it('rolls back real movements, journals and sequences when final verification detects even a sub-cent residual', async () => {
        const preview = await previewMaterialAlignment(db!, request);
        const before = await snapshot(db!);
        let written = 0;
        // Fault injection changes an actual INSERT on the same PostgreSQL transaction;
        // all reads, posting and rollback still use the real DB, not a fake tx.
        const faulty = db!.$extends({ query: { stockMovement: { async create({ args, query }) {
            if (args.data.reference === LEDGER_MATERIAL_ALIGN_REFERENCE) {
                args.data.quantity = new Prisma.Decimal(String(args.data.quantity)).minus('0.0001');
                written++;
            }
            return query(args);
        } } } });
        await expect(applyMaterialAlignment(faulty as unknown as PrismaClient,
            { ...request, fingerprint: preview.fingerprint }, async () => 'synthetic-backup')).rejects.toThrow('Postcondition');
        expect(written).toBe(2);
        expect(await snapshot(db!)).toEqual(before);
    });

    it('rolls back movements and journals when the audit dedupe key is already used', async () => {
        const preview = await previewMaterialAlignment(db!, request);
        await db!.auditLog.create({ data: { userId: 'system', action: LEDGER_MATERIAL_ALIGN_ACTION, entityType: 'StockMovement',
            entityId: preview.fingerprint, dedupeKey: `${LEDGER_MATERIAL_ALIGN_ACTION}:${preview.fingerprint}` } });
        const before = await snapshot(db!);
        await expect(applyMaterialAlignment(db!, { ...request, fingerprint: preview.fingerprint }, async () => 'synthetic-backup')).rejects.toThrow();
        expect(await snapshot(db!)).toEqual(before);
    });
});
