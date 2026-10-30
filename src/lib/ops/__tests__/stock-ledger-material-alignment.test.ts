import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementType, Prisma, type PrismaClient } from '@prisma/client';
import { tenantContext } from '@/lib/core/prisma';
import { resolveAccountCode } from '@/services/accounting/account-mapping-policy';
import { createJournalEntry } from '@/services/accounting/journal-posting';
import { isPeriodOpen } from '@/services/accounting/periods-service';
import {
    LEDGER_MATERIAL_ALIGN_ACTION, LEDGER_MATERIAL_ALIGN_REFERENCE,
    applyMaterialAlignment, parseMaterialAlignmentRequest, previewMaterialAlignment,
    type MaterialAlignmentRequest,
} from '../stock-ledger-material-alignment';
import { parseMaterialAlignmentArgs } from '../../../../scripts/align-stock-ledger-material';

vi.mock('@/services/accounting/account-mapping-policy', () => ({ resolveAccountCode: vi.fn() }));
vi.mock('@/services/accounting/journal-posting', () => ({ createJournalEntry: vi.fn() }));
vi.mock('@/services/accounting/periods-service', () => ({ isPeriodOpen: vi.fn() }));

const input: MaterialAlignmentRequest = { tenant: 'synthetic', database: 'synthetic_test', offset: 'standard', expectedPairs: 2 };
const accounts = {
    inventory: { id: 'inventory', code: '1-130', isActive: true, type: 'ASSET' },
    'adjustment-gain': { id: 'gain', code: '7-103', isActive: true, type: 'REVENUE' },
    'adjustment-loss': { id: 'loss', code: '8-203', isActive: true, type: 'EXPENSE' },
};
const pairs = () => [
    { productVariantId: 'in', skuCode: 'SYN-IN', locationId: 'a', locationName: 'Synthetic A', live: '12.3456', ledger: '10', averageCost: '3.3350' as string | null, productType: 'RAW_MATERIAL', inventoryAccountId: null as string | null },
    { productVariantId: 'out', skuCode: 'SYN-OUT', locationId: 'b', locationName: 'Synthetic B', live: '4', ledger: '5', averageCost: '2.675', productType: 'RAW_MATERIAL', inventoryAccountId: null },
    { productVariantId: 'round', skuCode: 'SYN-ROUND', locationId: 'a', locationName: 'Synthetic A', live: '20.0099', ledger: '20', averageCost: null, productType: 'RAW_MATERIAL', inventoryAccountId: null },
    { productVariantId: 'clean', skuCode: 'SYN-CLEAN', locationId: 'a', locationName: 'Synthetic A', live: '15', ledger: '15', averageCost: null, productType: 'RAW_MATERIAL', inventoryAccountId: null },
];

function fixture(initial = pairs()) {
    const state = initial.map(row => ({ ...row }));
    const inventoryRows = () => state.map(row => ({
        id: `inv-${row.productVariantId}`, productVariantId: row.productVariantId, locationId: row.locationId,
        quantity: new Prisma.Decimal(row.live), averageCost: row.averageCost === null ? null : new Prisma.Decimal(row.averageCost),
    }));
    const tx = {
        $executeRaw: vi.fn(async () => 0),
        $queryRaw: vi.fn(async (query: Prisma.Sql | TemplateStringsArray) => {
            const sql = ('strings' in query ? query.strings : query).join(' ');
            if (sql.includes('current_database')) return [{ name: input.database }];
            if (sql.includes('FOR UPDATE')) return inventoryRows().filter(row => row.productVariantId === 'in' || row.productVariantId === 'out')
                .map(row => ({ ...row, quantity: row.quantity.toString(), averageCost: row.averageCost?.toString() ?? null }));
            return state.filter(row => !new Prisma.Decimal(row.live).equals(row.ledger)).map(row => ({ ...row }));
        }),
        account: { findUnique: vi.fn(async ({ where }: { where: { id?: string; code?: string } }) =>
            Object.values(accounts).find(account => where.id ? account.id === where.id : account.code === where.code) ?? null) },
        user: { findUnique: vi.fn(async () => ({ id: 'system' })) },
        stockMovement: { create: vi.fn(async ({ data }: { data: Prisma.StockMovementUncheckedCreateInput }) => {
            const target = state.find(row => row.productVariantId === data.productVariantId && row.locationId === (data.toLocationId ?? data.fromLocationId))!;
            const quantity = new Prisma.Decimal(String(data.quantity));
            target.ledger = new Prisma.Decimal(target.ledger).plus(data.toLocationId ? quantity : quantity.negated()).toString();
            return { ...data, id: `movement-${data.productVariantId}` };
        }) },
        inventory: {
            update: vi.fn(), updateMany: vi.fn(),
            findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => inventoryRows().filter(row => where.id.in.includes(row.id))),
        },
        journalLine: { aggregate: vi.fn(async () => ({ _sum: { debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0) } })) },
        auditLog: { create: vi.fn(async () => ({ id: 'audit' })) },
    };
    const db = { $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
    return { state, tx, db: db as unknown as PrismaClient, transaction: db.$transaction };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAccountCode).mockImplementation(async (_type, role) => {
        const account = accounts[role as keyof typeof accounts];
        return { id: account.id, code: account.code, name: 'Synthetic account' };
    });
    vi.mocked(createJournalEntry).mockImplementation(async data => ({ id: `journal-${data.referenceId}` }) as never);
    vi.mocked(isPeriodOpen).mockResolvedValue(true);
});

describe('material alignment input and CLI guards', () => {
    it('accepts exact schema and requires reviewed fingerprint on execution', () => {
        expect(parseMaterialAlignmentRequest(input, false)).toEqual(input);
        expect(() => parseMaterialAlignmentRequest(input, true)).toThrow('fingerprint');
        expect(parseMaterialAlignmentRequest({ ...input, fingerprint: 'a'.repeat(64) }, true).fingerprint).toHaveLength(64);
        for (const patch of [ { tenant: '../bad' }, { database: 'bad-db' }, { offset: 'unknown' },
            { expectedPairs: -1 }, { expectedPairs: 1.5 }, { expectedPairs: '2' }, { fingerprint: 'bad' }, { extra: true } ])
            expect(() => parseMaterialAlignmentRequest({ ...input, ...patch }, false)).toThrow('Invalid');
    });
    it('requires one absolute input and paired explicit execute/yes, rejecting duplicate flags', () => {
        expect(parseMaterialAlignmentArgs(['--input=/tmp/synthetic.json'])).toEqual({ path: '/tmp/synthetic.json', execute: false });
        expect(parseMaterialAlignmentArgs(['--yes', '--input=/tmp/synthetic.json', '--execute']).execute).toBe(true);
        for (const args of [ [], ['--input=relative.json'], ['--input=/tmp/a', '--execute'], ['--input=/tmp/a', '--yes'],
            ['--input=/tmp/a', '--unknown'], ['--input=/tmp/a', '--input=/tmp/b'], ['--input=/tmp/a', '--execute', '--yes', '--yes'] ])
            expect(() => parseMaterialAlignmentArgs(args)).toThrow();
    });
});

describe('previewMaterialAlignment', () => {
    it('is READ ONLY, keeps material pairs only, calculates Decimal cents/directions/totals, and resolves on tx', async () => {
        const { db, tx, transaction } = fixture();
        vi.mocked(resolveAccountCode).mockImplementation(async (_type, role) => {
            expect(tenantContext.getStore()).toBe(tx);
            const account = accounts[role as keyof typeof accounts];
            return { ...account, name: 'Synthetic account' };
        });
        const preview = await previewMaterialAlignment(db, input);
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
        expect(String(tx.$executeRaw.mock.calls[0])).toContain('READ ONLY');
        expect(preview).toMatchObject({ offset: 'standard', roundingCount: 1, totalIncrease: '7.82', totalDecrease: '2.68', totalNet: '5.14' });
        expect(preview.candidates).toEqual([
            { productVariantId: 'in', skuCode: 'SYN-IN', locationId: 'a', locationName: 'Synthetic A', live: '12.3456', ledger: '10', diff: '2.3456', averageCost: '3.335', direction: 'IN', quantity: '2.3456', amount: '7.82', debitAccount: { id: 'inventory', code: '1-130' }, creditAccount: { id: 'gain', code: '7-103' } },
            { productVariantId: 'out', skuCode: 'SYN-OUT', locationId: 'b', locationName: 'Synthetic B', live: '4', ledger: '5', diff: '-1', averageCost: '2.675', direction: 'OUT', quantity: '1', amount: '2.68', debitAccount: { id: 'loss', code: '8-203' }, creditAccount: { id: 'inventory', code: '1-130' } },
        ]);
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
        expect(createJournalEntry).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
    it.each(['0.01', '-0.01'])('includes the exact material threshold %s, not 0.0099', async diff => {
        const state = pairs();
        state[0].live = new Prisma.Decimal(10).plus(diff).toString();
        const preview = await previewMaterialAlignment(fixture(state).db, input);
        expect(preview.candidates).toHaveLength(2);
        expect(preview.candidates[0].diff).toBe(diff);
    });
    it('uses adjustment-loss on both directions in reduce-loss mode', async () => {
        const preview = await previewMaterialAlignment(fixture().db, { ...input, offset: 'reduce-loss' });
        expect(preview.candidates[0].creditAccount.id).toBe('loss');
        expect(preview.candidates[1].debitAccount.id).toBe('loss');
    });
    it('honors product inventory override instead of the role fallback', async () => {
        const state = pairs();
        state[0].inventoryAccountId = 'custom-inventory';
        const { db, tx } = fixture(state);
        tx.account.findUnique.mockImplementation(async ({ where }) => where.id === 'custom-inventory'
            ? { id: 'custom-inventory', code: '1-139', isActive: true, type: 'ASSET' }
            : Object.values(accounts).find(account => account.id === where.id) ?? null);
        expect((await previewMaterialAlignment(db, input)).candidates[0].debitAccount).toEqual({ id: 'custom-inventory', code: '1-139' });
    });
    it('accepts an inventory COA code override just like GR mappings', async () => {
        const state = pairs();
        state[0].inventoryAccountId = '1-130';
        const { db } = fixture(state);
        expect((await previewMaterialAlignment(db, input)).candidates[0].debitAccount).toEqual({ id: 'inventory', code: '1-130' });
    });
    it('has canonical fingerprints; data, cost, account or offset changes invalidate review', async () => {
        const base = await previewMaterialAlignment(fixture().db, input);
        expect((await previewMaterialAlignment(fixture(pairs().reverse()).db, input)).fingerprint).toBe(base.fingerprint);
        for (const patch of [{ live: '12.3457' }, { averageCost: '3.3349' }]) {
            const state = pairs(); Object.assign(state[0], patch);
            expect((await previewMaterialAlignment(fixture(state).db, input)).fingerprint).not.toBe(base.fingerprint);
        }
        expect((await previewMaterialAlignment(fixture().db, { ...input, offset: 'reduce-loss' })).fingerprint).not.toBe(base.fingerprint);
        const { db, tx } = fixture();
        tx.account.findUnique.mockImplementation(async ({ where }) => {
            const account = Object.values(accounts).find(a => a.id === where.id);
            return account ? { ...account, code: account.id === 'gain' ? '7-199' : account.code } : null;
        });
        expect((await previewMaterialAlignment(db, input)).fingerprint).not.toBe(base.fingerprint);
    });
    it.each([null, '0', '-1'])('rejects missing/nonpositive material averageCost %s', async averageCost => {
        const state = pairs(); state[0].averageCost = averageCost;
        await expect(previewMaterialAlignment(fixture(state).db, input)).rejects.toThrow('averageCost must be positive');
    });
    it('rejects an account used on both sides and an amount exceeding journal precision', async () => {
        const state = pairs();
        state[0].inventoryAccountId = 'gain';
        await expect(previewMaterialAlignment(fixture(state).db, input)).rejects.toThrow('accounts must differ');
        state[0].inventoryAccountId = null;
        state[0].averageCost = '99999999999';
        state[0].live = '99999999999';
        await expect(previewMaterialAlignment(fixture(state).db, input)).rejects.toThrow('supported precision');
    });
    it('rejects count, DB identity and inactive accounts before any writes', async () => {
        const { db, tx } = fixture();
        await expect(previewMaterialAlignment(db, { ...input, expectedPairs: 1 })).rejects.toThrow('Expected 1');
        await expect(previewMaterialAlignment(db, { ...input, database: 'wrong_test' })).rejects.toThrow('database differs');
        tx.account.findUnique.mockResolvedValue(null);
        await expect(previewMaterialAlignment(db, input)).rejects.toThrow('missing or inactive');
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
});

describe('applyMaterialAlignment', () => {
    it.each(['standard', 'reduce-loss'] as const)('locks, backs up before mutation, posts balanced journals and one deduped audit: %s', async offset => {
        const { db, tx, state, transaction } = fixture();
        const request = { ...input, offset };
        const before = state.map(row => ({ live: row.live, averageCost: row.averageCost }));
        const preview = await previewMaterialAlignment(db, request);
        const backup = vi.fn(async () => {
            expect(tx.stockMovement.create).not.toHaveBeenCalled();
            expect(createJournalEntry).not.toHaveBeenCalled();
            return 'synthetic-backup#sha256=verified';
        });
        const result = await applyMaterialAlignment(db, { ...request, fingerprint: preview.fingerprint }, backup);
        expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
        expect(tx.$queryRaw.mock.calls.some(([q]) => 'strings' in q && q.strings.join(' ').includes('FOR UPDATE'))).toBe(true);
        expect(backup).toHaveBeenCalledWith(preview, preview.fingerprint);
        expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
        expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
            type: MovementType.ADJUSTMENT, toLocationId: 'a', fromLocationId: null,
            quantity: new Prisma.Decimal('2.3456'), cost: new Prisma.Decimal('3.335'), reference: LEDGER_MATERIAL_ALIGN_REFERENCE,
        }) });
        expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
            fromLocationId: 'b', toLocationId: null, quantity: new Prisma.Decimal(1), cost: new Prisma.Decimal('2.675'),
        }) });
        for (const [journal, client] of vi.mocked(createJournalEntry).mock.calls) {
            expect(client).toBe(tx);
            expect(journal).toMatchObject({ status: 'POSTED', referenceType: 'STOCK_ADJUSTMENT', isAutoGenerated: true });
            expect(journal.lines[0].debit).toBe(journal.lines[1].credit);
        }
        expect(vi.mocked(createJournalEntry).mock.calls[0][0].lines[1].accountId).toBe(offset === 'standard' ? 'gain' : 'loss');
        expect(state.map(row => ({ live: row.live, averageCost: row.averageCost }))).toEqual(before);
        expect(state[0].ledger).toBe(state[0].live);
        expect(state[1].ledger).toBe(state[1].live);
        expect(state[2].ledger).toBe('20');
        expect(tx.inventory.update).not.toHaveBeenCalled();
        expect(tx.inventory.updateMany).not.toHaveBeenCalled();
        expect(tx.auditLog.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({
            userId: 'system', action: LEDGER_MATERIAL_ALIGN_ACTION, dedupeKey: `${LEDGER_MATERIAL_ALIGN_ACTION}:${preview.fingerprint}`,
            changes: expect.objectContaining({ offset, totalNet: '5.14', movementIds: result.movementIds, journalIds: result.journalIds }),
        }) });
        const cleanInput = { ...request, expectedPairs: 0 };
        const clean = await previewMaterialAlignment(db, cleanInput);
        const unused = vi.fn();
        expect((await applyMaterialAlignment(db, { ...cleanInput, fingerprint: clean.fingerprint }, unused)).alreadyClean).toBe(true);
        await expect(applyMaterialAlignment(db, { ...request, fingerprint: preview.fingerprint }, unused)).rejects.toThrow('Expected 2');
        expect(unused).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
        expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });
    it('rejects a stale fingerprint before backup or writes', async () => {
        const { db, tx, state } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        state[0].averageCost = '4';
        const backup = vi.fn();
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, backup)).rejects.toThrow('Fingerprint');
        expect(backup).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
    it('rechecks fingerprint after locking', async () => {
        const { db, tx, state } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        const query = tx.$queryRaw.getMockImplementation()!;
        tx.$queryRaw.mockImplementation(async q => {
            const result = await query(q);
            if ('strings' in q && q.strings.join(' ').includes('FOR UPDATE')) state[0].averageCost = '4';
            return result;
        });
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, vi.fn())).rejects.toThrow('Fingerprint');
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
    it.each(['backup', 'period', 'actor', 'lock'] as const)('fails before mutation when %s is unavailable', async failure => {
        const { db, tx } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        if (failure === 'period') vi.mocked(isPeriodOpen).mockResolvedValue(false);
        if (failure === 'actor') tx.user.findUnique.mockResolvedValue(null as never);
        if (failure === 'lock') {
            const query = tx.$queryRaw.getMockImplementation()!;
            tx.$queryRaw.mockImplementation(async q => 'strings' in q && q.strings.join(' ').includes('FOR UPDATE') ? [] : query(q));
        }
        const backup = vi.fn(async () => { throw new Error('Host backup failed'); });
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, backup)).rejects.toThrow();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
    it('rejects sub-cent residuals after writes, not just remaining material candidates', async () => {
        const { db, tx, state } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        const create = tx.stockMovement.create.getMockImplementation()!;
        tx.stockMovement.create.mockImplementation(async args => {
            const result = await create(args);
            state[0].ledger = new Prisma.Decimal(state[0].live).minus('0.0001').toString();
            return result;
        });
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, async () => 'backup')).rejects.toThrow('Postcondition');
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
    it('rejects Inventory changes even when a pair is still balanced', async () => {
        const { db, tx } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        const read = tx.inventory.findMany.getMockImplementation()!;
        tx.inventory.findMany.mockImplementation(async args => {
            const rows = await read(args); rows[0].averageCost = new Prisma.Decimal(99); return rows;
        });
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, async () => 'backup')).rejects.toThrow('Inventory berubah');
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
    it('does not bypass the inventory GL asset-credit guard', async () => {
        const { db, tx } = fixture();
        const preview = await previewMaterialAlignment(db, input);
        tx.journalLine.aggregate.mockResolvedValue({ _sum: { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) } });
        await expect(applyMaterialAlignment(db, { ...input, fingerprint: preview.fingerprint }, async () => 'backup')).rejects.toThrow('Saldo pembukuan');
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
});
